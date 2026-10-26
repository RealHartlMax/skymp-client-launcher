//! Optional desktop Rich Presence. IPC carries display state only, never Steam/session credentials.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PresenceRequest {
    pub mode: String,
    #[serde(default)]
    pub streamer_mode: bool,
    #[serde(default)]
    pub playing: bool,
    pub server_name: Option<String>,
    pub language: String,
}
impl Default for PresenceRequest {
    fn default() -> Self {
        Self {
            mode: "disabled".into(),
            streamer_mode: false,
            playing: false,
            server_name: None,
            language: "de".into(),
        }
    }
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceStatus {
    pub state: String,
    pub discord_user: Option<String>,
}
struct Desired {
    request: PresenceRequest,
    revision: u64,
    started: u64,
}
struct Shared {
    desired: Mutex<Desired>,
    status: Mutex<PresenceStatus>,
    stop: AtomicBool,
}
pub struct DiscordPresence {
    shared: Arc<Shared>,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn application_id() -> String {
    serde_json::from_str::<Value>(include_str!("../../../web/shared/platform.json"))
        .ok()
        .and_then(|value| value["discordApplicationId"].as_str().map(str::to_owned))
        .filter(|value| {
            (17..=20).contains(&value.len()) && value.bytes().all(|b| b.is_ascii_digit())
        })
        .unwrap_or_default()
}
fn display(value: &str, maximum: usize) -> String {
    value
        .chars()
        .filter(|c| !c.is_control() && !matches!(c,'\u{202a}'..='\u{202e}'|'\u{2066}'..='\u{2069}'))
        .take(maximum)
        .collect()
}
fn activity(request: &PresenceRequest, started: u64) -> Value {
    if request.mode == "disabled" {
        return Value::Null;
    }
    let hidden = request.mode == "hidden" || request.streamer_mode;
    let language = request.language.as_str();
    let details = if hidden {
        "Skyrim Multiplayer".to_owned()
    } else if request.playing {
        request
            .server_name
            .as_deref()
            .map(|name| display(name, 120))
            .filter(|name| !name.is_empty())
            .unwrap_or("Skyrim Multiplayer".into())
    } else {
        match language {
            "de" => "Server entdecken",
            "ru" => "Поиск серверов",
            _ => "Discovering servers",
        }
        .into()
    };
    let state = if request.playing {
        "Skyrim Special Edition"
    } else {
        match language {
            "de" => "Im Launcher",
            "ru" => "В лаунчере",
            _ => "In the launcher",
        }
    };
    let mut value = json!({"type":0,"details":details,"state":state});
    if request.playing && !hidden {
        value["timestamps"] = json!({"start":started});
    }
    value
}
fn frame(opcode: u32, payload: &Value) -> Result<Vec<u8>, String> {
    let payload = serde_json::to_vec(payload).map_err(|_| "Invalid Discord frame")?;
    raw_frame(opcode, &payload)
}
fn raw_frame(opcode: u32, payload: &[u8]) -> Result<Vec<u8>, String> {
    if payload.len() > 65536 {
        return Err("Discord frame exceeds limit".into());
    }
    let mut bytes = Vec::with_capacity(payload.len() + 8);
    bytes.extend_from_slice(&opcode.to_le_bytes());
    bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend_from_slice(payload);
    Ok(bytes)
}
fn decode(buffer: &mut Vec<u8>) -> Result<Option<(u32, Vec<u8>)>, String> {
    if buffer.len() < 8 {
        return Ok(None);
    }
    let opcode = u32::from_le_bytes(buffer[..4].try_into().unwrap());
    let length = u32::from_le_bytes(buffer[4..8].try_into().unwrap()) as usize;
    if length > 65536 {
        return Err("Discord frame exceeds limit".into());
    }
    if buffer.len() < length + 8 {
        return Ok(None);
    }
    let value = buffer[8..length + 8].to_vec();
    buffer.drain(..length + 8);
    Ok(Some((opcode, value)))
}
impl DiscordPresence {
    pub fn new() -> Self {
        let shared = Arc::new(Shared {
            desired: Mutex::new(Desired {
                request: PresenceRequest::default(),
                revision: 0,
                started: now(),
            }),
            status: Mutex::new(PresenceStatus {
                state: "disabled".into(),
                discord_user: None,
            }),
            stop: AtomicBool::new(false),
        });
        let worker = shared.clone();
        std::thread::spawn(move || native::run(worker));
        Self { shared }
    }
    pub fn update(&self, request: PresenceRequest) -> Result<PresenceStatus, String> {
        if !["enabled", "hidden", "disabled"].contains(&request.mode.as_str())
            || !["de", "en", "ru"].contains(&request.language.as_str())
            || request
                .server_name
                .as_ref()
                .map(|value| value.len() > 1024)
                .unwrap_or(false)
        {
            return Err("Invalid Discord settings".into());
        }
        let mut desired = self
            .shared
            .desired
            .lock()
            .map_err(|_| "Discord state unavailable")?;
        if request != desired.request {
            if request.playing && !desired.request.playing {
                desired.started = now();
            }
            desired.request = request;
            desired.revision = desired.revision.wrapping_add(1);
        }
        drop(desired);
        self.status()
    }
    pub fn status(&self) -> Result<PresenceStatus, String> {
        self.shared
            .status
            .lock()
            .map(|value| value.clone())
            .map_err(|_| "Discord state unavailable".into())
    }
}
impl Drop for DiscordPresence {
    fn drop(&mut self) {
        self.shared.stop.store(true, Ordering::Relaxed);
    }
}
fn status(shared: &Shared, state: &str, user: Option<String>) {
    if let Ok(mut value) = shared.status.lock() {
        *value = PresenceStatus {
            state: state.into(),
            discord_user: user,
        };
    }
}

#[cfg(target_os = "windows")]
mod native {
    use super::*;
    use std::collections::VecDeque;
    use std::fs::{File, OpenOptions};
    use std::io::{Read, Write};
    use std::os::windows::io::AsRawHandle;
    use std::time::Instant;
    use windows_sys::Win32::System::Pipes::SetNamedPipeHandleState;
    fn open() -> Option<File> {
        for index in 0..10 {
            if let Ok(file) = OpenOptions::new()
                .read(true)
                .write(true)
                .open(format!(r"\\?\pipe\discord-ipc-{index}"))
            {
                // A dedicated bounded polling worker owns this handle; UI threads never wait on IPC.
                let mode = 1u32;
                if unsafe {
                    SetNamedPipeHandleState(
                        file.as_raw_handle() as _,
                        &mode,
                        std::ptr::null(),
                        std::ptr::null(),
                    )
                } != 0
                {
                    return Some(file);
                }
            }
        }
        None
    }
    fn pending(error: &std::io::Error) -> bool {
        matches!(error.raw_os_error(), Some(232)) || error.kind() == std::io::ErrorKind::WouldBlock
    }
    pub(super) fn run(shared: Arc<Shared>) {
        let id = application_id();
        let mut pipe: Option<File> = None;
        let mut input = Vec::new();
        let mut output: VecDeque<(Vec<u8>, usize)> = VecDeque::new();
        let mut ready = false;
        let mut sent = u64::MAX;
        let mut nonce = 0u64;
        let mut retry = Instant::now();
        let mut progress = Instant::now();
        let mut close_after_send = false;
        while !shared.stop.load(Ordering::Relaxed) {
            let (desired, revision, started) = match shared.desired.lock() {
                Ok(value) => (value.request.clone(), value.revision, value.started),
                Err(_) => break,
            };
            if id.is_empty() {
                status(&shared, "notConfigured", None);
                std::thread::sleep(Duration::from_millis(500));
                continue;
            }
            if desired.mode == "disabled" && pipe.is_none() {
                status(&shared, "disabled", None);
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            if pipe.is_none() {
                if Instant::now() < retry {
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }
                if let Some(file) = open() {
                    pipe = Some(file);
                    input.clear();
                    output.clear();
                    ready = false;
                    sent = u64::MAX;
                    close_after_send = false;
                    progress = Instant::now();
                    if let Ok(bytes) = frame(0, &json!({"v":1,"client_id":id})) {
                        output.push_back((bytes, 0));
                    }
                    status(&shared, "connecting", None);
                } else {
                    status(&shared, "unavailable", None);
                    retry = Instant::now() + Duration::from_secs(10);
                    continue;
                }
            }
            let mut failed = false;
            if let Some(file) = pipe.as_mut() {
                let mut bytes = [0u8; 8192];
                match file.read(&mut bytes) {
                    Ok(0) => failed = true,
                    Ok(count) => {
                        input.extend_from_slice(&bytes[..count]);
                        if input.len() > 131088 {
                            failed = true;
                        }
                    }
                    Err(error) if pending(&error) => {}
                    Err(_) => failed = true,
                }
                for _ in 0..8 {
                    match decode(&mut input) {
                        Ok(Some((1, bytes))) => match serde_json::from_slice::<Value>(&bytes) {
                            Ok(value) => {
                                if value["evt"] == "READY" {
                                    ready = true;
                                    let user = value["data"]["user"]["username"]
                                        .as_str()
                                        .map(|name| display(name, 64));
                                    status(&shared, "connected", user.clone());
                                } else if value["evt"] == "ERROR" {
                                    failed = true;
                                }
                            }
                            Err(_) => failed = true,
                        },
                        Ok(Some((3, value))) => {
                            if output.len() >= 8 {
                                failed = true;
                                break;
                            }
                            if let Ok(bytes) = raw_frame(4, &value) {
                                output.push_back((bytes, 0));
                            }
                        }
                        Ok(Some((2, _))) => failed = true,
                        Ok(Some(_)) => {}
                        Ok(None) => break,
                        Err(_) => {
                            failed = true;
                            break;
                        }
                    }
                }
                if ready && sent != revision && output.len() < 4 {
                    nonce = nonce.wrapping_add(1);
                    let command = json!({"cmd":"SET_ACTIVITY","args":{"pid":std::process::id(),"activity":activity(&desired,started)},"nonce":format!("skymp-{nonce}")});
                    if let Ok(bytes) = frame(1, &command) {
                        output.push_back((bytes, 0));
                        sent = revision;
                        close_after_send = desired.mode == "disabled";
                        progress = Instant::now();
                    }
                }
                if !ready && desired.mode == "disabled" {
                    failed = true;
                }
                if let Some((bytes, offset)) = output.front_mut() {
                    match file.write(&bytes[*offset..]) {
                        Ok(0) => {}
                        Ok(count) => {
                            *offset += count;
                            progress = Instant::now();
                            if *offset == bytes.len() {
                                output.pop_front();
                            }
                        }
                        Err(error) if pending(&error) => {}
                        Err(_) => failed = true,
                    }
                }
                if !output.is_empty() && progress.elapsed() > Duration::from_secs(3)
                    || !ready && progress.elapsed() > Duration::from_secs(5)
                {
                    failed = true;
                }
            }
            if close_after_send && output.is_empty() {
                pipe = None;
                status(&shared, "disabled", None);
            } else if failed {
                pipe = None;
                output.clear();
                input.clear();
                ready = false;
                status(&shared, "unavailable", None);
                retry = Instant::now() + Duration::from_secs(10);
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}
#[cfg(not(target_os = "windows"))]
mod native {
    use super::*;
    pub(super) fn run(shared: Arc<Shared>) {
        while !shared.stop.load(Ordering::Relaxed) {
            let disabled = shared
                .desired
                .lock()
                .map(|value| value.request.mode == "disabled")
                .unwrap_or(true);
            status(
                &shared,
                if disabled { "disabled" } else { "unavailable" },
                None,
            );
            std::thread::sleep(Duration::from_millis(250));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn activity_modes_respect_streamer_privacy_and_do_not_expose_credentials() {
        let mut request = PresenceRequest {
            mode: "enabled".into(),
            streamer_mode: false,
            playing: true,
            server_name: Some("Hüter ÄÖÜ".into()),
            language: "de".into(),
        };
        assert_eq!(activity(&request, 123)["details"], "Hüter ÄÖÜ");
        request.streamer_mode = true;
        let hidden = activity(&request, 123);
        assert_eq!(hidden["details"], "Skyrim Multiplayer");
        assert!(hidden.get("timestamps").is_none());
        request.mode = "disabled".into();
        assert!(activity(&request, 123).is_null());
        assert_eq!(application_id(), "1496895150322876555");
    }
    #[test]
    fn ipc_frames_are_bounded_and_support_fragmented_reads() {
        let value = json!({"evt":"READY","data":{"user":{"username":"Fixture"}}});
        let encoded = frame(1, &value).unwrap();
        let mut buffer = encoded[..6].to_vec();
        assert!(decode(&mut buffer).unwrap().is_none());
        buffer.extend_from_slice(&encoded[6..]);
        assert_eq!(
            decode(&mut buffer).unwrap(),
            Some((1, serde_json::to_vec(&value).unwrap()))
        );
        assert!(buffer.is_empty());
        let mut ping = raw_frame(3, b"opaque-ping").unwrap();
        assert_eq!(
            decode(&mut ping).unwrap(),
            Some((3, b"opaque-ping".to_vec()))
        );
        let mut invalid = vec![0u8; 8];
        invalid[4..].copy_from_slice(&65537u32.to_le_bytes());
        assert!(decode(&mut invalid).is_err());
    }
}
