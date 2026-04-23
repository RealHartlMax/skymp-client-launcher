// SkyMP Launcher – Tauri backend (Rust)
//
// Responsibilities (v0.1.0):
//   1. Write skymp5-client-settings.txt into Skyrim Data/Platform/Plugins
//   2. Locate the Skyrim installation directory (configured or auto-detected)
//   3. Launch the SKSE loader

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::Deserialize;
use serde::Serialize;
use tauri::command;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct ConnectionConfig {
    ip: String,
    port: u16,
}

#[derive(Debug, Serialize)]
struct SkympClientSettings {
    #[serde(rename = "gameData")]
    game_data: GameData,
    master: String,
    #[serde(rename = "server-info-ignore")]
    server_info_ignore: bool,
    #[serde(rename = "server-ip")]
    server_ip: String,
    #[serde(rename = "server-master-key")]
    server_master_key: Option<String>,
    #[serde(rename = "server-port")]
    server_port: u16,
}

#[derive(Debug, Serialize)]
struct GameData {
    profile_id: i32,
}

#[derive(Debug, Serialize)]
struct SkyrimInstallCheck {
    resolved_path: Option<String>,
    has_skse: bool,
    message: String,
}

#[derive(Debug, Serialize)]
struct SkyrimEnvironmentStatus {
    resolved_path: Option<String>,
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
}

#[derive(Debug, Serialize)]
struct ImportedSkympClientSettings {
    found: bool,
    path: Option<String>,
    server_ip: Option<String>,
    server_port: Option<u16>,
    master: Option<String>,
    server_master_key: Option<String>,
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

#[command]
fn join_server(
    ip: String,
    port: u16,
    skyrim_dir: Option<String>,
    master_url: Option<String>,
    server_master_key: Option<String>,
) -> Result<(), String> {
    let config = ConnectionConfig { ip, port };

    let skyrim_path = resolve_skyrim_dir(skyrim_dir)?;
    write_skymp_client_settings(&skyrim_path, &config, master_url, server_master_key)?;
    launch_skse(&skyrim_path)?;
    Ok(())
}

#[command]
fn check_skyrim_install(skyrim_dir: Option<String>) -> SkyrimInstallCheck {
    check_skyrim_install_with_language(skyrim_dir, None)
}

#[command]
fn check_skyrim_install_with_language(skyrim_dir: Option<String>, language: Option<String>) -> SkyrimInstallCheck {
    let lang = parse_language(language.as_deref());

    if let Some(value) = skyrim_dir {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(trimmed);
            if is_valid_skyrim_dir(&candidate) {
                return SkyrimInstallCheck {
                    resolved_path: Some(candidate.to_string_lossy().to_string()),
                    has_skse: true,
                    message: msg_skse_found(lang).to_string(),
                };
            }

            return SkyrimInstallCheck {
                resolved_path: Some(candidate.to_string_lossy().to_string()),
                has_skse: false,
                message: msg_skse_missing_in_selected_path(lang).to_string(),
            };
        }
    }

    for candidate in get_skyrim_candidates() {
        if is_valid_skyrim_dir(&candidate) {
            return SkyrimInstallCheck {
                resolved_path: Some(candidate.to_string_lossy().to_string()),
                has_skse: true,
                message: msg_skyrim_with_skse_detected(lang).to_string(),
            };
        }
    }

    SkyrimInstallCheck {
        resolved_path: None,
        has_skse: false,
        message: msg_no_valid_skyrim_with_skse(lang).to_string(),
    }
}

#[command]
fn check_skyrim_environment(skyrim_dir: Option<String>) -> SkyrimEnvironmentStatus {
    check_skyrim_environment_with_language(skyrim_dir, None)
}

