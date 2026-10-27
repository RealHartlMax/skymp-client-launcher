// SkyMP Launcher – Tauri backend (Rust)
//
// Verify server resources and the client runtime before activating a server and launching SKSE.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use connection::{ConnectRequest, ImportedServer, PreparedServer, PreservedFile};
use serde::Deserialize;
use serde::Serialize;
use skymp_launcher::connection;
use skymp_launcher::game_session::{GameSession, GameStatus};
use skymp_launcher::crash_reports::{CrashReports, ReportContext, ReportSummary};
use skymp_launcher::discord_presence::{DiscordPresence, PresenceRequest, PresenceStatus};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::command;
use tauri::Manager;

static PREPARING: AtomicBool = AtomicBool::new(false);

struct OperationGuard;
impl OperationGuard {
    fn acquire() -> Result<Self, String> {
        PREPARING
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| Self)
            .map_err(|_| "A server is already being prepared".into())
    }
}
impl Drop for OperationGuard {
    fn drop(&mut self) {
        PREPARING.store(false, Ordering::SeqCst);
    }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct SkyrimInstallCheck {
    resolved_path: Option<String>,
    has_game: bool,
    has_skse: bool,
    message: String,
}

#[derive(Debug, Serialize)]
struct SkyrimEnvironmentStatus {
    resolved_path: Option<String>,
    has_game: bool,
    has_skse: bool,
    has_plugins_dir: bool,
    can_write_plugins: bool,
    has_existing_settings: bool,
    message: String,
}

#[derive(Debug, Deserialize)]
struct ExistingSkympClientSettings {
    #[serde(rename = "server-ip")]
    server_ip: Option<String>,
    #[serde(rename = "server-port")]
    server_port: Option<u16>,
    #[serde(rename = "master")]
    master: Option<String>,
    #[serde(rename = "server-master-key")]
    server_master_key: Option<String>,
    #[serde(rename = "gameData")]
    game_data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct ImportedSkympClientSettings {
    found: bool,
    path: Option<String>,
    server_ip: Option<String>,
    server_port: Option<u16>,
    master: Option<String>,
    server_master_key: Option<String>,
    offline: bool,
    profile_id: Option<u32>,
    message: String,
}

#[derive(Clone, Copy)]
enum UiLanguage {
    De,
    En,
    Ru,
}

// ---------------------------------------------------------------------------
// Tauri commands (callable from the React frontend via `invoke`)
// ---------------------------------------------------------------------------

fn skyrim_profile_dir() -> Result<PathBuf, String> {
    std::env::var_os("LOCALAPPDATA")
        .map(|p| PathBuf::from(p).join("Skyrim Special Edition"))
        .ok_or("LOCALAPPDATA is unavailable; cannot set the Skyrim plugin load order".into())
}

fn ensure_game_stopped() -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let output = std::process::Command::new("tasklist.exe")
            .args(["/FI", "IMAGENAME eq SkyrimSE.exe", "/FO", "CSV", "/NH"])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("Check running game: {e}"))?;
        if !output.status.success() {
            return Err("Could not check whether Skyrim is running".into());
        }
        if String::from_utf8_lossy(&output.stdout)
            .to_ascii_lowercase()
            .contains("skyrimse.exe")
        {
            return Err("Please close Skyrim before preparing or switching servers".into());
        }
    }
    Ok(())
}

