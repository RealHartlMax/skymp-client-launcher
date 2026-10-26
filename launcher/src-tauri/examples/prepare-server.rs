//! Reproducible integration harness. Never launches Skyrim.
//! cargo run --example prepare-server -- REQUEST.json GAME_DIR PROFILE_DIR CACHE_DIR
use skymp_launcher::connection;

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 4 {
        return Err("Expected REQUEST.json GAME_DIR PROFILE_DIR CACHE_DIR".into());
    }
    if args[0] == "--restore" {
        return connection::restore_installation(
            std::path::Path::new(&args[1]),
            std::path::Path::new(&args[2]),
        )
        .map(|_| ());
    }
    let request: connection::ConnectRequest =
        serde_json::from_slice(&std::fs::read(&args[0]).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let result = connection::prepare(
        &request,
        std::path::Path::new(&args[1]),
        std::path::Path::new(&args[2]),
        std::path::Path::new(&args[3]),
        |event| {
            if event.stage != "runtime" {
                eprintln!("{}: {}", event.stage, event.file);
            }
        },
    )?;
    println!(
        "{}",
        serde_json::to_string_pretty(&result).map_err(|e| e.to_string())?
    );
    Ok(())
}
