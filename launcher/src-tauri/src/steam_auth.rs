//! Native Steam ticket acquisition; private server API keys never enter the launcher.
use crate::connection::{client, ConnectRequest};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::Read;
use std::path::Path;
use std::time::Duration;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamProof {
    pub steam_id: String,
    pub steam_session: String,
    pub account_login_required: bool,
}
impl fmt::Debug for SteamProof {
    fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        out.debug_struct("SteamProof").field("steam_id", &self.steam_id).field("steam_session", &"[redacted]").finish()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Policy { steam_required: bool, steam_configured: bool, steam_app_id: u32, ticket_identity: String }

pub fn authenticate(request: &ConnectRequest, game: &Path) -> Result<Option<SteamProof>, String> {
    let configured_name = crate::player_name::validate(request.player_name.as_deref())?;
    let host = request.ip.trim();
    let fallback = format!("http://{host}:8080/");
    let base = reqwest::Url::parse(request.resource_url.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or(&fallback))
        .map_err(|_| "Invalid server web address for Steam authentication")?;
    if !["http", "https"].contains(&base.scheme()) || !base.username().is_empty() || base.password().is_some() || base.query().is_some() || base.fragment().is_some() {
        return Err("Invalid server web address for Steam authentication".into());
    }
    let client = client()?;
    let response = client.get(base.join("/api/launcher/auth-policy").map_err(|_| "Invalid Steam policy URL")?)
        .timeout(Duration::from_secs(15)).send().map_err(|_| "Server Steam policy is unavailable")?;
    // Preserve other communities' old protocol only when no new contract exists.
    if response.status() == reqwest::StatusCode::NOT_FOUND { return Ok(None); }
    if !response.status().is_success() { return Err("Server Steam policy could not be read".into()); }
    let policy: Policy = response.json().map_err(|_| "Invalid server Steam policy")?;
    if !policy.steam_required { return Ok(None); }
    if !policy.steam_configured { return Err("[STEAM_KEY_MISSING]".into()); }
    if policy.steam_app_id == 0 || policy.ticket_identity.is_empty() || policy.ticket_identity.len() > 128 || !policy.ticket_identity.bytes().all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b)) {
        return Err("Invalid Steam ticket audience in server policy".into());
    }
    native::with_ticket(game, policy.steam_app_id, &policy.ticket_identity, |steam_id, ticket, persona_name| {
        let player_name = configured_name.clone().or_else(|| crate::player_name::steam_fallback(persona_name));
        let response = client.post(base.join("/api/launcher/auth/steam").map_err(|_| "Invalid Steam authentication URL")?)
            .timeout(Duration::from_secs(20)).json(&ticket_payload(steam_id, ticket, &policy.ticket_identity, player_name.as_deref()))
            .send().map_err(|_| "Steam verification at the server is unavailable")?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let mut body = Vec::new();
            // Never echo an untrusted response, which could include credentials or HTML.
            let _ = response.take(8193).read_to_end(&mut body);
            return Err(authentication_error(status, &body));
        }
        let proof: SteamProof = response.json().map_err(|_| "Invalid Steam session response")?;
        validate_proof(&proof, steam_id)?;
        Ok(Some(proof))
    })
}

