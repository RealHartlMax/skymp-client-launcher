//! Bounded, allowlisted crash reports. Collect locally; upload only after explicit consent.
use fs2::FileExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const ENDPOINT: &str = "https://api.skymp-worlds.net/crash-reports.php";
pub const MAX_REPORT: u64 = 1024 * 1024;
pub const MAX_DUMP: u64 = 128 * 1024 * 1024;
const MAX_LOG: u64 = 64 * 1024;
const LOCAL_LIMIT: usize = 30;

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn build_id() -> &'static str {
    option_env!("SKYMP_BUILD_ID").unwrap_or("development")
}
fn random_id() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).map_err(|_| "Secure report ID unavailable")?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn valid_id(id: &str) -> bool {
    id.len() == 32
        && id
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
pub(crate) fn sha_file(path: &Path, limit: u64) -> Option<String> {
    let file = File::open(path).ok()?;
    if file.metadata().ok()?.len() > limit {
        return None;
    }
    let mut hash = Sha256::new();
    std::io::copy(&mut file.take(limit + 1), &mut hash).ok()?;
    Some(format!("{:x}", hash.finalize()))
}

/// Fail closed for credential-bearing log lines; retain diagnostic codes and descriptions.
pub fn sanitize(text: &str) -> String {
    let secret = Regex::new(r#"(?i)(password|passwd|authorization|bearer\s|cookie|master[_-]?key|api[_-]?key|private[_-]?key|client[_-]?secret|steam[\s_-]*(?:auth[\s_-]*)?(?:ticket|session)|session[_-]?token|access[_-]?token|refresh[_-]?token|auth-data|skymp_live_|\b(?:token|ticket|session|secret|credential|key|auth)[\w-]*[\"']?\s*[:=])"#).unwrap();
    let url = Regex::new(r#"https?://[^\s<>\"']+"#).unwrap();
    let windows_user = Regex::new(
        r"(?i)[a-z]:[\\/]users[\\/][^\\/\s]+|[a-z]:[\\/]documents and settings[\\/][^\\/\s]+",
    )
    .unwrap();
    let unix_user = Regex::new(r"/(?:home|Users)/[^/\s]+").unwrap();
    let steam_id = Regex::new(r"\b7656119\d{10}\b").unwrap();
    let email = Regex::new(r"(?i)\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b").unwrap();
    text.lines()
        .take(1500)
        .map(|line| {
            if secret.is_match(line) {
                return "[credential-bearing line removed]".to_owned();
            }
            let line = url.replace_all(line, |caps: &regex::Captures| {
                reqwest::Url::parse(&caps[0])
                    .ok()
                    .map(|mut u| {
                        let _ = u.set_username("");
                        let _ = u.set_password(None);
                        u.set_query(None);
                        u.set_fragment(None);
                        // URL paths can contain opaque login/heartbeat secrets. Keep only the origin.
                        format!("{}[path removed]", u.origin().ascii_serialization() + "/")
                    })
                    .unwrap_or_else(|| "[URL removed]".into())
            });
            let line = windows_user.replace_all(&line, "%USERPROFILE%");
            let line = unix_user.replace_all(&line, "%USERPROFILE%");
            let line = steam_id.replace_all(&line, "[Steam ID removed]");
            email
                .replace_all(&line, "[email removed]")
                .chars()
                .filter(|c| !c.is_control() || *c == '\t')
                .take(2048)
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn log_tail(name: &str, path: &Path, since: u64) -> Value {
    let result = (|| -> Option<(String, bool)> {
        let mut file = File::open(path).ok()?;
        let meta = file.metadata().ok()?;
        let modified = meta
            .modified()
            .ok()?
            .duration_since(UNIX_EPOCH)
            .ok()?
            .as_secs();
        if modified.saturating_add(2) < since {
            return None;
        }
        let size = meta.len();
        let start = size.saturating_sub(MAX_LOG);
        file.seek(SeekFrom::Start(start)).ok()?;
        let mut bytes = Vec::new();
        file.take(MAX_LOG).read_to_end(&mut bytes).ok()?;
        let decoded = if bytes.starts_with(&[0xff, 0xfe]) {
            String::from_utf16_lossy(
                &bytes[2..]
                    .chunks_exact(2)
                    .map(|c| u16::from_le_bytes([c[0], c[1]]))
                    .collect::<Vec<_>>(),
            )
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        };
        let tail = if start > 0 {
            decoded.split_once('\n').map(|v| v.1).unwrap_or("")
        } else {
            &decoded
        };
        Some((sanitize(tail), start > 0))
    })();
    match result {
        Some((contents, truncated)) => {
            json!({"name":name,"available":true,"truncated":truncated,"contents":contents})
        }
        None => json!({"name":name,"available":false,"truncated":false,"contents":""}),
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct ReportContext {
    #[serde(default)]
    pub target: String,
    pub game: PathBuf,
    pub profile: PathBuf,
    pub server_id: Option<String>,
    pub operation_id: String,
    pub verified_files: usize,
    pub game_version: String,
    pub skse_version: String,
    pub runtime_manifest_sha256: Option<String>,
    pub load_order: Vec<String>,
    pub started: u64,
    pub id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalReport {
    pub id: String,
    pub report: Value,
    pub dismissed: bool,
    pub consented: bool,
    pub dump_consented: bool,
    pub server_report_id: Option<String>,
    pub upload_token: Option<String>,
    pub dump_uploaded: bool,
    pub state: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportSummary {
    pub id: String,
    pub event_kind: String,
    pub occurred_at_unix: u64,
    pub exit_code: Option<String>,
    pub bytes: usize,
    pub dump_bytes: u64,
    pub state: String,
    pub server_report_id: Option<String>,
    pub preview: Value,
}

#[derive(Clone)]
pub struct CrashReports {
    root: PathBuf,
    launcher_log: PathBuf,
    context: Arc<Mutex<Option<ReportContext>>>,
    lock: Arc<Mutex<()>>,
    upload_lock: Arc<Mutex<()>>,
}

fn atomic_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid report directory")?;
    fs::create_dir_all(parent).map_err(|_| "Report directory unavailable")?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|_| "Cannot create report")?;
    serde_json::to_writer_pretty(&mut temporary, value).map_err(|_| "Cannot encode report")?;
    temporary.flush().map_err(|_| "Cannot write report")?;
    temporary.persist(path).map_err(|_| "Cannot save report")?;
    Ok(())
}

impl CrashReports {
    pub fn new(root: PathBuf, launcher_log: PathBuf) -> Self {
        Self {
            root,
            launcher_log,
            context: Arc::new(Mutex::new(None)),
            lock: Arc::new(Mutex::new(())),
            upload_lock: Arc::new(Mutex::new(())),
        }
    }
    fn directory(&self, id: &str) -> Result<PathBuf, String> {
        if !valid_id(id) {
            return Err("Invalid report ID".into());
        }
        Ok(self.root.join("reports").join(id))
    }
    pub fn capture_enabled(&self) -> bool {
        fs::read(self.root.join("settings.json"))
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            .and_then(|v| v["captureMinidumps"].as_bool())
            .unwrap_or(false)
    }
    pub fn set_capture_enabled(&self, enabled: bool) -> Result<(), String> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut settings = self.settings();
        settings["captureMinidumps"] = json!(enabled);
        atomic_json(&self.root.join("settings.json"), &settings)
    }
    fn settings(&self) -> Value {
        fs::read(self.root.join("settings.json"))
            .ok()
            .filter(|b| b.len() < 4096)
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}))
    }
    pub fn set_language(&self, language: &str) -> Result<(), String> {
        if !["de", "en", "ru"].contains(&language) {
            return Err("Invalid report language".into());
        }
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut settings = self.settings();
        settings["language"] = json!(language);
        atomic_json(&self.root.join("settings.json"), &settings)
    }
    pub fn begin_game(&self, mut context: ReportContext) -> Result<(), String> {
        self.prune_local()?;
        context.id = random_id()?;
        context.target = "game".into();
        context.started = now();
        let dir = self.directory(&context.id)?;
        fs::create_dir_all(&dir).map_err(|_| "Cannot initialize crash report")?;
        atomic_json(&dir.join("session.json"), &context)?;
        *self.context.lock().unwrap_or_else(|e| e.into_inner()) = Some(context);
        Ok(())
    }
    pub fn attach_game(&self, pid: u32) {
        if !self.capture_enabled() {
            return;
        }
        if let Some(context) = self
            .context
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
        {
            if let Ok(dir) = self.directory(&context.id) {
                let _ = crate::crash_capture::spawn(pid, &dir, "SkyrimSE.exe");
            }
        }
    }
    pub fn finish_game(&self, status: &crate::game_session::GameStatus) -> Option<ReportSummary> {
        if !["exited", "exitedEarly"].contains(&status.phase.as_str()) {
            return None;
        }
        let context = self
            .context
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()?;
        if context.operation_id != status.operation_id {
            return None;
        }
        // A user closing Skyrim normally is not a crash, even immediately after startup.
        if status.exit_code == Some(0) {
            let _ = self.remove_local(&context.id);
            return None;
        }
        let kind = if status.exit_code.is_some() {
            "gameCrash"
        } else {
            "gameExitUnknown"
        };
        self.collect(&context, kind, status.exit_code, status.elapsed_seconds)
            .ok()
    }
    fn collect(
        &self,
        context: &ReportContext,
        kind: &str,
        code: Option<u32>,
        seconds: u64,
    ) -> Result<ReportSummary, String> {
        let dir = self.directory(&context.id)?;
        let native = fs::read(dir.join("exception.json"))
            .ok()
            .filter(|v| v.len() < 65536)
            .and_then(|v| serde_json::from_slice::<Value>(&v).ok());
        let mut binaries = Vec::new();
        for relative in [
            "SkyrimSE.exe",
            "skse64_loader.exe",
            "Data/SKSE/Plugins/SkyrimPlatform.dll",
            "Data/SKSE/Plugins/MpClientPlugin.dll",
            "Data/Platform/Distribution/RuntimeDependencies/SkyrimPlatformImpl.dll",
        ] {
            if context.game.as_os_str().is_empty() {
                break;
            }
            let file = context.game.join(relative);
            if !file.is_file() {
                continue;
            }
            let version = crate::runtime_version::read(&file)
                .ok()
                .map(crate::runtime_version::display);
            binaries.push(json!({"name":relative,"sha256":sha_file(&file,128*1024*1024),"version":version,"source":"installed"}));
        }
        let documents = documents_skse();
        let occurred = native
            .as_ref()
            .and_then(|v| v["capturedAtUnix"].as_u64())
            .unwrap_or_else(now);
        let mut report = json!({
            "schemaVersion":1,"clientReportId":context.id,"occurredAtUnix":occurred,"eventKind":kind,"language":self.settings()["language"].as_str().unwrap_or("unknown"),
            "launcher":{"version":env!("CARGO_PKG_VERSION"),"buildId":build_id()},
            "game":{"version":context.game_version,"skseVersion":context.skse_version,"runtimeManifestSha256":context.runtime_manifest_sha256,"verifiedFiles":context.verified_files,"loadOrder":context.load_order.iter().take(512).map(|s|sanitize(s)).collect::<Vec<_>>()},
            "serverId":context.server_id,
            "crash":{"exitCode":code.map(|v|format!("0x{v:08X}")),"native":native},
            "timeline":{"startedAtUnix":context.started,"elapsedSeconds":seconds,"lastConfirmedPhase":if kind=="gameCrash" || kind=="gameExitUnknown" {"gameProcessStarted"} else {"launcherRunning"}},
            "environment":environment(),"binaries":binaries,
            "logs":[log_tail("launcher.log",&self.launcher_log,context.started),log_tail("skse64_loader.log",&documents.join("skse64_loader.log"),context.started),log_tail("skse64.log",&documents.join("skse64.log"),context.started),log_tail("skyrim-platform.log",&documents.join("skyrim-platform.log"),context.started),log_tail("SkyrimPlatformImpl.log",&documents.join("SkyrimPlatformImpl.log"),context.started)],
            "comment":"","contact":""
        });
        if serde_json::to_vec(&report)
            .map_err(|_| "Cannot encode report")?
            .len()
            > MAX_REPORT as usize
        {
            // Retain the incident even if unusually encoded logs expand when JSON-escaped.
            for log in report["logs"].as_array_mut().unwrap() {
                let text = log["contents"]
                    .as_str()
                    .unwrap_or("")
                    .chars()
                    .take(8192)
                    .collect::<String>();
                log["contents"] = json!(text);
                log["truncated"] = json!(true);
            }
        }
        if serde_json::to_vec(&report)
            .map_err(|_| "Cannot encode report")?
            .len()
            > MAX_REPORT as usize
        {
            return Err("Report exceeds size limit".into());
        }
        let local = LocalReport {
            id: context.id.clone(),
            report,
            dismissed: false,
            consented: false,
            dump_consented: false,
            server_report_id: None,
            upload_token: None,
            dump_uploaded: false,
            state: "draft".into(),
        };
        atomic_json(&dir.join("record.json"), &local)?;
        self.summary(&local)
    }
    fn load(&self, id: &str) -> Result<LocalReport, String> {
        let file =
            File::open(self.directory(id)?.join("record.json")).map_err(|_| "Report not found")?;
        if file.metadata().map_err(|_| "Report unavailable")?.len() > MAX_REPORT + 65536 {
            return Err("Invalid local report".into());
        }
        let report: LocalReport =
            serde_json::from_reader(file).map_err(|_| "Invalid local report")?;
        if report.id != id {
            return Err("Report ID mismatch".into());
        }
        Ok(report)
    }
    fn summary(&self, local: &LocalReport) -> Result<ReportSummary, String> {
        Ok(ReportSummary {
            id: local.id.clone(),
            event_kind: local.report["eventKind"]
                .as_str()
                .unwrap_or("unknown")
                .into(),
            occurred_at_unix: local.report["occurredAtUnix"].as_u64().unwrap_or(0),
            exit_code: local.report["crash"]["exitCode"]
                .as_str()
                .map(str::to_owned),
            bytes: serde_json::to_vec(&local.report)
                .map_err(|_| "Invalid report")?
                .len(),
            dump_bytes: fs::metadata(self.directory(&local.id)?.join("crash.dmp"))
                .map(|m| m.len())
                .unwrap_or(0),
            state: local.state.clone(),
            server_report_id: local.server_report_id.clone(),
            preview: local.report.clone(),
        })
    }
    pub fn list(&self) -> Result<Vec<ReportSummary>, String> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut reports = Vec::new();
        if let Ok(entries) = fs::read_dir(self.root.join("reports")) {
            for entry in entries.flatten().take(256) {
                if let Ok(local) = self.load(&entry.file_name().to_string_lossy()) {
                    if !local.dismissed {
                        if let Ok(summary) = self.summary(&local) {
                            reports.push(summary);
                        }
                    }
                }
            }
        }
        reports.sort_by_key(|r| std::cmp::Reverse(r.occurred_at_unix));
        reports.truncate(LOCAL_LIMIT);
        Ok(reports)
    }
    pub fn dismiss(&self, id: &str) -> Result<(), String> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut local = self.load(id)?;
        local.dismissed = true;
        atomic_json(&self.directory(id)?.join("record.json"), &local)
    }
    pub fn export(&self, id: &str, include_dump: bool) -> Result<String, String> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let local = self.load(id)?;
        let export = self.root.join("exports").join(id);
        atomic_json(&export.join("report.json"), &local.report)?;
        if include_dump {
            let dump = self.directory(id)?.join("crash.dmp");
            if fs::metadata(&dump)
                .map(|m| m.len() > MAX_DUMP)
                .unwrap_or(true)
            {
                return Err("Dump unavailable or exceeds local size limit".into());
            }
            fs::copy(dump, export.join("crash.dmp")).map_err(|_| "Cannot export dump")?;
        }
        Ok(export.to_string_lossy().into_owned())
    }
    pub fn edit(&self, id: &str, comment: &str, contact: &str) -> Result<(), String> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut local = self.load(id)?;
        if !local.consented {
            local.report["comment"] =
                json!(sanitize(&comment.chars().take(2000).collect::<String>()));
            local.report["contact"] = json!(contact
                .chars()
                .filter(|c| !c.is_control())
                .take(254)
                .collect::<String>());
            atomic_json(&self.directory(id)?.join("record.json"), &local)?;
        }
        Ok(())
    }
    pub fn submit(
        &self,
        id: &str,
        comment: &str,
        contact: &str,
        include_dump: bool,
    ) -> Result<ReportSummary, String> {
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(180))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "Upload client unavailable")?;
        self.submit_to(id, comment, contact, include_dump, ENDPOINT, &client)
    }
    fn submit_to(
        &self,
        id: &str,
        comment: &str,
        contact: &str,
        include_dump: bool,
        endpoint: &str,
        client: &reqwest::blocking::Client,
    ) -> Result<ReportSummary, String> {
        let _upload_guard = self.upload_lock.lock().unwrap_or_else(|e| e.into_inner());
        // This method is called only by the explicit Send command, never on startup/list.
        let mut local = self.load(id)?;
        if !local.consented {
            local.report["comment"] =
                json!(sanitize(&comment.chars().take(2000).collect::<String>()));
            local.report["contact"] = json!(contact
                .chars()
                .filter(|c| !c.is_control())
                .take(254)
                .collect::<String>());
        }
        local.consented = true;
        local.dump_consented = include_dump;
        local.state = "pending".into();
        self.save_upload(&mut local)?;
        let response = client
            .post(endpoint)
            .json(&local.report)
            .send()
            .map_err(|_| "Report upload unavailable; report kept locally")?;
        let status = response.status();
        let mut bytes = Vec::new();
        response
            .take(65537)
            .read_to_end(&mut bytes)
            .map_err(|_| "Invalid upload response")?;
        if !status.is_success() {
            if status.as_u16() == 400 || status.as_u16() == 413 || status.as_u16() == 415 {
                local.consented = false;
                local.state = "draft".into();
                self.save_upload(&mut local)?;
            }
            return Err(format!(
                "Report upload HTTP {}; report kept locally",
                status.as_u16()
            ));
        }
        if bytes.len() > 65536 {
            return Err("Invalid upload response".into());
        }
        let receipt: Value =
            serde_json::from_slice(&bytes).map_err(|_| "Invalid upload response")?;
        let server_id = receipt["reportId"]
            .as_str()
            .filter(|s| valid_id(s))
            .ok_or("Invalid report receipt")?;
        let token = receipt["uploadToken"]
            .as_str()
            .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
            .ok_or("Invalid dump receipt")?;
        local.server_report_id = Some(server_id.into());
        local.upload_token = Some(token.into());
        local.state = "submitted".into();
        self.save_upload(&mut local)?;
        if include_dump && !local.dump_uploaded {
            local.state = "pendingDump".into();
            self.save_upload(&mut local)?;
            let dump = self.directory(id)?.join("crash.dmp");
            let length = fs::metadata(&dump)
                .map_err(|_| "Base report sent; dump is unavailable")?
                .len();
            let max = receipt["maxDumpBytes"].as_u64().unwrap_or(0).min(MAX_DUMP);
            if length == 0 || length > max {
                return Err(format!(
                    "Base report {server_id} sent; dump exceeds hosting limit"
                ));
            }
            let hash = sha_file(&dump, MAX_DUMP).ok_or("Cannot verify dump")?;
            let file = File::open(dump).map_err(|_| "Cannot open dump")?;
            let response = client
                .post(format!("{endpoint}?action=dump&id={server_id}"))
                .bearer_auth(token)
                .header("Content-Type", "application/octet-stream")
                .header("X-Content-SHA256", hash)
                .body(reqwest::blocking::Body::sized(file, length))
                .send()
                .map_err(|_| format!("Base report {server_id} sent; dump upload failed"))?;
            if !response.status().is_success() {
                return Err(format!(
                    "Base report {server_id} sent; dump upload HTTP {}",
                    response.status().as_u16()
                ));
            }
            local.dump_uploaded = true;
            local.state = "submitted".into();
            self.save_upload(&mut local)?;
        }
        self.summary(&local)
    }
    fn save_upload(&self, local: &mut LocalReport) -> Result<(), String> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        if let Ok(current) = self.load(&local.id) {
            local.dismissed = current.dismissed;
        }
        atomic_json(&self.directory(&local.id)?.join("record.json"), local)
    }
    /// Holds a process-lifetime lock, so another launcher instance cannot invent a crash.
    pub fn start_launcher(&self) -> Result<File, String> {
        fs::create_dir_all(&self.root).map_err(|_| "Report storage unavailable")?;
        let lock = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(self.root.join("launcher.lock"))
            .map_err(|_| "Launcher lock unavailable")?;
        lock.try_lock_exclusive()
            .map_err(|_| "Another launcher instance is running")?;
        self.recover_captured_games();
        self.prune_local()?;
        let marker = self.root.join("launcher-session.json");
        if let Ok(bytes) = fs::read(&marker) {
            if let Ok(previous) = serde_json::from_slice::<Value>(&bytes) {
                if previous["clean"].as_bool() == Some(false) {
                    let id = previous["id"]
                        .as_str()
                        .filter(|s| valid_id(s))
                        .map(|s| Ok(s.to_owned()))
                        .unwrap_or_else(random_id)?;
                    let context = ReportContext {
                        id,
                        started: previous["started"].as_u64().unwrap_or(now()),
                        ..ReportContext::default()
                    };
                    if self.load(&context.id).is_err() {
                        let _ = self.collect(&context, "launcherExitUnknown", None, 0);
                    }
                }
            }
        }
        let context = ReportContext {
            id: random_id()?,
            target: "launcher".into(),
            started: now(),
            ..Default::default()
        };
        let directory = self.directory(&context.id)?;
        atomic_json(&directory.join("session.json"), &context)?;
        atomic_json(
            &marker,
            &json!({"clean":false,"started":context.started,"pid":std::process::id(),"id":context.id}),
        )?;
        if self.capture_enabled() {
            if let Ok(executable) = std::env::current_exe() {
                if let Some(name) = executable.file_name().and_then(|v| v.to_str()) {
                    let _ = crate::crash_capture::spawn(std::process::id(), &directory, name);
                }
            }
        }
        Ok(lock)
    }
    fn recover_captured_games(&self) {
        if let Ok(entries) = fs::read_dir(self.root.join("reports")) {
            for entry in entries.flatten().take(256) {
                let id = entry.file_name().to_string_lossy().into_owned();
                if !valid_id(&id) {
                    continue;
                }
                let dir = entry.path();
                if !dir.join("exception.json").is_file() {
                    continue;
                }
                let Some(context) = fs::read(dir.join("session.json"))
                    .ok()
                    .filter(|b| b.len() < 65536)
                    .and_then(|b| serde_json::from_slice::<ReportContext>(&b).ok())
                else {
                    continue;
                };
                if context.id != id {
                    continue;
                }
                let captured = fs::read(dir.join("exception.json"))
                    .ok()
                    .filter(|b| b.len() < 65536)
                    .and_then(|b| serde_json::from_slice::<Value>(&b).ok());
                let occurred = captured
                    .as_ref()
                    .and_then(|v| v["capturedAtUnix"].as_u64())
                    .unwrap_or_else(now);
                let code = captured.as_ref().and_then(|v| {
                    v["exceptionCode"]
                        .as_str()
                        .and_then(|s| u32::from_str_radix(s.trim_start_matches("0x"), 16).ok())
                });
                if let Ok(mut local) = self.load(&id) {
                    if !local.consented && local.report["crash"]["native"].is_null() {
                        if let Some(native) = fs::read(dir.join("exception.json"))
                            .ok()
                            .filter(|b| b.len() < 65536)
                            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
                        {
                            local.report["crash"]["native"] = native;
                            local.report["crash"]["exitCode"] =
                                json!(code.map(|v| format!("0x{v:08X}")));
                            let _ = atomic_json(&dir.join("record.json"), &local);
                        }
                    }
                    continue;
                }
                let _ = self.collect(
                    &context,
                    if context.target == "launcher" {
                        "launcherCrash"
                    } else {
                        "gameCrash"
                    },
                    code,
                    occurred.saturating_sub(context.started),
                );
            }
        }
    }
    fn remove_local(&self, id: &str) -> Result<(), String> {
        let directory = self.directory(id)?;
        if fs::symlink_metadata(&directory)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(true)
        {
            return Ok(());
        }
        for name in [
            "record.json",
            "session.json",
            "exception.json",
            "capture-status.json",
            "crash.dmp",
            "crash.pending.dmp",
        ] {
            let _ = fs::remove_file(directory.join(name));
        }
        let _ = fs::remove_dir(directory);
        Ok(())
    }
    fn prune_local(&self) -> Result<(), String> {
        let Ok(_upload_guard) = self.upload_lock.try_lock() else {
            return Ok(());
        };
        let mut reports = Vec::new();
        if let Ok(entries) = fs::read_dir(self.root.join("reports")) {
            for entry in entries.flatten().take(4096) {
                let id = entry.file_name().to_string_lossy().into_owned();
                if !valid_id(&id) {
                    continue;
                }
                if let Ok(local) = self.load(&id) {
                    reports.push((local.report["occurredAtUnix"].as_u64().unwrap_or(0), id));
                } else if entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|t| t.as_secs() < now().saturating_sub(30 * 86400))
                    .unwrap_or(false)
                {
                    self.remove_local(&id)?;
                }
            }
        }
        reports.sort_by_key(|(stamp, _)| std::cmp::Reverse(*stamp));
        let mut dump_bytes = 0u64;
        for (index, (stamp, id)) in reports.iter().enumerate() {
            if index >= LOCAL_LIMIT || *stamp < now().saturating_sub(30 * 86400) {
                self.remove_local(id)?;
                continue;
            }
            let dump = self.directory(id)?.join("crash.dmp");
            let size = fs::metadata(&dump).map(|m| m.len()).unwrap_or(0);
            if *stamp < now().saturating_sub(7 * 86400)
                || dump_bytes.saturating_add(size) > 512 * 1024 * 1024
            {
                let _ = fs::remove_file(dump);
            } else {
                dump_bytes = dump_bytes.saturating_add(size);
            }
        }
        Ok(())
    }
    /// Reuse only the immutable content and consent already recorded by Send.
    pub fn retry_pending(&self) {
        let Ok(reports) = self.list() else {
            return;
        };
        for report in reports
            .into_iter()
            .filter(|r| r.state == "pending" || r.state == "pendingDump")
            .take(3)
        {
            if let Ok(local) = self.load(&report.id) {
                if local.consented {
                    let _ = self.submit(&report.id, "", "", local.dump_consented);
                }
            }
        }
    }
    pub fn launcher_panic(&self) {
        let previous = fs::read(self.root.join("launcher-session.json"))
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok());
        if let Ok(id) = previous
            .as_ref()
            .and_then(|p| p["id"].as_str())
            .filter(|s| valid_id(s))
            .map(|s| Ok(s.to_owned()))
            .unwrap_or_else(random_id)
        {
            let context = ReportContext {
                id,
                target: "launcher".into(),
                started: previous
                    .as_ref()
                    .and_then(|p| p["started"].as_u64())
                    .unwrap_or(now().saturating_sub(60)),
                ..ReportContext::default()
            };
            let _ = self.collect(
                &context,
                "launcherPanic",
                None,
                now().saturating_sub(context.started),
            );
        }
    }
    pub fn clean_shutdown(&self) -> Result<(), String> {
        if let Some(id) = fs::read(self.root.join("launcher-session.json"))
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            .and_then(|p| p["id"].as_str().map(str::to_owned))
            .filter(|s| valid_id(s))
        {
            if self.load(&id).is_err() && !self.directory(&id)?.join("exception.json").is_file() {
                self.remove_local(&id)?;
            }
        }
        atomic_json(
            &self.root.join("launcher-session.json"),
            &json!({"clean":true,"started":now()}),
        )
    }
}

