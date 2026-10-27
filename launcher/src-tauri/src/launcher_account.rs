//! Profile-only website sign-in. Passwords stay in the browser; bearer tokens stay in Rust/WinCred.
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const API: &str = "https://api.skymp-worlds.net";
const LOGIN: &str = "https://manage.skymp-worlds.net/launcher-login.php";
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn secret(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: u32,
    pub display_name: String,
    pub login_name: String,
    pub email: String,
    pub email_verified: bool,
    pub discord_linked: bool,
    pub expires_at: u64,
}
impl Profile {
    fn valid(&self) -> bool {
        self.id > 0
            && self.expires_at > now()
            && [&self.display_name, &self.login_name, &self.email]
                .iter()
                .all(|s| s.len() <= 512 && !s.chars().any(char::is_control))
    }
}
#[derive(Clone, Serialize, Deserialize)]
struct Session {
    token: String,
    profile: Profile,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStatus {
    pub state: &'static str,
    pub profile: Option<Profile>,
    pub remembered: bool,
    pub remote_logout: Option<bool>,
}
struct Pending {
    state: String,
    expires: u64,
}
#[derive(Default)]
struct State {
    loaded: bool,
    session: Option<Session>,
    pending: Option<Pending>,
    remembered: bool,
}
#[derive(Clone)]
pub struct LauncherAccount {
    state: Arc<Mutex<State>>,
    api: String,
    persistent: bool,
}
impl Default for LauncherAccount {
    fn default() -> Self {
        Self::new()
    }
}
impl LauncherAccount {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(State::default())),
            api: API.into(),
            persistent: true,
        }
    }
    fn request(&self, path: &str, token: Option<&str>, post: bool) -> Result<(u16, Value), String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "serviceUnavailable")?;
        let mut request = if post {
            client
                .post(format!("{}{path}", self.api))
                .json(&serde_json::json!({}))
        } else {
            client.get(format!("{}{path}", self.api))
        };
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        let response = request.send().map_err(|_| "serviceUnavailable")?;
        let status = response.status().as_u16();
        let mut bytes = Vec::new();
        response
            .take(16385)
            .read_to_end(&mut bytes)
            .map_err(|_| "serviceUnavailable")?;
        if bytes.len() > 16384 {
            return Err("serviceUnavailable".into());
        }
        let value = serde_json::from_slice(&bytes).map_err(|_| "serviceUnavailable")?;
        Ok((status, value))
    }
    fn snapshot(state: &State, phase: &'static str) -> AccountStatus {
        AccountStatus {
            state: phase,
            profile: state.session.as_ref().map(|s| s.profile.clone()),
            remembered: state.remembered,
            remote_logout: None,
        }
    }
    fn clear(&self, state: &mut State) -> Result<(), String> {
        if self.persistent {
            credentials::delete()?;
        }
        state.session = None;
        state.pending = None;
        state.remembered = false;
        state.loaded = true;
        Ok(())
    }
    pub fn begin(&self, language: &str) -> Result<String, String> {
        let mut state = self.state.lock().map_err(|_| "accountUnavailable")?;
        if state.session.is_some() {
            return Err("alreadySignedIn".into());
        }
        let mut bytes = [0u8; 32];
        getrandom::getrandom(&mut bytes).map_err(|_| "accountUnavailable")?;
        let nonce = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
        let language = match language {
            "de" => "de",
            "ru" => "ru",
            _ => "en",
        };
        let url = format!("{LOGIN}?state={nonce}&lang={language}");
        state.pending = Some(Pending {
            state: nonce,
            expires: now() + 600,
        });
        Ok(url)
    }
    pub fn status(&self) -> Result<AccountStatus, String> {
        let mut state = self.state.lock().map_err(|_| "accountUnavailable")?;
        if !state.loaded {
            if self.persistent {
                if let Some(session) = credentials::read()? {
                    if secret(&session.token) && session.profile.valid() {
                        state.session = Some(session);
                        state.remembered = true;
                    } else {
                        credentials::delete()?;
                    }
                }
            }
            state.loaded = true;
        }
        if let Some(pending) = &state.pending {
            if pending.expires <= now() {
                state.pending = None;
                return Ok(Self::snapshot(&state, "expired"));
            }
            let (code, value) = self.request(
                &format!("/api/users/launcher/status?state={}", pending.state),
                None,
                false,
            )?;
            if code == 401 {
                return Ok(Self::snapshot(&state, "waiting"));
            }
            if code == 410 {
                state.pending = None;
                return Ok(Self::snapshot(&state, "expired"));
            }
            if code != 200 {
                return Err("serviceUnavailable".into());
            }
            let token = value["token"]
                .as_str()
                .filter(|s| secret(s))
                .ok_or("serviceUnavailable")?
                .to_owned();
            let profile: Profile = serde_json::from_value(value["profile"].clone())
                .map_err(|_| "serviceUnavailable")?;
            if !profile.valid() {
                return Err("serviceUnavailable".into());
            }
            let session = Session { token, profile };
            state.remembered = self.persistent && credentials::write(&session).is_ok();
            state.session = Some(session);
            state.pending = None;
            return Ok(Self::snapshot(&state, "signedIn"));
        }
        let Some(session) = state.session.clone() else {
            return Ok(Self::snapshot(&state, "signedOut"));
        };
        if session.profile.expires_at <= now() {
            self.clear(&mut state)?;
            return Ok(Self::snapshot(&state, "expired"));
        }
        match self.request("/api/users/launcher/me", Some(&session.token), false) {
            Ok((401, _)) => {
                self.clear(&mut state)?;
                Ok(Self::snapshot(&state, "expired"))
            }
            Ok((200, value)) => {
                let profile: Profile = serde_json::from_value(value["profile"].clone())
                    .map_err(|_| "serviceUnavailable")?;
                if !profile.valid() {
                    return Err("serviceUnavailable".into());
                }
                state.session = Some(Session {
                    token: session.token,
                    profile,
                });
                if state.remembered {
                    state.remembered = credentials::write(state.session.as_ref().unwrap()).is_ok();
                }
                Ok(Self::snapshot(&state, "signedIn"))
            }
            _ => Ok(Self::snapshot(&state, "offline")),
        }
    }
    pub fn cancel(&self) -> Result<(), String> {
        self.state.lock().map_err(|_| "accountUnavailable")?.pending = None;
        Ok(())
    }
    pub fn logout(&self) -> Result<AccountStatus, String> {
        let mut state = self.state.lock().map_err(|_| "accountUnavailable")?;
        let remote = state
            .session
            .as_ref()
            .map(|session| {
                matches!(
                    self.request("/api/users/launcher/logout", Some(&session.token), true),
                    Ok((200 | 401, _))
                )
            })
            .unwrap_or(true);
        self.clear(&mut state)?;
        let mut status = Self::snapshot(&state, "signedOut");
        status.remote_logout = Some(remote);
        Ok(status)
    }
}