async fn connect(
    request: ConnectRequest,
    window: tauri::Window,
    app: tauri::AppHandle,
    launch: bool,
) -> Result<PreparedServer, String> {
    let guard = OperationGuard::acquire()?;
    let session = app.state::<GameSession>().inner().clone();
    let reports = app.state::<CrashReports>().inner().clone();
    let cache = app
        .path_resolver()
        .app_cache_dir()
        .ok_or("Launcher cache directory unavailable")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        if session.is_active() {
            return Err("Skyrim is already starting or running".into());
        }
        ensure_game_stopped()?;
        let game = resolve_skyrim_dir(request.skyrim_dir.clone())?;
        let mut request = request;
        if launch {
            let _ = window.emit("server-preparation", connection::Progress {
                operation_id: request.operation_id.clone(), stage: "steam", file: "Steam".into(), completed: 0, total: 1
            });
            request.steam_auth = skymp_launcher::steam_auth::authenticate(&request, &game)?;
        }
        let result = connection::prepare(
            &request,
            &game,
            &skyrim_profile_dir()?,
            &cache,
            |progress| {
                let _ = window.emit("server-preparation", progress);
            },
        )?;
        if launch {
            let version = skymp_launcher::runtime_version::read(&game.join("SkyrimSE.exe")).ok().map(skymp_launcher::runtime_version::display).unwrap_or_default();
            let skse = skymp_launcher::runtime_version::read(&game.join("skse64_loader.exe")).ok().map(|v|if v[0]==0 {format!("{}.{}.{}",v[1],v[2],v[3])}else{skymp_launcher::runtime_version::display(v)}).unwrap_or_default();
            let server_id = request.server_master_key.clone().filter(|id| id.starts_with("srv_") && id.len() <= 128 && id.bytes().all(|b|b.is_ascii_alphanumeric() || b==b'_'));
            // Report collection must not stop a valid connection if local diagnostics fail.
            let _ = reports.begin_game(ReportContext {game:game.clone(),profile:skyrim_profile_dir()?,server_id,operation_id:request.operation_id.clone(),verified_files:result.verified_files,runtime_manifest_sha256:result.runtime_manifest_sha256.clone(),game_version:version,skse_version:skse,load_order:result.load_order.clone(),..ReportContext::default()});
            launch_skse(
                &game,
                &session,
                request.operation_id.clone(),
                window.clone(),
                reports,
            )?;
        }
        Ok(result)
    })
    .await
    .map_err(|e| format!("Server preparation failed: {e}"))?
}

