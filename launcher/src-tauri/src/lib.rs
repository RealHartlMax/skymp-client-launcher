pub mod connection;
pub mod game_session;
pub mod runtime_version;
pub mod player_name;
pub mod discord_presence;

pub mod steam_auth;
pub mod crash_reports;
pub mod crash_capture;
pub mod launcher_account;

#[cfg(windows)]
mod windows_diagnostics;