#[cfg(windows)]
mod credentials {
    use super::Session;
    use windows_sys::Win32::{
        Foundation::{GetLastError, ERROR_NOT_FOUND},
        Security::Credentials::*,
    };
    fn target() -> Vec<u16> {
        "SkyMPWorlds/LauncherAccount/v1"
            .encode_utf16()
            .chain(Some(0))
            .collect()
    }
    pub(super) fn read() -> Result<Option<Session>, String> {
        unsafe {
            let mut pointer = std::ptr::null_mut();
            if CredReadW(target().as_ptr(), CRED_TYPE_GENERIC, 0, &mut pointer) == 0 {
                return if GetLastError() == ERROR_NOT_FOUND {
                    Ok(None)
                } else {
                    Err("storageUnavailable".into())
                };
            }
            let entry = &*pointer;
            let session = if entry.CredentialBlobSize > 0
                && entry.CredentialBlobSize <= CRED_MAX_CREDENTIAL_BLOB_SIZE
                && !entry.CredentialBlob.is_null()
            {
                serde_json::from_slice(std::slice::from_raw_parts(
                    entry.CredentialBlob,
                    entry.CredentialBlobSize as usize,
                ))
                .ok()
            } else {
                None
            };
            CredFree(pointer.cast());
            Ok(session)
        }
    }
    pub(super) fn write(session: &Session) -> Result<(), String> {
        let mut bytes = serde_json::to_vec(session).map_err(|_| "storageUnavailable")?;
        if bytes.len() > CRED_MAX_CREDENTIAL_BLOB_SIZE as usize {
            return Err("storageUnavailable".into());
        }
        let mut target = target();
        let mut user = "SkyMP Worlds"
            .encode_utf16()
            .chain(Some(0))
            .collect::<Vec<_>>();
        let mut entry: CREDENTIALW = unsafe { std::mem::zeroed() };
        entry.Type = CRED_TYPE_GENERIC;
        entry.TargetName = target.as_mut_ptr();
        entry.CredentialBlobSize = bytes.len() as u32;
        entry.CredentialBlob = bytes.as_mut_ptr();
        entry.Persist = CRED_PERSIST_LOCAL_MACHINE;
        entry.UserName = user.as_mut_ptr();
        if unsafe { CredWriteW(&entry, 0) } == 0 {
            Err("storageUnavailable".into())
        } else {
            Ok(())
        }
    }
    pub(super) fn delete() -> Result<(), String> {
        if unsafe { CredDeleteW(target().as_ptr(), CRED_TYPE_GENERIC, 0) } != 0
            || unsafe { GetLastError() } == ERROR_NOT_FOUND
        {
            Ok(())
        } else {
            Err("storageUnavailable".into())
        }
    }
}
#[cfg(not(windows))]
mod credentials {
    use super::Session;
    pub(super) fn read() -> Result<Option<Session>, String> {
        Ok(None)
    }
    pub(super) fn write(_: &Session) -> Result<(), String> {
        Err("storageUnavailable".into())
    }
    pub(super) fn delete() -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn isolated_http_handoff_refresh_logout_and_expiry_do_not_touch_credentials() {
        use std::io::{BufRead, BufReader, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let service = LauncherAccount {
            state: Arc::new(Mutex::new(State::default())),
            api: format!("http://{}", listener.local_addr().unwrap()),
            persistent: false,
        };
        let profile = serde_json::json!({"id":7,"displayName":"Website Name","loginName":"website","email":"fixture@example.invalid","emailVerified":true,"discordLinked":true,"expiresAt":now()+600});
        let token = "b".repeat(64);
        let reply = serde_json::json!({"token":token,"profile":profile});
        let server = std::thread::spawn(move || {
            for (expected, code, body, authenticated) in [
                (
                    "GET /api/users/launcher/status?state=",
                    401,
                    "{}".to_owned(),
                    false,
                ),
                (
                    "GET /api/users/launcher/status?state=",
                    200,
                    reply.to_string(),
                    false,
                ),
                (
                    "GET /api/users/launcher/me ",
                    200,
                    serde_json::json!({"profile":profile}).to_string(),
                    true,
                ),
                (
                    "POST /api/users/launcher/logout ",
                    200,
                    "{}".to_owned(),
                    true,
                ),
            ] {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(10)))
                    .unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                assert!(line.starts_with(expected));
                let mut authorization = false;
                loop {
                    line.clear();
                    reader.read_line(&mut line).unwrap();
                    if line == "\r\n" {
                        break;
                    }
                    if line.to_ascii_lowercase().starts_with("authorization:") {
                        authorization = true;
                        assert!(line.contains(&token));
                    }
                }
                assert_eq!(authorization, authenticated);
                write!(stream,"HTTP/1.1 {code} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
            }
        });
        service.begin("en").unwrap();
        assert_eq!(service.status().unwrap().state, "waiting");
        let connected = service.status().unwrap();
        assert_eq!(connected.state, "signedIn");
        assert!(!connected.remembered);
        assert_eq!(connected.profile.unwrap().id, 7);
        assert_eq!(
            service.status().unwrap().profile.unwrap().display_name,
            "Website Name"
        );
        let logout = service.logout().unwrap();
        assert_eq!(logout.remote_logout, Some(true));
        assert_eq!(logout.state, "signedOut");
        assert!(logout.profile.is_none());
        server.join().unwrap();
        service.state.lock().unwrap().pending = Some(Pending {
            state: "a".repeat(64),
            expires: 0,
        });
        assert_eq!(service.status().unwrap().state, "expired");
    }
    #[test]
    fn browser_login_has_fixed_https_origin_and_distinct_random_state() {
        let service = LauncherAccount {
            state: Arc::new(Mutex::new(State::default())),
            api: API.into(),
            persistent: false,
        };
        let first = reqwest::Url::parse(&service.begin("de").unwrap()).unwrap();
        let second = reqwest::Url::parse(&service.begin("ru").unwrap()).unwrap();
        assert_eq!(first.scheme(), "https");
        assert_eq!(first.host_str(), Some("manage.skymp-worlds.net"));
        let state = first
            .query_pairs()
            .find(|(k, _)| k == "state")
            .unwrap()
            .1
            .into_owned();
        assert!(secret(&state));
        assert_ne!(first.query(), second.query());
        service.cancel().unwrap();
        assert_eq!(service.status().unwrap().state, "signedOut");
    }
    #[test]
    fn frontend_status_never_contains_bearer_tokens() {
        let profile = Profile {
            id: 1,
            display_name: "Name".into(),
            login_name: "name".into(),
            email: "a@example.invalid".into(),
            email_verified: true,
            discord_linked: false,
            expires_at: now() + 60,
        };
        let state = State {
            session: Some(Session {
                token: "a".repeat(64),
                profile,
            }),
            ..State::default()
        };
        let json = serde_json::to_string(&LauncherAccount::snapshot(&state, "signedIn")).unwrap();
        assert!(!json.contains(&"a".repeat(64)));
        assert!(!json.contains("token"));
    }
}
