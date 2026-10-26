fn main() {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    let version=std::env::var("CARGO_PKG_VERSION").unwrap();
    println!("cargo:rustc-env=SKYMP_BUILD_ID={version}-{stamp}");
    println!("cargo:rerun-if-changed=src");
    println!("cargo:rerun-if-changed=../dist");
    #[cfg(feature = "desktop")]
    tauri_build::build()
}
