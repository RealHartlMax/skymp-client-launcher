//! Explicit Steam-only diagnostic: no preparation, game launch or game-server join.
use skymp_launcher::{connection::ConnectRequest, steam_auth};

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() != 2 {
        return Err("Expected SERVER_HTTP_ORIGIN SKYRIM_DIRECTORY; verifies Steam only, never launches Skyrim".into());
    }
    let request: ConnectRequest = serde_json::from_value(serde_json::json!({
        "ip": "diagnostic", "port": 7777, "resourceUrl": args[0],
        "operationId": "steam-only-diagnostic"
    })).map_err(|_| "Invalid diagnostic request")?;
    match steam_auth::authenticate(&request, std::path::Path::new(&args[1]))? {
        Some(proof) => println!("{}", serde_json::json!({
            "ok": true, "steamVerified": true,
            "accountLoginRequired": proof.account_login_required,
            "gameStarted": false, "serverJoined": false
        })),
        None => println!("{}", serde_json::json!({"ok": true, "steamRequired": false, "gameStarted": false})),
    }
    Ok(())
}
