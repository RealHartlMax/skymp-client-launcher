//! Observe the real game process independently of SKSE's short-lived loader.
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStatus {
    pub operation_id: String,
    pub phase: String,
    pub pid: Option<u32>,
    pub elapsed_seconds: u64,
    pub diagnostics_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<u32>,
}

#[derive(Clone)]
pub struct GameSession {
    active: Arc<AtomicBool>,
    status: Arc<Mutex<GameStatus>>,
    log: PathBuf,
}

impl GameSession {
    pub fn new(log_directory: PathBuf) -> Self {
        let log = log_directory.join("launcher.log");
        Self {
            active: Arc::new(AtomicBool::new(false)),
            status: Arc::new(Mutex::new(GameStatus {
                operation_id: String::new(),
                phase: "idle".into(),
                pid: None,
                elapsed_seconds: 0,
                diagnostics_path: log.to_string_lossy().into_owned(),
                exit_code: None,
            })),
            log,
        }
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }

    pub fn status(&self) -> GameStatus {
        self.status
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .clone()
    }

    // Deliberately log fixed lifecycle events, never requests, keys or account data.
    pub fn record(&self, event: &str) {
        if let Some(parent) = self.log.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::metadata(&self.log)
            .map(|m| m.len() > 2 * 1024 * 1024)
            .unwrap_or(false)
        {
            let _ = fs::rename(&self.log, self.log.with_extension("previous.log"));
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&self.log) {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let _ = writeln!(file, "{stamp} {event}");
        }
    }

    fn publish<F: Fn(GameStatus)>(&self, phase: &str, pid: Option<u32>, seconds: u64, notify: &F) {
        let mut state = self
            .status
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        state.phase = phase.into();
        state.pid = pid;
        state.elapsed_seconds = seconds;
        let snapshot = state.clone();
        if let Ok(bytes) = serde_json::to_vec_pretty(&snapshot) {
            let file = self.log.with_file_name("latest-game-session.json");
            let pending = file.with_extension("pending.json");
            if fs::write(&pending, bytes).is_ok() {
                let _ = fs::rename(pending, file);
            }
        }
        drop(state);
        self.record(&format!(
            "game phase={phase} pid={} elapsedSeconds={seconds}",
            pid.unwrap_or(0)
        ));
        notify(snapshot);
    }

    fn record_exit_code(&self, code: u32) {
        self.status
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .exit_code = Some(code);
        self.record(&format!("game exitCode=0x{code:08X}"));
    }

    pub fn launch<F>(
        &self,
        game: &Path,
        loader: &Path,
        operation_id: String,
        notify: F,
    ) -> Result<(), String>
    where
        F: Fn(GameStatus) + Send + 'static,
    {
        self.active
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "A game session is already starting or running")?;
        {
            let mut state = self
                .status
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            state.operation_id = operation_id;
            state.exit_code = None;
        }
        self.publish("starting", None, 0, &notify);
        let mut command = Command::new(loader);
        command
            .current_dir(game)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000 | 0x00000200);
        }
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                self.active.store(false, Ordering::SeqCst);
                self.publish("launchFailed", None, 0, &notify);
                return Err(format!("Failed to launch SKSE: {error}"));
            }
        };
        let started = Instant::now();
        let pid = loop {
            match query_game_pid() {
                Ok(Some(pid)) => break pid,
                Err(error) => {
                    self.active.store(false, Ordering::SeqCst);
                    self.publish("checkFailed", None, started.elapsed().as_secs(), &notify);
                    return Err(error);
                }
                Ok(None) => {}
            }
            let loader_failed = child
                .try_wait()
                .ok()
                .flatten()
                .map(|code| !code.success())
                .unwrap_or(false);
            if loader_failed || started.elapsed() >= Duration::from_secs(60) {
                self.active.store(false, Ordering::SeqCst);
                self.publish("notStarted", None, started.elapsed().as_secs(), &notify);
                return Err(format!(
                    "Skyrim did not start. Diagnostics: {}",
                    self.log.display()
                ));
            }
            std::thread::sleep(Duration::from_millis(750));
        };
        // Keep a read-only handle to this exact game process. The SKSE loader is
        // not the game, and tasklist alone cannot report the game's exit code.
        #[cfg(windows)]
        let tracked = tracked_process::Process::open(pid)
            .map_err(|error| {
                self.record(&format!(
                    "game exitCodeTrackingUnavailable osError={:?}",
                    error.raw_os_error()
                ));
            })
            .ok();
        self.publish("running", Some(pid), started.elapsed().as_secs(), &notify);
        let running = Instant::now();
        let session = self.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_secs(2));
                let _ = child.try_wait();
                #[cfg(windows)]
                if let Some(process) = &tracked {
                    match process.exit_code() {
                        Ok(None) => continue,
                        Ok(Some(code)) => {
                            session.record_exit_code(code);
                            session.publish(
                                exit_phase(running.elapsed().as_secs()),
                                Some(pid),
                                running.elapsed().as_secs(),
                                &notify,
                            );
                            session.active.store(false, Ordering::SeqCst);
                            break;
                        }
                        Err(error) => session.record(&format!(
                            "game exitCodeReadFailed osError={:?}",
                            error.raw_os_error()
                        )),
                    }
                }
                match query_game_pid() {
                    Ok(Some(current)) if current == pid => continue,
                    Ok(_) => {
                        let phase = exit_phase(running.elapsed().as_secs());
                        session.publish(phase, Some(pid), running.elapsed().as_secs(), &notify);
                    }
                    Err(_) => {
                        // An unavailable process query must never be presented as a game crash.
                        session.publish(
                            "checkFailed",
                            Some(pid),
                            running.elapsed().as_secs(),
                            &notify,
                        );
                    }
                }
                session.active.store(false, Ordering::SeqCst);
                break;
            }
        });
        Ok(())
    }
}