#[command]
fn check_skyrim_environment_with_language(skyrim_dir: Option<String>, language: Option<String>) -> SkyrimEnvironmentStatus {
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
            has_skse: false,
            has_plugins_dir: false,
            can_write_plugins: false,
            has_existing_settings: false,
            message: msg_skyrim_not_found_set_path(lang).to_string(),
        };
    };

    let has_skse = is_valid_skyrim_dir(&skyrim_path);
    let plugins_dir = skyrim_path.join("Data").join("Platform").join("Plugins");
    let has_plugins_dir = plugins_dir.is_dir();
    let can_write_plugins = can_write_to_plugins_dir(&plugins_dir);
    let has_existing_settings = plugins_dir.join("skymp5-client-settings.txt").is_file();

    SkyrimEnvironmentStatus {
        resolved_path: Some(skyrim_path.to_string_lossy().to_string()),
        has_skse,
        has_plugins_dir,
        can_write_plugins,
        has_existing_settings,
        message: if has_skse {
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
fn import_skymp_settings_with_language(skyrim_dir: Option<String>, language: Option<String>) -> ImportedSkympClientSettings {
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
            message: msg_no_skyrim_path_found(lang).to_string(),
        };
    };

    let settings_path = skyrim_path.join("Data").join("Platform").join("Plugins").join("skymp5-client-settings.txt");
    if !settings_path.is_file() {
        return ImportedSkympClientSettings {
            found: false,
            path: Some(settings_path.to_string_lossy().to_string()),
            server_ip: None,
            server_port: None,
            master: None,
            server_master_key: None,
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
                message: msg_invalid_json_file(lang).to_string(),
            };
        }
    };

    ImportedSkympClientSettings {
        found: true,
        path: Some(settings_path.to_string_lossy().to_string()),
        server_ip: parsed.server_ip,
        server_port: parsed.server_port,
        master: parsed.master,
        server_master_key: parsed.server_master_key,
        message: msg_settings_imported_success(lang).to_string(),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn write_skymp_client_settings(
    skyrim_dir: &PathBuf,
    config: &ConnectionConfig,
    master_url: Option<String>,
    server_master_key: Option<String>,
) -> Result<(), String> {
    let plugins_dir = skyrim_dir.join("Data").join("Platform").join("Plugins");
    fs::create_dir_all(&plugins_dir).map_err(|e| format!("Failed to create Plugins directory: {e}"))?;

    let settings = SkympClientSettings {
        game_data: GameData { profile_id: 1 },
        master: master_url.unwrap_or_default(),
        server_info_ignore: true,
        server_ip: config.ip.clone(),
        server_master_key,
        server_port: config.port,
    };

    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    let settings_path = plugins_dir.join("skymp5-client-settings.txt");
    fs::write(&settings_path, json).map_err(|e| format!("Failed to write skymp5-client-settings.txt: {e}"))?;

    Ok(())
}

fn resolve_skyrim_dir(custom_dir: Option<String>) -> Result<PathBuf, String> {
    if let Some(value) = custom_dir {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(trimmed);
            if is_valid_skyrim_dir(&candidate) {
                return Ok(candidate);
            }
            return Err("Configured Skyrim folder is invalid (skse64_loader.exe missing)".to_string());
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
    path.join("skse64_loader.exe").is_file()
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
        UiLanguage::De => "SKSE gefunden",
        UiLanguage::En => "SKSE found",
        UiLanguage::Ru => "SKSE найден",
    }
}

fn msg_skse_missing_in_selected_path(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "SKSE64 wurde im ausgewaehlten Spieleordner nicht gefunden",
        UiLanguage::En => "SKSE64 was not found in the selected game folder",
        UiLanguage::Ru => "SKSE64 не найден в выбранной папке игры",
    }
}

fn msg_skyrim_with_skse_detected(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Skyrim Installation mit SKSE automatisch erkannt",
        UiLanguage::En => "Skyrim installation with SKSE detected automatically",
        UiLanguage::Ru => "Установка Skyrim с SKSE обнаружена автоматически",
    }
}

fn msg_no_valid_skyrim_with_skse(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::De => "Keine gueltige Skyrim Installation mit SKSE gefunden",
        UiLanguage::En => "No valid Skyrim installation with SKSE found",
        UiLanguage::Ru => "Не найдена корректная установка Skyrim с SKSE",
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
        UiLanguage::De => "SKSE64 fehlt im gewaehlten Skyrim-Ordner",
        UiLanguage::En => "SKSE64 is missing in the selected Skyrim folder",
        UiLanguage::Ru => "SKSE64 отсутствует в выбранной папке Skyrim",
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

fn launch_skse(skyrim_dir: &PathBuf) -> Result<(), String> {
    let skse_loader = skyrim_dir.join("skse64_loader.exe");

    std::process::Command::new(&skse_loader)
        .current_dir(skyrim_dir)
        .spawn()
        .map_err(|e| format!("Failed to launch SKSE: {e}"))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        join_server,
        check_skyrim_install,
        check_skyrim_install_with_language,
        check_skyrim_environment,
        check_skyrim_environment_with_language,
        import_skymp_settings,
        import_skymp_settings_with_language
    ])
        .run(tauri::generate_context!())
        .expect("error while running SkyMP Launcher");
}