#[command]
async fn join_server(
    request: ConnectRequest,
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<PreparedServer, String> {
    connect(request, window, app, true).await
}

#[command]
async fn prepare_server(
    request: ConnectRequest,
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<PreparedServer, String> {
    connect(request, window, app, false).await
}

#[command]
async fn restore_skyrim(
    skyrim_dir: Option<String>,
    session: tauri::State<'_, GameSession>,
) -> Result<Vec<PreservedFile>, String> {
    let guard = OperationGuard::acquire()?;
    let session = session.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        if session.is_active() {
            return Err("Close Skyrim before restoring original files".into());
        }
        ensure_game_stopped()?;
        connection::restore_installation(&resolve_skyrim_dir(skyrim_dir)?, &skyrim_profile_dir()?)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[command]
fn import_server_build(build_dir: String, connect_host: String) -> Result<ImportedServer, String> {
    connection::import_build(&build_dir, &connect_host)
}

#[command]
fn check_skyrim_install(skyrim_dir: Option<String>) -> SkyrimInstallCheck {
    check_skyrim_install_with_language(skyrim_dir, None)
}

#[command]
fn check_skyrim_install_with_language(
    skyrim_dir: Option<String>,
    language: Option<String>,
) -> SkyrimInstallCheck {
    let lang = parse_language(language.as_deref());

    if let Some(value) = skyrim_dir {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(trimmed);
            if is_valid_skyrim_dir(&candidate) {
                return SkyrimInstallCheck {
                    resolved_path: Some(candidate.to_string_lossy().to_string()),
                    has_game: true,
                    has_skse: candidate.join("skse64_loader.exe").is_file(),
                    message: msg_skse_found(lang).to_string(),
                };
            }

            return SkyrimInstallCheck {
                resolved_path: Some(candidate.to_string_lossy().to_string()),
                has_game: false,
                has_skse: false,
                message: msg_skse_missing_in_selected_path(lang).to_string(),
            };
        }
    }

    for candidate in get_skyrim_candidates() {
        if is_valid_skyrim_dir(&candidate) {
            return SkyrimInstallCheck {
                resolved_path: Some(candidate.to_string_lossy().to_string()),
                has_game: true,
                has_skse: candidate.join("skse64_loader.exe").is_file(),
                message: msg_skyrim_with_skse_detected(lang).to_string(),
            };
        }
    }

    SkyrimInstallCheck {
        resolved_path: None,
        has_game: false,
        has_skse: false,
        message: msg_no_valid_skyrim_with_skse(lang).to_string(),
    }
}

#[command]
fn check_skyrim_environment(skyrim_dir: Option<String>) -> SkyrimEnvironmentStatus {
    check_skyrim_environment_with_language(skyrim_dir, None)
}

#[command]
fn check_skyrim_environment_with_language(
    skyrim_dir: Option<String>,
    language: Option<String>,
) -> SkyrimEnvironmentStatus {
    let lang = parse_language(language.as_deref());

    let path = if let Some(value) = skyrim_dir {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            find_skyrim_install()
        } else {
            Some(PathBuf::from(trimmed))
        }
    } else {
        find_skyrim_install()
    };

    let Some(skyrim_path) = path else {
        return SkyrimEnvironmentStatus {
            resolved_path: None,
            has_game: false,
            has_skse: false,
            has_plugins_dir: false,
            can_write_plugins: false,
            has_existing_settings: false,
            message: msg_skyrim_not_found_set_path(lang).to_string(),
        };
    };

    let has_game = is_valid_skyrim_dir(&skyrim_path);
    let has_skse = skyrim_path.join("skse64_loader.exe").is_file();
    let plugins_dir = skyrim_path.join("Data").join("Platform").join("Plugins");
    let has_plugins_dir = plugins_dir.is_dir();
    let can_write_plugins = has_game && can_write_to_plugins_dir(&plugins_dir);
    let has_existing_settings = plugins_dir.join("skymp5-client-settings.txt").is_file();

    SkyrimEnvironmentStatus {
        resolved_path: Some(skyrim_path.to_string_lossy().to_string()),
        has_game,
        has_skse,
        has_plugins_dir,
        can_write_plugins,
        has_existing_settings,
        message: if has_game {
            msg_skyrim_environment_checked(lang).to_string()
        } else {
            msg_skse_missing_in_selected_folder(lang).to_string()
        },
    }
}

#[command]
fn import_skymp_settings(skyrim_dir: Option<String>) -> ImportedSkympClientSettings {
    import_skymp_settings_with_language(skyrim_dir, None)
}

#[command]
fn import_skymp_settings_with_language(
    skyrim_dir: Option<String>,
    language: Option<String>,
) -> ImportedSkympClientSettings {
    let lang = parse_language(language.as_deref());

    let path = if let Some(value) = skyrim_dir {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            find_skyrim_install()
        } else {
            Some(PathBuf::from(trimmed))
        }
    } else {
        find_skyrim_install()
    };

    let Some(skyrim_path) = path else {
        return ImportedSkympClientSettings {
            found: false,
            path: None,
            server_ip: None,
            server_port: None,
            master: None,
            server_master_key: None,
            offline: false,
            profile_id: None,
            message: msg_no_skyrim_path_found(lang).to_string(),
        };
    };

    let settings_path = skyrim_path
        .join("Data")
        .join("Platform")
        .join("Plugins")
        .join("skymp5-client-settings.txt");
    if !settings_path.is_file() {
        return ImportedSkympClientSettings {
            found: false,
            path: Some(settings_path.to_string_lossy().to_string()),
            server_ip: None,
            server_port: None,
            master: None,
            server_master_key: None,
            offline: false,
            profile_id: None,
            message: msg_no_existing_settings_file(lang).to_string(),
        };
    }

    let content = match fs::read_to_string(&settings_path) {
        Ok(value) => value,
        Err(_) => {
            return ImportedSkympClientSettings {
                found: false,
                path: Some(settings_path.to_string_lossy().to_string()),
                server_ip: None,
                server_port: None,
                master: None,
                server_master_key: None,
                offline: false,
                profile_id: None,
                message: msg_could_not_read_file(lang).to_string(),
            };
        }
    };

    let parsed: ExistingSkympClientSettings = match serde_json::from_str(&content) {
        Ok(value) => value,
        Err(_) => {
            return ImportedSkympClientSettings {
                found: false,
                path: Some(settings_path.to_string_lossy().to_string()),
                server_ip: None,
                server_port: None,
                master: None,
                server_master_key: None,
                offline: false,
                profile_id: None,
                message: msg_invalid_json_file(lang).to_string(),
            };
        }
    };

    let profile_id = parsed
        .game_data
        .as_ref()
        .and_then(|v| v["profileId"].as_u64())
        .and_then(|v| u32::try_from(v).ok());
    ImportedSkympClientSettings {
        found: true,
        path: Some(settings_path.to_string_lossy().to_string()),
        server_ip: parsed.server_ip,
        server_port: parsed.server_port,
        master: parsed.master,
        server_master_key: parsed.server_master_key,
        offline: profile_id.is_some(),
        profile_id,
        message: msg_settings_imported_success(lang).to_string(),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn resolve_skyrim_dir(custom_dir: Option<String>) -> Result<PathBuf, String> {
    if let Some(value) = custom_dir {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(trimmed);
            if is_valid_skyrim_dir(&candidate) {
                return Ok(candidate);
            }
            return Err("Configured Skyrim folder is invalid (SkyrimSE.exe missing)".to_string());
        }
    }

    for candidate in get_skyrim_candidates() {
        if is_valid_skyrim_dir(&candidate) {
            return Ok(candidate);
        }
    }

    Err("Skyrim installation not found automatically. Please configure Skyrim folder in launcher settings.".to_string())
}

fn is_valid_skyrim_dir(path: &PathBuf) -> bool {
    path.join("SkyrimSE.exe").is_file()
}

fn get_skyrim_candidates() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
        candidates.push(
            PathBuf::from(program_files_x86)
                .join("Steam")
                .join("steamapps")
                .join("common")
                .join("Skyrim Special Edition"),
        );
    }

    for drive in ["C", "D", "E", "F", "G", "H"] {
        candidates.push(
            PathBuf::from(format!("{}:\\", drive))
                .join("SteamLibrary")
                .join("steamapps")
                .join("common")
                .join("Skyrim Special Edition"),
        );
        candidates.push(
            PathBuf::from(format!("{}:\\", drive))
                .join("Program Files (x86)")
                .join("Steam")
                .join("steamapps")
                .join("common")
                .join("Skyrim Special Edition"),
        );
    }

    candidates
}

