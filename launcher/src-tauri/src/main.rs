// SkyMP Launcher – Tauri backend (Rust)
//
// Responsibilities (Phase 2):
//   1. Write connection.json with the chosen server's IP and port
//   2. Locate the Skyrim installation directory
//   3. Launch the SKSE loader

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
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

// ---------------------------------------------------------------------------
// Tauri commands (callable from the React frontend via `invoke`)
// ---------------------------------------------------------------------------

/// Writes `connection.json` into %APPDATA%\SkyMP and then launches SKSE.
///
/// TODO: Detect the Skyrim installation path automatically (registry or
///       user-configured setting) instead of using a hard-coded fallback.
#[command]
fn join_server(ip: String, port: u16) -> Result<(), String> {
    let config = ConnectionConfig { ip, port };
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| e.to_string())?;

    let config_path = get_config_path()?;
    fs::write(&config_path, json).map_err(|e| e.to_string())?;

    launch_skse()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn get_config_path() -> Result<PathBuf, String> {
    let app_data = std::env::var("APPDATA")
        .map_err(|_| "APPDATA environment variable not found".to_string())?;

    let dir = PathBuf::from(app_data).join("SkyMP");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("connection.json"))
}

/// Launches SkyrimSE.exe via SKSE64_loader.exe.
///
/// TODO (Phase 2): Read the Skyrim path from a user-configurable setting
///                 stored in the launcher's own config file.
fn launch_skse() -> Result<(), String> {
    // Placeholder path – will be replaced by dynamic detection.
    let skse_loader = PathBuf::from(
        r"C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition\skse64_loader.exe",
    );

    std::process::Command::new(&skse_loader)
        .spawn()
        .map_err(|e| format!("Failed to launch SKSE: {e}"))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![join_server])
        .run(tauri::generate_context!())
        .expect("error while running SkyMP Launcher");
}