fn ticket_payload(steam_id: &str, ticket: &str, identity: &str, player_name: Option<&str>) -> serde_json::Value {
    let mut value = serde_json::json!({ "steamId": steam_id, "ticket": ticket, "ticketIdentity": identity });
    if let Some(name) = player_name { value["playerName"] = name.into(); }
    value
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamAccount { pub steam_id: String, pub persona_name: Option<String> }
pub fn account(game: &Path) -> Result<SteamAccount, String> { native::account(game) }

fn authentication_error(status: u16, body: &[u8]) -> String {
    let known = ["STEAM_KEY_MISSING", "STEAM_KEY_REJECTED", "STEAM_RATE_LIMITED", "STEAM_UNAVAILABLE",
        "STEAM_RESPONSE_INVALID", "STEAM_TICKET_INVALID", "STEAM_TICKET_REPLAY", "STEAM_TICKET_REJECTED",
        "STEAM_IDENTITY_MISMATCH", "STEAM_SESSIONS_FULL", "STEAM_STORAGE_UNAVAILABLE",
        "STEAM_TICKET_AUDIENCE_MISMATCH", "STEAM_POLICY_CHANGED", "PLAYER_NAME_INVALID"];
    let json = if body.len() <= 8192 { serde_json::from_slice::<serde_json::Value>(body).ok() } else { None };
    let reported = json.as_ref().and_then(|value| value["code"].as_str()).filter(|code| known.contains(code));
    let legacy = json.as_ref().and_then(|value| value["error"].as_str());
    let fallback = match (status, legacy) {
        (429, _) => "STEAM_RATE_LIMITED",
        (_, Some("Server administrator must configure the Steam Web API key.")) => "STEAM_KEY_MISSING",
        (_, Some("Steam authentication is temporarily unavailable.")) => "STEAM_UNAVAILABLE",
        (401 | 403, _) => "STEAM_TICKET_REJECTED",
        (500..=599, _) => "STEAM_UNAVAILABLE",
        _ => "STEAM_RESPONSE_INVALID",
    };
    let code = reported.unwrap_or(fallback);
    let upstream = json.as_ref().and_then(|value| value["steamErrorCode"].as_u64()).filter(|value| *value <= u32::MAX as u64);
    // Older servers report Valve's observed audience error as a generic refusal.
    let code = if code == "STEAM_TICKET_REJECTED" && upstream == Some(105) {
        "STEAM_TICKET_AUDIENCE_MISMATCH"
    } else { code };
    match upstream {
        Some(value) => format!("[{code}] HTTP {status}; Steam {value}"),
        None => format!("[{code}] HTTP {status}"),
    }
}

fn validate_proof(proof: &SteamProof, expected: &str) -> Result<(), String> {
    if proof.steam_id != expected || proof.steam_session.len() != 64 || !proof.steam_session.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Server returned an invalid Steam identity/session".into());
    }
    Ok(())
}

fn parse_ticket(bytes: &[u8], handle: u32) -> Result<Option<Vec<u8>>, String> {
    if bytes.len() < 12 { return Err("Truncated Steam ticket callback".into()); }
    if u32::from_le_bytes(bytes[0..4].try_into().unwrap()) != handle { return Ok(None); }
    if i32::from_le_bytes(bytes[4..8].try_into().unwrap()) != 1 { return Err("Steam refused an authentication ticket".into()); }
    let length = i32::from_le_bytes(bytes[8..12].try_into().unwrap());
    if !(16..=2560).contains(&length) || bytes.len() < 12 + length as usize { return Err("Invalid Steam ticket callback size".into()); }
    Ok(Some(bytes[12..12 + length as usize].to_vec()))
}

#[cfg(not(target_os = "windows"))]
mod native {
    use super::*;
    pub fn account(_: &Path) -> Result<SteamAccount, String> { Err("Steam account lookup requires Windows".into()) }
    pub fn with_ticket<T, F: FnOnce(&str, &str, &str) -> Result<T, String>>(_: &Path, _: u32, _: &str, _: F) -> Result<T, String> {
        Err("Native Steam authentication requires the Windows launcher".into())
    }
}

#[cfg(all(target_os = "windows", target_pointer_width = "64"))]
mod native {
    use super::*;
    use std::ffi::{c_char, c_void, CString, OsString};
    use std::os::windows::ffi::OsStrExt;
    use std::time::Instant;