fn find_skyrim_install() -> Option<PathBuf> {
    for candidate in get_skyrim_candidates() {
        if is_valid_skyrim_dir(&candidate) {
            return Some(candidate);
        }
    }

    None
}

fn can_write_to_plugins_dir(plugins_dir: &PathBuf) -> bool {
    if fs::create_dir_all(plugins_dir).is_err() {
        return false;
    }

    let nonce = match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_millis(),
        Err(_) => 0,
    };

    let test_file = plugins_dir.join(format!(".skymp_write_test_{}.tmp", nonce));
    match fs::write(&test_file, b"ok") {
        Ok(_) => {
            let _ = fs::remove_file(&test_file);
            true
        }
        Err(_) => false,
    }
}

fn parse_language(value: Option<&str>) -> UiLanguage {
    match value.unwrap_or("en").to_lowercase().as_str() {
        "de" => UiLanguage::De,
        "ru" => UiLanguage::Ru,
        _ => UiLanguage::En,
    }
}

fn msg_skse_found(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Skyrim gefunden; Clientdateien werden vor dem Verbinden geprüft",
        UiLanguage::En => "Skyrim found; client files are checked before connecting",
        UiLanguage::Ru => "Skyrim найден; файлы клиента будут проверены перед подключением",
    }
}

fn msg_skse_missing_in_selected_path(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "SkyrimSE.exe wurde im ausgewählten Spieleordner nicht gefunden",
        UiLanguage::En => "SkyrimSE.exe was not found in the selected game folder",
        UiLanguage::Ru => "SkyrimSE.exe не найден в выбранной папке игры",
    }
}

fn msg_skyrim_with_skse_detected(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Skyrim-Installation automatisch erkannt",
        UiLanguage::En => "Skyrim installation detected automatically",
        UiLanguage::Ru => "Установка Skyrim обнаружена автоматически",
    }
}

fn msg_no_valid_skyrim_with_skse(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Keine gültige Skyrim-Installation gefunden",
        UiLanguage::En => "No valid Skyrim installation found",
        UiLanguage::Ru => "Не найдена корректная установка Skyrim",
    }
}

fn msg_skyrim_not_found_set_path(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Skyrim nicht gefunden. Bitte Installationspfad angeben.",
        UiLanguage::En => "Skyrim not found. Please provide installation path.",
        UiLanguage::Ru => "Skyrim не найден. Укажите путь установки.",
    }
}

fn msg_skyrim_environment_checked(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Skyrim Umgebung geprueft",
        UiLanguage::En => "Skyrim environment checked",
        UiLanguage::Ru => "Окружение Skyrim проверено",
    }
}

fn msg_skse_missing_in_selected_folder(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "SkyrimSE.exe fehlt im gewählten Ordner",
        UiLanguage::En => "SkyrimSE.exe is missing in the selected folder",
        UiLanguage::Ru => "SkyrimSE.exe отсутствует в выбранной папке",
    }
}

fn msg_no_skyrim_path_found(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Kein Skyrim Pfad gefunden",
        UiLanguage::En => "No Skyrim path found",
        UiLanguage::Ru => "Путь к Skyrim не найден",
    }
}