fn documents_skse() -> PathBuf {
    #[cfg(windows)]
    {
        // Query the user's redirected Documents folder (e.g. OneDrive), not an assumed path.
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            let fallback =
                PathBuf::from(profile).join("Documents/My Games/Skyrim Special Edition/SKSE");
            use std::os::windows::process::CommandExt;
            if let Ok(output) = std::process::Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-Command","[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); [Environment]::GetFolderPath('MyDocuments')"]).creation_flags(0x08000000).output() {
                if output.status.success() { let docs=String::from_utf8_lossy(&output.stdout).trim().to_owned(); if !docs.is_empty() { return PathBuf::from(docs).join("My Games/Skyrim Special Edition/SKSE"); } }
            }
            return fallback;
        }
    }
    PathBuf::new()
}

fn environment() -> Value {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Fixed allowlist of hardware fields. No serials, machine/user names or network data.
        let script = "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; $o=Get-CimInstance Win32_OperatingSystem; $c=Get-CimInstance Win32_Processor | Select-Object -First 1; $g=@(Get-CimInstance Win32_VideoController | Select-Object -First 4 Name,DriverVersion); @{os=$o.Version;architecture=$o.OSArchitecture;cpu=$c.Name;ramTotalKiB=$o.TotalVisibleMemorySize;ramFreeKiB=$o.FreePhysicalMemory;gpu=$g} | ConvertTo-Json -Depth 4 -Compress";
        if let Ok(output) = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .creation_flags(0x08000000)
            .output()
        {
            if output.status.success() && output.stdout.len() < 16384 {
                if let Ok(value) = serde_json::from_slice::<Value>(&output.stdout) {
                    return value;
                }
            }
        }
    }
    json!({"os":std::env::consts::OS,"architecture":std::env::consts::ARCH,"hardwareAvailable":false})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires an isolated PHP fixture on loopback; never contacts the live API"]
    fn basis_and_optional_dump_roundtrip_to_isolated_php_fixture() {
        let endpoint =
            std::env::var("SKYMP_CRASH_TEST_API").expect("Start the isolated PHP fixture");
        let url = reqwest::Url::parse(&endpoint).unwrap();
        assert_eq!(url.scheme(), "http");
        assert_eq!(url.host_str(), Some("127.0.0.1"));
        assert!(url.port().is_some());
        let temp = tempfile::tempdir().unwrap();
        let log = temp.path().join("launcher.log");
        fs::write(&log, format!("{} game exitCode=0xC0000005\n", now())).unwrap();
        let service = CrashReports::new(temp.path().join("reports"), log);
        let context = ReportContext {
            id: random_id().unwrap(),
            started: now(),
            game_version: "1.7.104.0".into(),
            skse_version: "2.3.1".into(),
            ..Default::default()
        };
        let report = service
            .collect(&context, "gameCrash", Some(0xc0000005), 34)
            .unwrap();
        assert!(!service.load(&report.id).unwrap().consented);
        fs::write(
            service.directory(&report.id).unwrap().join("crash.dmp"),
            [b"MDMP".as_slice(), &[0; 124]].concat(),
        )
        .unwrap();
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let receipt = service
            .submit_to(
                &report.id,
                "ÄÖÜ тест",
                "fixture@example.invalid",
                true,
                &endpoint,
                &client,
            )
            .unwrap();
        assert!(valid_id(receipt.server_report_id.as_deref().unwrap()));
        assert!(service.load(&report.id).unwrap().dump_uploaded);
        assert_eq!(receipt.state, "submitted");
    }
    #[test]
    fn redacts_credentials_paths_urls_and_identity_but_retains_faults() {
        let text = "Authorization: Bearer secret\npassword=abc\nmasterKey=skymp_live_secret\nSteamTicket: 1234\nC:\\Users\\Max\\Documents\\SKSE crash 0xC0000005\nhttps://user:password@example.org/api/secret?token=abc\nsteam:76561198029928678 max@example.org\nBS::thread_pool worker +0x180D37";
        let clean = sanitize(text);
        for secret in [
            "Bearer secret",
            "password=abc",
            "skymp_live_secret",
            "1234",
            "Users\\Max",
            "user:password",
            "token=abc",
            "76561198029928678",
            "max@example.org",
        ] {
            assert!(!clean.contains(secret), "{secret}");
        }
        assert!(clean.contains("0xC0000005"));
        assert!(clean.contains("0x180D37"));
    }
    #[test]
    fn normal_exit_never_prompts_and_reports_survive_restart_without_upload() {
        let temp = tempfile::tempdir().unwrap();
        let service = CrashReports::new(
            temp.path().join("private"),
            temp.path().join("launcher.log"),
        );
        service
            .begin_game(ReportContext {
                operation_id: "a".into(),
                ..Default::default()
            })
            .unwrap();
        let mut status = crate::game_session::GameSession::new(temp.path().to_owned()).status();
        status.operation_id = "a".into();
        status.phase = "exitedEarly".into();
        status.exit_code = Some(0);
        assert!(service.finish_game(&status).is_none());
        assert!(service.list().unwrap().is_empty());
        service
            .begin_game(ReportContext {
                operation_id: "b".into(),
                ..Default::default()
            })
            .unwrap();
        status.operation_id = "b".into();
        status.exit_code = Some(0xc0000005);
        let report = service.finish_game(&status).unwrap();
        assert_eq!(report.event_kind, "gameCrash");
        assert_eq!(report.exit_code.as_deref(), Some("0xC0000005"));
        let reloaded = CrashReports::new(
            temp.path().join("private"),
            temp.path().join("launcher.log"),
        );
        assert_eq!(reloaded.list().unwrap().len(), 1);
        assert!(!reloaded.load(&report.id).unwrap().consented);
        assert!(!reloaded
            .export(&report.id, false)
            .unwrap()
            .contains("record.json"));
        assert!(reloaded.directory("../secret").is_err());
        reloaded.dismiss(&report.id).unwrap();
        assert!(reloaded.list().unwrap().is_empty());
    }
    #[test]
    fn marker_is_uncertain_and_clean_exit_and_second_instance_are_respected() {
        let temp = tempfile::tempdir().unwrap();
        let service = CrashReports::new(temp.path().to_owned(), temp.path().join("launcher.log"));
        let lock = service.start_launcher().unwrap();
        assert!(service.start_launcher().is_err());
        drop(lock);
        let lock = service.start_launcher().unwrap();
        assert_eq!(service.list().unwrap()[0].event_kind, "launcherExitUnknown");
        service.clean_shutdown().unwrap();
        drop(lock);
        let _lock = service.start_launcher().unwrap();
        assert_eq!(service.list().unwrap().len(), 1);
    }
    #[test]
    fn a_captured_launcher_fault_is_recovered_once_and_a_panic_does_not_add_a_false_unknown_exit() {
        let temp = tempfile::tempdir().unwrap();
        let service = CrashReports::new(temp.path().to_owned(), temp.path().join("launcher.log"));
        let lock = service.start_launcher().unwrap();
        let marker: Value =
            serde_json::from_slice(&fs::read(temp.path().join("launcher-session.json")).unwrap())
                .unwrap();
        let id = marker["id"].as_str().unwrap();
        atomic_json(&service.directory(id).unwrap().join("exception.json"),&json!({"exceptionCode":"0xC0000005","module":"skymp-launcher.exe","rva":"0x123","loadedModules":[]})).unwrap();
        drop(lock);
        let lock = service.start_launcher().unwrap();
        let reports = service.list().unwrap();
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].event_kind, "launcherCrash");
        assert_eq!(reports[0].id, id);
        assert_eq!(reports[0].exit_code.as_deref(), Some("0xC0000005"));
        service.launcher_panic();
        drop(lock);
        let _lock = service.start_launcher().unwrap();
        let reports = service.list().unwrap();
        assert_eq!(reports.len(), 2);
        assert!(!reports
            .iter()
            .any(|r| r.event_kind == "launcherExitUnknown"));
    }
    #[test]
    fn consented_retry_keeps_exact_content_and_dump_failure_does_not_lose_basis_receipt() {
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            for (status, body) in [
                (503, "{}".to_owned()),
                (
                    200,
                    format!(
                        r#"{{"reportId":"{}","uploadToken":"{}","maxDumpBytes":1024}}"#,
                        "b".repeat(32),
                        "c".repeat(64)
                    ),
                ),
                (413, "{}".to_owned()),
            ] {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(10)))
                    .unwrap();
                let mut request = Vec::new();
                let boundary;
                loop {
                    let mut byte = [0];
                    stream.read_exact(&mut byte).unwrap();
                    request.push(byte[0]);
                    if request.ends_with(b"\r\n\r\n") {
                        boundary = request.len();
                        break;
                    }
                }
                let header = String::from_utf8(request.clone()).unwrap();
                let length = header
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|v| v.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                request.resize(boundary + length, 0);
                stream.read_exact(&mut request[boundary..]).unwrap();
                tx.send((header, request[boundary..].to_vec())).unwrap();
                write!(stream,"HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
            }
        });
        let temp = tempfile::tempdir().unwrap();
        let service = CrashReports::new(temp.path().to_owned(), temp.path().join("launcher.log"));
        let context = ReportContext {
            id: random_id().unwrap(),
            started: now(),
            ..Default::default()
        };
        let report = service
            .collect(&context, "gameCrash", Some(0xc0000005), 30)
            .unwrap();
        let dump = service.directory(&report.id).unwrap().join("crash.dmp");
        fs::write(dump, [b"MDMP".as_slice(), &[0; 60]].concat()).unwrap();
        assert!(!service.load(&report.id).unwrap().consented);
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let endpoint = format!("http://{address}/crash-reports.php");
        assert!(service
            .submit_to(&report.id, "First comment", "", true, &endpoint, &client)
            .is_err());
        let pending = service.load(&report.id).unwrap();
        assert!(pending.consented);
        assert_eq!(pending.state, "pending");
        assert!(service
            .submit_to(
                &report.id,
                "Changed comment must not be sent",
                "",
                true,
                &endpoint,
                &client
            )
            .is_err());
        let local = service.load(&report.id).unwrap();
        assert_eq!(
            local.server_report_id.as_deref(),
            Some("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
        );
        assert_eq!(local.state, "pendingDump");
        let first = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let second = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let third = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(first.1, second.1);
        assert!(third.0.starts_with("POST /crash-reports.php?action=dump"));
        assert!(third
            .0
            .to_ascii_lowercase()
            .contains("authorization: bearer cccc"));
        let exported = PathBuf::from(service.export(&report.id, false).unwrap());
        let contents = fs::read_to_string(exported.join("report.json")).unwrap();
        assert!(!contents.contains("uploadToken"));
        server.join().unwrap();
    }
}