    #[link(name = "kernel32")]
    extern "system" {
        fn LoadLibraryExW(name: *const u16, file: *mut c_void, flags: u32) -> *mut c_void;
        fn GetProcAddress(module: *mut c_void, name: *const c_char) -> *mut c_void;
        fn FreeLibrary(module: *mut c_void) -> i32;
    }
    type Shutdown = unsafe extern "C" fn();
    type Cancel = unsafe extern "C" fn(*mut c_void, u32);
    #[repr(C)]
    struct Callback { user: i32, id: i32, bytes: *mut u8, length: i32 }
    struct Environment(Vec<(&'static str, Option<OsString>)>);
    impl Drop for Environment {
        fn drop(&mut self) { for (key, value) in &self.0 { match value { Some(value) => std::env::set_var(key, value), None => std::env::remove_var(key) } } }
    }
    struct Api { library: *mut c_void, shutdown: Option<Shutdown>, initialized: bool, user: *mut c_void, cancel: Option<Cancel>, ticket: u32, _environment: Environment }
    impl Drop for Api {
        fn drop(&mut self) { unsafe {
            if self.ticket != 0 { if let Some(cancel) = self.cancel { cancel(self.user, self.ticket); } }
            if self.initialized { if let Some(shutdown) = self.shutdown { shutdown(); } }
            FreeLibrary(self.library);
        } }
    }
    unsafe fn symbol<T: Copy>(library: *mut c_void, name: &'static [u8]) -> Result<T, String> {
        let pointer = GetProcAddress(library, name.as_ptr() as *const c_char);
        if pointer.is_null() { return Err("The installed Steam API lacks a required function; update Steam/Skyrim".into()); }
        Ok(std::mem::transmute_copy(&pointer))
    }
    unsafe fn method<T: Copy>(user: *mut c_void, index: usize) -> T {
        let table = *(user as *const *const *const c_void);
        let pointer = *table.add(index);
        std::mem::transmute_copy(&pointer)
    }

    static SDK_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    fn open_api(game: &Path, app_id: u32) -> Result<(Api, String), String> {
        // Both account lookup and ticket acquisition hold the same process-wide SDK lock.
        let environment = Environment(["SteamAppId", "SteamGameId"].into_iter().map(|key| (key, std::env::var_os(key))).collect());
        std::env::set_var("SteamAppId", app_id.to_string()); std::env::set_var("SteamGameId", app_id.to_string());
        let dll = game.join("steam_api64.dll").canonicalize().map_err(|_| "Steam's steam_api64.dll is missing from the Skyrim folder")?;
        let mut wide: Vec<u16> = dll.as_os_str().encode_wide().collect(); wide.push(0);
        unsafe {
            let library = LoadLibraryExW(wide.as_ptr(), std::ptr::null_mut(), 0x00000100 | 0x00001000);
            if library.is_null() { return Err("Steam's native library could not be loaded".into()); }
            let mut api = Api { library, shutdown: None, initialized: false, user: std::ptr::null_mut(), cancel: None, ticket: 0, _environment: environment };
            api.shutdown = Some(symbol(library, b"SteamAPI_Shutdown\0")?);
            let init: unsafe extern "C" fn() -> bool = symbol(library, b"SteamAPI_Init\0")?;
            if !init() { return Err("Start Steam, sign in, and ensure Skyrim is installed in your Steam account".into()); }
            api.initialized = true;
            let h_user: unsafe extern "C" fn() -> i32 = symbol(library, b"SteamAPI_GetHSteamUser\0")?;
            let interface: unsafe extern "C" fn(i32, *const c_char) -> *mut c_void = symbol(library, b"SteamInternal_FindOrCreateUserInterface\0")?;
            // Request a versioned interface from the running Steam client. Skyrim's
            // older redistribution DLL does not export GetAuthTicketForWebApi itself.
            api.user = interface(h_user(), b"SteamUser023\0".as_ptr() as *const c_char);
            if api.user.is_null() { return Err("Update the Steam client; SteamUser023 is unavailable".into()); }
            let logged_on: unsafe extern "C" fn(*mut c_void) -> bool = symbol(library, b"SteamAPI_ISteamUser_BLoggedOn\0")?;
            let get_id: unsafe extern "C" fn(*mut c_void) -> u64 = symbol(library, b"SteamAPI_ISteamUser_GetSteamID\0")?;
            if !logged_on(api.user) { return Err("Steam is not signed in online".into()); }
            let steam_id = get_id(api.user).to_string();
            if steam_id.len() != 17 { return Err("Steam returned an invalid account ID".into()); }
            let utils = interface(h_user(), b"SteamUtils010\0".as_ptr() as *const c_char);
            if utils.is_null() { return Err("Update Steam; the game application identity could not be checked".into()); }
            let get_app: unsafe extern "C" fn(*mut c_void) -> u32 = symbol(library, b"SteamAPI_ISteamUtils_GetAppID\0")?;
            if get_app(utils) != app_id { return Err("[STEAM_APP_MISMATCH]".into()); }
            Ok((api, steam_id))
        }
    }
    unsafe fn persona_name(api: &Api) -> Option<String> {
        let h_user: unsafe extern "C" fn() -> i32 = symbol(api.library, b"SteamAPI_GetHSteamUser\0").ok()?;
        let interface: unsafe extern "C" fn(i32, *const c_char) -> *mut c_void = symbol(api.library, b"SteamInternal_FindOrCreateUserInterface\0").ok()?;
        let get_name: unsafe extern "C" fn(*mut c_void) -> *const c_char = symbol(api.library, b"SteamAPI_ISteamFriends_GetPersonaName\0").ok()?;
        for version in [b"SteamFriends017\0".as_slice(), b"SteamFriends015\0".as_slice()] {
            let friends = interface(h_user(), version.as_ptr() as *const c_char);
            if friends.is_null() { continue; }
            let value = get_name(friends);
            if !value.is_null() { return crate::player_name::steam_fallback(&std::ffi::CStr::from_ptr(value).to_string_lossy()); }
        }
        None
    }
    pub fn account(game: &Path) -> Result<SteamAccount, String> {
        let _lock = SDK_LOCK.lock().map_err(|_| "Steam SDK is busy")?;
        let (api, steam_id) = open_api(game, 489830)?;
        let persona_name = unsafe { persona_name(&api) };
        Ok(SteamAccount { steam_id, persona_name })
    }
    pub fn with_ticket<T, F: FnOnce(&str, &str, &str) -> Result<T, String>>(game: &Path, app_id: u32, identity: &str, action: F) -> Result<T, String> {
        let _lock = SDK_LOCK.lock().map_err(|_| "Steam SDK is busy")?;
        let (mut api, steam_id) = open_api(game, app_id)?;
        unsafe {
            let library = api.library;
            let persona_name = persona_name(&api).unwrap_or_default();
            // ISteamUser023 slots are fixed by Valve's versioned interface contract.
            let get_ticket: unsafe extern "C" fn(*mut c_void, *const c_char) -> u32 = method(api.user, 14);
            api.cancel = Some(method(api.user, 17));
            let dispatch_init: unsafe extern "C" fn() = symbol(library, b"SteamAPI_ManualDispatch_Init\0")?;
            let pipe: unsafe extern "C" fn() -> i32 = symbol(library, b"SteamAPI_GetHSteamPipe\0")?;
            let run: unsafe extern "C" fn(i32) = symbol(library, b"SteamAPI_ManualDispatch_RunFrame\0")?;
            let next: unsafe extern "C" fn(i32, *mut Callback) -> bool = symbol(library, b"SteamAPI_ManualDispatch_GetNextCallback\0")?;
            let free: unsafe extern "C" fn(i32) = symbol(library, b"SteamAPI_ManualDispatch_FreeLastCallback\0")?;
            dispatch_init();
            let identity = CString::new(identity).map_err(|_| "Invalid Steam service identity")?;
            api.ticket = get_ticket(api.user, identity.as_ptr());
            if api.ticket == 0 { return Err("Steam could not issue an authentication ticket".into()); }
            let deadline = Instant::now() + Duration::from_secs(15);
            while Instant::now() < deadline {
                run(pipe());
                let mut callback = Callback { user: 0, id: 0, bytes: std::ptr::null_mut(), length: 0 };
                while next(pipe(), &mut callback) {
                    let parsed = if callback.id == 168 && !callback.bytes.is_null() && (12..=4096).contains(&callback.length) {
                        parse_ticket(std::slice::from_raw_parts(callback.bytes, callback.length as usize), api.ticket)
                    } else { Ok(None) };
                    free(pipe());
                    if let Some(bytes) = parsed? {
                        let ticket = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
                        return action(&steam_id, &ticket, &persona_name);
                    }
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err("Steam ticket timed out. Check the Steam connection and retry".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ticket_request_echoes_the_exact_server_audience() {
        let identity = "skymp1234567890abcdef12345678";
        let payload = ticket_payload("76561198000000000", "ab12", identity, None);
        assert_eq!(payload["ticketIdentity"], identity);
        assert_eq!(payload["steamId"], "76561198000000000");
        assert_eq!(payload["ticket"], "ab12");
        assert!(payload.get("playerName").is_none());
        let named = ticket_payload("76561198000000000", "ab12", identity, Some("Hüter ÄÖÜ Довакин"));
        assert_eq!(named["playerName"], "Hüter ÄÖÜ Довакин");
        assert_eq!(named["steamId"], payload["steamId"]);
    }
    #[test]
    fn ticket_audience_and_changed_policy_have_distinct_errors() {
        assert_eq!(authentication_error(401, br#"{"code":"STEAM_TICKET_REJECTED","steamErrorCode":105}"#), "[STEAM_TICKET_AUDIENCE_MISMATCH] HTTP 401; Steam 105");
        assert_eq!(authentication_error(401, br#"{"code":"STEAM_TICKET_AUDIENCE_MISMATCH","steamErrorCode":105}"#), "[STEAM_TICKET_AUDIENCE_MISMATCH] HTTP 401; Steam 105");
        assert_eq!(authentication_error(409, br#"{"code":"STEAM_POLICY_CHANGED"}"#), "[STEAM_POLICY_CHANGED] HTTP 409");
    }
    #[test]
    fn callback_requires_matching_handle_success_and_bounded_payload() {
        let mut bytes = vec![0; 44];
        bytes[0..4].copy_from_slice(&7u32.to_le_bytes()); bytes[4..8].copy_from_slice(&1i32.to_le_bytes()); bytes[8..12].copy_from_slice(&32i32.to_le_bytes());
        assert_eq!(parse_ticket(&bytes, 8).unwrap(), None);
        assert_eq!(parse_ticket(&bytes, 7).unwrap().unwrap().len(), 32);
        bytes[8..12].copy_from_slice(&3000i32.to_le_bytes()); assert!(parse_ticket(&bytes, 7).is_err());
        bytes[4..8].copy_from_slice(&2i32.to_le_bytes()); assert!(parse_ticket(&bytes, 7).is_err());
        assert!(parse_ticket(&[0; 11], 7).is_err());
    }
    #[test]
    fn proof_identity_must_match_and_debug_never_discloses_token() {
        let proof = SteamProof { steam_id: "76561198000000000".into(), steam_session: "a".repeat(64), account_login_required: false };
        assert!(validate_proof(&proof, &proof.steam_id).is_ok());
        assert!(validate_proof(&proof, "76561198000000001").is_err());
        assert!(!format!("{proof:?}").contains(&proof.steam_session));
    }
    #[test]
    fn server_ticket_denial_does_not_accuse_the_api_key() {
        let error = authentication_error(401, br#"{"error":"Steam authentication failed. Request a fresh ticket in the launcher."}"#);
        assert_eq!(error, "[STEAM_TICKET_REJECTED] HTTP 401");
    }
    #[test]
    fn server_error_codes_preserve_safe_diagnostics() {
        assert_eq!(authentication_error(503, br#"{"code":"STEAM_KEY_REJECTED","error":"private payload"}"#), "[STEAM_KEY_REJECTED] HTTP 503");
        assert_eq!(authentication_error(401, br#"{"code":"STEAM_TICKET_REJECTED","steamErrorCode":101}"#), "[STEAM_TICKET_REJECTED] HTTP 401; Steam 101");
        assert_eq!(authentication_error(429, b""), "[STEAM_RATE_LIMITED] HTTP 429");
        assert_eq!(authentication_error(503, b""), "[STEAM_UNAVAILABLE] HTTP 503");
    }
    #[test]
    fn untrusted_server_errors_never_echo_secrets_or_unbounded_responses() {
        let secret = "sensitive-session-and-api-key";
        let body = serde_json::to_vec(&serde_json::json!({"code":secret,"error":secret,"steamErrorCode":secret})).unwrap();
        assert_eq!(authentication_error(401, &body), "[STEAM_TICKET_REJECTED] HTTP 401");
        assert_eq!(authentication_error(502, &vec![b'a';8193]), "[STEAM_UNAVAILABLE] HTTP 502");
        assert_eq!(authentication_error(401, br#"{"steamErrorCode":-1}"#), "[STEAM_TICKET_REJECTED] HTTP 401");
    }
    #[test]
    #[ignore = "requires the user's running Steam client; never starts Skyrim"]
    fn native_steam_ticket_probe() {
        let game = std::env::var("SKYMP_STEAM_GAME_DIR").expect("Set SKYMP_STEAM_GAME_DIR");
        native::with_ticket(Path::new(&game), 489830, "skymp-worlds:local-validation", |steam_id, ticket, _persona| {
            assert_eq!(steam_id.len(), 17); assert!(ticket.len() >= 32);
            println!("Native Steam Web API ticket received ({} bytes); ticket not printed; Skyrim not started", ticket.len() / 2);
            Ok(())
        }).unwrap();
    }

}