fn msg_no_existing_settings_file(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Keine bestehende skymp5-client-settings.txt gefunden",
        UiLanguage::En => "No existing skymp5-client-settings.txt found",
        UiLanguage::Ru => "Файл skymp5-client-settings.txt не найден",
    }
}

fn msg_could_not_read_file(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Datei konnte nicht gelesen werden",
        UiLanguage::En => "Could not read file",
        UiLanguage::Ru => "Не удалось прочитать файл",
    }
}

fn msg_invalid_json_file(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Datei ist kein gueltiges JSON",
        UiLanguage::En => "File is not valid JSON",
        UiLanguage::Ru => "Файл не является корректным JSON",
    }
}

fn msg_settings_imported_success(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Einstellungen erfolgreich importiert",
        UiLanguage::En => "Settings imported successfully",
        UiLanguage::Ru => "Настройки успешно импортированы",
    }
}

fn launch_skse(
    skyrim_dir: &PathBuf,
    session: &GameSession,
    operation_id: String,
    window: tauri::Window,
    reports: CrashReports,
) -> Result<(), String> {
    let skse_loader = skyrim_dir.join("skse64_loader.exe");
    let version = skymp_launcher::runtime_version::read(&skyrim_dir.join("SkyrimSE.exe"))?;
    let runtime = skyrim_dir.join(format!(
        "skse64_{}_{}_{}.dll",
        version[0], version[1], version[2]
    ));
    if !skse_loader.is_file() || !runtime.is_file() {
        return Err(format!("SKSE for Skyrim {} is missing. Use a complete client package or version catalog for this server.", skymp_launcher::runtime_version::display(version)));
    }
    if skymp_launcher::runtime_version::read(&skse_loader)?
        != skymp_launcher::runtime_version::read(&runtime)?
    {
        return Err("The SKSE loader and runtime DLL have different versions. Prepare the matching client package again.".into());
    }

    session.launch(skyrim_dir, &skse_loader, operation_id, move |status| {
        let _ = window.emit("game-lifecycle", status.clone());
        if status.phase == "running" { if let Some(pid)=status.pid {reports.attach_game(pid);} }
        if let Some(report)=reports.finish_game(&status) {let _=window.emit("crash-report-ready",report);}
    })
}

#[command]
fn game_launch_status(session: tauri::State<'_, GameSession>) -> GameStatus {
    session.status()
}

#[command]
async fn steam_account(skyrim_dir: Option<String>) -> Result<skymp_launcher::steam_auth::SteamAccount, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let game = resolve_skyrim_dir(skyrim_dir)?;
        skymp_launcher::steam_auth::account(&game)
    }).await.map_err(|_| "Steam account lookup failed")?
}