#[cfg(windows)]
mod tracked_process {
    use std::ffi::c_void;
    use std::io;
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};

    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
        fn WaitForSingleObject(handle: *mut c_void, milliseconds: u32) -> u32;
        fn GetExitCodeProcess(handle: *mut c_void, exit_code: *mut u32) -> i32;
    }

    pub struct Process(OwnedHandle);
    impl Process {
        pub fn open(pid: u32) -> io::Result<Self> {
            // PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE. No terminate,
            // debug, injection or write rights; no changes to the game process.
            let handle = unsafe { OpenProcess(0x1000 | 0x100000, 0, pid) };
            if handle.is_null() {
                return Err(io::Error::last_os_error());
            }
            Ok(Self(unsafe { OwnedHandle::from_raw_handle(handle) }))
        }
        pub fn exit_code(&self) -> io::Result<Option<u32>> {
            match unsafe { WaitForSingleObject(self.0.as_raw_handle(), 0) } {
                258 => Ok(None), // WAIT_TIMEOUT: still running.
                0 => {
                    // WAIT_OBJECT_0: 259 is also a valid final exit code.
                    let mut code = 0;
                    if unsafe { GetExitCodeProcess(self.0.as_raw_handle(), &mut code) } == 0 {
                        return Err(io::Error::last_os_error());
                    }
                    Ok(Some(code))
                }
                _ => Err(io::Error::last_os_error()),
            }
        }
    }
}

fn exit_phase(seconds: u64) -> &'static str {
    if seconds < 120 {
        "exitedEarly"
    } else {
        "exited"
    }
}

pub fn parse_game_pid(output: &str) -> Result<Option<u32>, String> {
    for line in output.lines() {
        let mut fields = line.trim().trim_start_matches('\u{feff}').split("\",\"");
        let image = fields.next().unwrap_or("").trim_matches('"');
        if image.eq_ignore_ascii_case("SkyrimSE.exe") {
            return fields
                .next()
                .and_then(|pid| pid.trim_matches('"').parse().ok())
                .filter(|pid| *pid > 0)
                .map(Some)
                .ok_or_else(|| "Could not read the Skyrim process ID".into());
        }
    }
    Ok(None)
}

pub fn query_game_pid() -> Result<Option<u32>, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let output = Command::new("tasklist.exe")
            .args(["/FI", "IMAGENAME eq SkyrimSE.exe", "/FO", "CSV", "/NH"])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("Check game process: {e}"))?;
        if !output.status.success() {
            return Err("Could not query the Skyrim process".into());
        }
        parse_game_pid(&String::from_utf8_lossy(&output.stdout))
    }
    #[cfg(not(windows))]
    {
        Err("Game process monitoring requires Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_real_tasklist_rows_without_treating_localized_empty_output_as_a_crash() {
        assert_eq!(
            parse_game_pid("\"SkyrimSE.exe\",\"14244\",\"Console\",\"1\",\"2.500.000 K\"\r\n")
                .unwrap(),
            Some(14244)
        );
        assert_eq!(
            parse_game_pid(
                "INFORMATION: Es werden keine Aufgaben mit den angegebenen Kriterien ausgeführt."
            )
            .unwrap(),
            None
        );
        assert_eq!(
            parse_game_pid("INFO: No tasks are running which match the specified criteria.")
                .unwrap(),
            None
        );
        assert!(parse_game_pid("\"SkyrimSE.exe\",\"invalid\",\"Console\"").is_err());
    }
    #[test]
    fn early_and_later_game_exit_have_distinct_results() {
        assert_eq!(exit_phase(20), "exitedEarly");
        assert_eq!(exit_phase(180), "exited");
    }
    #[test]
    fn lifecycle_diagnostics_persist_without_server_or_account_data() {
        let root = tempfile::tempdir().unwrap();
        let session = GameSession::new(root.path().to_path_buf());
        session.record("launcher started");
        session.record_exit_code(0xC0000005);
        session.publish("exitedEarly", Some(123), 18, &|_| {});
        let state: serde_json::Value = serde_json::from_slice(
            &fs::read(root.path().join("latest-game-session.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(state["phase"], "exitedEarly");
        assert_eq!(state["pid"], 123);
        assert_eq!(state["exitCode"], 0xC0000005_u32);
        let log = fs::read_to_string(root.path().join("launcher.log")).unwrap();
        assert!(log.contains("exitedEarly"));
        assert!(log.contains("exitCode=0xC0000005"));
        assert!(!log.contains("masterKey"));
    }

    #[cfg(windows)]
    #[test]
    fn observes_real_exit_codes_without_starting_or_terminating_a_game() {
        use std::os::windows::process::CommandExt;
        for code in [37, 259] {
            let mut child = Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    &format!("Start-Sleep -Milliseconds 300; exit {code}"),
                ])
                .creation_flags(0x08000000)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            let process = tracked_process::Process::open(child.id()).unwrap();
            assert_eq!(process.exit_code().unwrap(), None);
            assert_eq!(child.wait().unwrap().code(), Some(code));
            assert_eq!(process.exit_code().unwrap(), Some(code as u32));
        }
    }
}