#[command]
fn discord_presence_update(request: PresenceRequest, presence: tauri::State<'_, DiscordPresence>) -> Result<PresenceStatus, String> {
    presence.update(request)
}
#[command]
fn discord_presence_status(presence: tauri::State<'_, DiscordPresence>) -> Result<PresenceStatus, String> { presence.status() }

#[command]
async fn crash_reports_list(reports: tauri::State<'_, CrashReports>) -> Result<Vec<ReportSummary>, String> {
    let reports=reports.inner().clone(); tauri::async_runtime::spawn_blocking(move || reports.list()).await.map_err(|_|"Cannot list reports")?
}
#[command]
async fn crash_report_submit(id:String, comment:String, contact:String, include_dump:bool, reports:tauri::State<'_,CrashReports>) -> Result<ReportSummary,String> {
    let reports=reports.inner().clone();tauri::async_runtime::spawn_blocking(move || reports.submit(&id,&comment,&contact,include_dump)).await.map_err(|_|"Report task failed")?
}
#[command]
async fn crash_report_export(id:String,comment:String,contact:String,include_dump:bool,reports:tauri::State<'_,CrashReports>)->Result<String,String> {
    let reports=reports.inner().clone();tauri::async_runtime::spawn_blocking(move || {reports.edit(&id,&comment,&contact)?;reports.export(&id,include_dump)}).await.map_err(|_|"Export task failed")?
}
#[command]
fn crash_report_dismiss(id:String,reports:tauri::State<'_,CrashReports>)->Result<(),String>{reports.dismiss(&id)}
#[command]
fn crash_capture_setting(reports:tauri::State<'_,CrashReports>)->bool{reports.capture_enabled()}
#[command]
fn set_crash_capture(enabled:bool,reports:tauri::State<'_,CrashReports>)->Result<(),String>{reports.set_capture_enabled(enabled)}
#[command]
fn set_crash_report_language(language:String,reports:tauri::State<'_,CrashReports>)->Result<(),String>{reports.set_language(&language)}

struct LauncherReportLock(#[allow(dead_code)] std::fs::File);

#[command]
fn launcher_account_begin(language:String, account:tauri::State<'_,skymp_launcher::launcher_account::LauncherAccount>)->Result<String,String>{account.begin(&language)}
#[command]
async fn launcher_account_status(account:tauri::State<'_,skymp_launcher::launcher_account::LauncherAccount>)->Result<skymp_launcher::launcher_account::AccountStatus,String>{
    let account=account.inner().clone();tauri::async_runtime::spawn_blocking(move||account.status()).await.map_err(|_|"accountUnavailable")?
}
#[command]
fn launcher_account_cancel(account:tauri::State<'_,skymp_launcher::launcher_account::LauncherAccount>)->Result<(),String>{account.cancel()}
#[command]
async fn launcher_account_logout(account:tauri::State<'_,skymp_launcher::launcher_account::LauncherAccount>)->Result<skymp_launcher::launcher_account::AccountStatus,String>{
    let account=account.inner().clone();tauri::async_runtime::spawn_blocking(move||account.logout()).await.map_err(|_|"accountUnavailable")?
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    if skymp_launcher::crash_capture::helper_entry() {return;}
    tauri::Builder::default()
        .setup(|app| {
            let directory = app
                .path_resolver()
                .app_log_dir()
                .or_else(|| app.path_resolver().app_data_dir())
                .ok_or("Launcher log directory is unavailable")?;
            let reports = CrashReports::new(directory.join("crash-reports"), directory.join("launcher.log"));
            let lock=reports.start_launcher().map_err(|error|std::io::Error::new(std::io::ErrorKind::Other,error))?;
            app.manage(LauncherReportLock(lock));
            let session = GameSession::new(directory);
            session.record(&format!("launcher started version={}",env!("CARGO_PKG_VERSION")));
            let panic_session = session.clone();
            let panic_reports=reports.clone();
            let previous_hook = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                if let Some(location) = info.location() {
                    panic_session.record(&format!(
                        "launcher panic at {}:{}",
                        location.file(),
                        location.line()
                    ));
                } else {
                    panic_session.record("launcher panic");
                }
                panic_reports.launcher_panic();
                previous_hook(info);
            }));
            app.manage(session);
            app.manage(DiscordPresence::new());
            app.manage(skymp_launcher::launcher_account::LauncherAccount::new());
            let retry_reports=reports.clone();let retry_app=app.handle();
            std::thread::spawn(move || {
                // Never retries a draft or adds an attachment without prior consent.
                for _ in 0..5 {
                    std::thread::sleep(std::time::Duration::from_secs(60));
                    retry_reports.retry_pending();
                    let _=retry_app.emit_all("crash-reports-updated",());
                }
            });
            app.manage(reports);
            Ok(())
        })
        .on_window_event(|event| {
            let Some(session) = event.window().try_state::<GameSession>() else {
                return;
            };
            match event.event() {
                tauri::WindowEvent::CloseRequested { .. } => {
                    session.record("launcher window close requested")
                }
                tauri::WindowEvent::Destroyed => session.record("launcher window destroyed"),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            launcher_account_begin,
            launcher_account_status,
            launcher_account_cancel,
            launcher_account_logout,
            game_launch_status,
            steam_account,
            discord_presence_update,
            discord_presence_status,
            crash_reports_list,
            crash_report_submit,
            crash_report_export,
            crash_report_dismiss,
            crash_capture_setting,
            set_crash_capture,
            set_crash_report_language,
            join_server,
            prepare_server,
            restore_skyrim,
            import_server_build,
            check_skyrim_install,
            check_skyrim_install_with_language,
            check_skyrim_environment,
            check_skyrim_environment_with_language,
            import_skymp_settings,
            import_skymp_settings_with_language
        ])
        .build(tauri::generate_context!())
        .expect("error while building SkyMP Launcher")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let _=app.state::<CrashReports>().clean_shutdown();
            }
            if let tauri::RunEvent::ExitRequested { .. } = event {
                app.state::<GameSession>()
                    .record("launcher event loop exit requested");
            }
        });
}
