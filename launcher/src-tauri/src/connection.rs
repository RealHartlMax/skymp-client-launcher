//! Server discovery, verified downloads and reversible activation before SKSE starts.
use crate::runtime_version;
use fs2::FileExt;
use reqwest::{blocking::Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

const JSON_LIMIT: u64 = 8 * 1024 * 1024;
const FILE_LIMIT: u64 = 8 * 1024 * 1024 * 1024;
const TOTAL_LIMIT: u64 = 64 * 1024 * 1024 * 1024;
const TEXT_REPAIR_LIMIT: u64 = 16 * 1024 * 1024;
const SETTINGS: &str = "Data/Platform/Plugins/skymp5-client-settings.txt";
const RUNTIME_REQUIRED: [&str; 6] = [
    "Data/SKSE/Plugins/SkyrimPlatform.dll",
    "Data/SKSE/Plugins/MpClientPlugin.dll",
    "Data/Platform/Plugins/skymp5-client.js",
    "Data/Platform/Distribution/RuntimeDependencies/SkyrimPlatformImpl.dll",
    "Data/Platform/UI/index.html",
    "Data/Platform/UI/build.js",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub ip: String,
    pub port: u16,
    pub skyrim_dir: Option<String>,
    pub resource_url: Option<String>,
    pub master_url: Option<String>,
    pub server_master_key: Option<String>,
    #[serde(default)]
    pub offline: bool,
    pub profile_id: Option<u32>,
    pub runtime_source: Option<String>,
    pub operation_id: String,
    #[serde(default)]
    pub player_name: Option<String>,
    #[serde(skip)]
    pub steam_auth: Option<crate::steam_auth::SteamProof>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub operation_id: String,
    pub stage: &'static str,
    pub file: String,
    pub completed: u64,
    pub total: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedServer {
    pub resource_url: String,
    pub downloaded_files: usize,
    pub cached_files: usize,
    pub load_order: Vec<String>,
    pub preserved_files: Vec<PreservedFile>,
    pub runtime_manifest_sha256: Option<String>,
    pub verified_files: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreservedFile {
    pub path: String,
    pub backup_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedServer {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub resource_url: String,
    pub master_url: String,
    pub server_master_key: Option<String>,
    pub offline: bool,
    pub runtime_source: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ResourceManifest {
    version: String,
    resources: Vec<Resource>,
    #[serde(rename = "loadOrder")]
    load_order: Option<Vec<String>>,
    #[serde(rename = "requiredLocalFiles", default)]
    required_local_files: Vec<GameMod>,
    #[serde(rename = "totalSize")]
    total_size: Option<u64>,
    #[serde(rename = "runtimeSource")]
    runtime_source: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Resource {
    name: String,
    kind: String,
    size: u64,
    hash: String,
    path: Option<String>,
    #[serde(rename = "downloadPath")]
    download_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameManifest {
    version_major: u32,
    mods: Vec<GameMod>,
    load_order: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GameMod {
    filename: String,
    size: u64,
    crc32: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    version: u32,
    files: Vec<RuntimeFile>,
    game_version: Option<String>,
    skse_version: Option<String>,
    #[serde(skip)]
    source_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RuntimeCatalog {
    packages: Vec<RuntimePackage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimePackage {
    game_version: String,
    manifest: String,
    sha256: String,
}

#[derive(Debug, Deserialize)]
struct RuntimeFile {
    path: String,
    size: u64,
    sha256: String,
    #[serde(rename = "downloadPath")]
    download_path: Option<String>,
}

#[derive(Clone)]
struct StagedFile {
    root: Root,
    path: String,
    source: PathBuf,
    hash: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
enum Root {
    Game,
    Profile,
}

#[derive(Debug, Serialize, Deserialize)]
struct JournalEntry {
    root: Root,
    path: String,
    backup: Option<String>,
    original_hash: Option<String>,
    installed_hash: String,
    #[serde(default)]
    mutable: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Journal {
    entries: Vec<JournalEntry>,
}

fn error(context: &str, err: impl std::fmt::Display) -> String {
    format!("{context}: {err}")
}

pub fn client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(concat!("SkyMP-Launcher/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| error("HTTP client", e))
}

pub fn http_url(input: &str) -> Result<Url, String> {
    let mut url = Url::parse(input.trim()).map_err(|e| error("Invalid HTTP URL", e))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Use an http(s) URL without credentials, query or fragment".into());
    }
    let path = format!("{}/", url.path().trim_end_matches('/'));
    url.set_path(&path);
    Ok(url)
}

pub fn validate_host(host: &str, port: u16) -> Result<String, String> {
    let host = host.trim().trim_start_matches('[').trim_end_matches(']');
    if port == 0
        || host.is_empty()
        || host.contains(['/', '\\', '@', '?', '#'])
        || host.chars().any(char::is_whitespace)
    {
        return Err("Enter a hostname or IP and a game port from 1 to 65535".into());
    }
    let address = if host.contains(':') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    let url = Url::parse(&format!("http://{address}:{port}/"))
        .map_err(|e| error("Invalid server host", e))?;
    if url.host_str().is_none() {
        return Err("Invalid server host".into());
    }
    Ok(host.to_string())
}

fn default_resource_url(host: &str) -> String {
    let host = if host.contains(':') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    format!("http://{host}:8080/")
}

fn get_response(
    client: &Client,
    url: &Url,
    timeout: Duration,
) -> Result<reqwest::blocking::Response, String> {
    let mut last_error = String::new();
    for attempt in 0..3 {
        match client
            .get(url.clone())
            .header(reqwest::header::CACHE_CONTROL, "no-cache")
            .timeout(timeout)
            .send()
        {
            Ok(response) => return Ok(response),
            Err(err) => last_error = err.to_string(),
        }
        if attempt < 2 {
            std::thread::sleep(Duration::from_millis(100 * (attempt + 1)));
        }
    }
    Err(format!("Cannot reach {url}: {last_error}"))
}

fn read_json<T: serde::de::DeserializeOwned>(
    client: &Client,
    url: Url,
    optional: bool,
) -> Result<Option<T>, String> {
    read_json_bytes(client, &url, optional)?
        .map(|bytes| {
            serde_json::from_slice(&bytes)
                .map_err(|e| error(&format!("Invalid manifest from {url}"), e))
        })
        .transpose()
}

fn read_json_bytes(client: &Client, url: &Url, optional: bool) -> Result<Option<Vec<u8>>, String> {
    let response = get_response(client, &url, Duration::from_secs(60))?;
    if optional && response.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!("{url}: HTTP {}. Check the server's HTTP/resource port (usually 8080, separate from UDP game port).", response.status()));
    }
    let mut bytes = Vec::new();
    response
        .take(JSON_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| error("Read manifest", e))?;
    if bytes.len() as u64 > JSON_LIMIT {
        return Err("Manifest exceeds 8 MiB".into());
    }
    Ok(Some(bytes))
}

fn safe_path(value: &str) -> Result<PathBuf, String> {
    if value.is_empty() || value.len() > 240 || value.contains('\\') {
        return Err(format!("Unsafe path: {value}"));
    }
    for part in value.split('/') {
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with(['.', ' '])
            || part
                .chars()
                .any(|c| c.is_control() || "<>:\"|?*".contains(c))
            || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (stem.len() == 4
                && (stem.starts_with("COM") || stem.starts_with("LPT"))
                && stem.as_bytes()[3].is_ascii_digit())
        {
            return Err(format!("Unsafe Windows path: {value}"));
        }
    }
    Ok(PathBuf::from(value))
}

fn file_name(value: &str) -> Result<(), String> {
    safe_path(value)?;
    if value.contains('/') {
        return Err(format!("Expected filename, got {value}"));
    }
    Ok(())
}

fn is_link(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    metadata.file_type().is_symlink()
}

/// Check existing ancestors as well, including junctions on Windows.
fn checked_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = root.join(safe_path(relative)?);
    for ancestor in path.ancestors() {
        if let Ok(metadata) = fs::symlink_metadata(ancestor) {
            if is_link(&metadata) {
                return Err(format!(
                    "Links/junctions are not allowed: {}",
                    ancestor.display()
                ));
            }
        }
    }
    Ok(path)
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut input = File::open(path).map_err(|e| error(&path.display().to_string(), e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 128 * 1024];
    loop {
        let count = input.read(&mut buffer).map_err(|e| error("Hash file", e))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn sha256(value: &str) -> Result<String, String> {
    let value = value
        .strip_prefix("sha256:")
        .unwrap_or(value)
        .to_ascii_lowercase();
    if value.len() != 64 || !value.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Missing or invalid SHA-256 in manifest".into());
    }
    Ok(value)
}

fn matches_file(path: &Path, size: u64, hash: &str) -> bool {
    fs::metadata(path)
        .map(|s| s.is_file() && s.len() == size)
        .unwrap_or(false)
        && hash_file(path).map(|h| h == hash).unwrap_or(false)
}

fn persist_file(mut temporary: tempfile::NamedTempFile, destination: &Path) -> Result<(), String> {
    for attempt in 0..8 {
        match temporary.persist(destination) {
            Ok(_) => return Ok(()),
            Err(failure) => {
                // Windows indexers and virus scanners can briefly retain a file handle.
                let transient =
                    cfg!(windows) && matches!(failure.error.raw_os_error(), Some(5 | 32 | 33));
                if !transient || attempt == 7 {
                    return Err(format!(
                        "Replace {}: {}",
                        destination.display(),
                        failure.error
                    ));
                }
                temporary = failure.file;
                std::thread::sleep(Duration::from_millis((50u64 << attempt).min(1000)));
            }
        }
    }
    unreachable!()
}

fn atomic_bytes(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing parent folder")?;
    fs::create_dir_all(parent).map_err(|e| error("Create folder", e))?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|e| error("Create temporary file", e))?;
    temporary
        .write_all(data)
        .map_err(|e| error("Write file", e))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|e| error("Flush file", e))?;
    persist_file(temporary, path)
}

fn atomic_copy(source: &Path, destination: &Path) -> Result<(), String> {
    let parent = destination.parent().ok_or("Missing parent folder")?;
    fs::create_dir_all(parent).map_err(|e| error("Create folder", e))?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|e| error("Create temporary file", e))?;
    let mut input = File::open(source).map_err(|e| error("Open staged file", e))?;
    std::io::copy(&mut input, &mut temporary).map_err(|e| error("Copy staged file", e))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|e| error("Flush staged file", e))?;
    persist_file(temporary, destination)
}

struct Downloader<'a, F: Fn(Progress)> {
    client: &'a Client,
    cache: PathBuf,
    request: &'a ConnectRequest,
    notify: &'a F,
    downloaded: usize,
    cached: usize,
    total_size: u64,
    runtime_manifest_sha256: Option<String>,
}

fn runtime_text_file(name: &str) -> bool {
    matches!(
        Path::new(name)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "svg"
            | "txt"
            | "js"
            | "json"
            | "ini"
            | "cfg"
            | "xml"
            | "html"
            | "css"
            | "md"
            | "toml"
            | "yaml"
            | "yml"
            | "csv"
            | "map"
    )
}

// FTP text transfers may change CRLF to LF (or vice versa). Reconstruct only
// candidates whose exact bytes match the original manifest's size AND SHA-256.
// This never accepts a different hash, changes encodings, or repairs binary files.
fn original_text_bytes(input: &[u8], size: u64, hash: &str) -> Option<Vec<u8>> {
    if size > TEXT_REPAIR_LIMIT || input.len() as u64 > size.saturating_mul(2) || input.contains(&0)
    {
        return None;
    }
    let mut lf = Vec::with_capacity(input.len());
    for (index, &byte) in input.iter().enumerate() {
        if byte != b'\r' || input.get(index + 1) != Some(&b'\n') {
            lf.push(byte);
        }
    }
    if lf.len() as u64 == size && format!("{:x}", Sha256::digest(&lf)) == hash {
        return Some(lf);
    }
    let line_feeds = lf.iter().filter(|&&byte| byte == b'\n').count();
    if (lf.len() + line_feeds) as u64 == size {
        let mut crlf = Vec::with_capacity(size as usize);
        for byte in lf {
            if byte == b'\n' {
                crlf.push(b'\r');
            }
            crlf.push(byte);
        }
        if format!("{:x}", Sha256::digest(&crlf)) == hash {
            return Some(crlf);
        }
    }
    None
}

impl<F: Fn(Progress)> Downloader<'_, F> {
    fn progress(&self, stage: &'static str, file: &str, completed: u64, total: u64) {
        (self.notify)(Progress {
            operation_id: self.request.operation_id.clone(),
            stage,
            file: file.into(),
            completed,
            total,
        });
    }

    fn obtain(&mut self, url: Url, size: u64, hash: &str, name: &str) -> Result<PathBuf, String> {
        self.obtain_verified(url, size, hash, name, false)
    }

    fn obtain_runtime(
        &mut self,
        url: Url,
        size: u64,
        hash: &str,
        name: &str,
    ) -> Result<PathBuf, String> {
        self.obtain_verified(url, size, hash, name, true)
    }

    fn obtain_verified(
        &mut self,
        url: Url,
        size: u64,
        hash: &str,
        name: &str,
        runtime: bool,
    ) -> Result<PathBuf, String> {
        self.total_size = self
            .total_size
            .checked_add(size)
            .ok_or("Download size overflow")?;
        if size > FILE_LIMIT || self.total_size > TOTAL_LIMIT {
            return Err("Download exceeds the file/package size limit".into());
        }
        let hash = sha256(hash)?;
        let repair_text = runtime && runtime_text_file(name) && size <= TEXT_REPAIR_LIMIT;
        let transfer_limit = if repair_text {
            size.saturating_mul(2)
        } else {
            size
        };
        let destination = checked_path(&self.cache, &hash)?;
        if matches_file(&destination, size, &hash) {
            self.cached += 1;
            self.progress("cached", name, size, size);
            return Ok(destination);
        }
        self.progress("downloading", name, 0, size);
        let mut response = get_response(self.client, &url, Duration::from_secs(600))?;
        if !response.status().is_success() {
            return Err(format!(
                "Download {name} from {url}: HTTP {}",
                response.status()
            ));
        }
        if let Some(header) = response.headers().get("X-Resource-Hash") {
            let header = sha256(
                header
                    .to_str()
                    .map_err(|e| error("Invalid resource hash header", e))?,
            )?;
            if header != hash {
                return Err(format!(
                    "{name} changed on the server. Retry to fetch a fresh manifest."
                ));
            }
        }
        let mut file = tempfile::NamedTempFile::new_in(&self.cache)
            .map_err(|e| error("Create download", e))?;
        let mut hasher = Sha256::new();
        let mut received = 0;
        let mut buffer = [0u8; 128 * 1024];
        let mut last_event = std::time::Instant::now();
        loop {
            let count = response
                .read(&mut buffer)
                .map_err(|e| error(&format!("Download interrupted: {name}"), e))?;
            if count == 0 {
                break;
            }
            received += count as u64;
            if received > transfer_limit {
                return Err(format!("{name}: download is larger than declared"));
            }
            file.write_all(&buffer[..count])
                .map_err(|e| error("Save download", e))?;
            hasher.update(&buffer[..count]);
            if last_event.elapsed() >= Duration::from_millis(120) {
                self.progress("downloading", name, received, size);
                last_event = std::time::Instant::now();
            }
        }
        let actual_hash = format!("{:x}", hasher.finalize());
        if received != size || actual_hash != hash {
            let repaired = if repair_text {
                let bytes = fs::read(file.path()).map_err(|e| error("Read downloaded text", e))?;
                original_text_bytes(&bytes, size, &hash)
            } else {
                None
            };
            if let Some(bytes) = repaired {
                file.as_file_mut()
                    .set_len(0)
                    .map_err(|e| error("Reset downloaded text", e))?;
                file.rewind()
                    .map_err(|e| error("Rewind downloaded text", e))?;
                file.write_all(&bytes)
                    .map_err(|e| error("Save verified original text", e))?;
            } else {
                return Err(format!(
                    "{name}: SHA-256 or size verification failed (expected {size} bytes, received {received}). The file host must serve the original package bytes; upload in binary mode. Game was not started."
                ));
            }
        }
        file.as_file()
            .sync_all()
            .map_err(|e| error("Flush download", e))?;
        persist_file(file, &destination)?;
        self.downloaded += 1;
        self.progress("downloaded", name, size, size);
        Ok(destination)
    }
}

fn official_file(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    ["skyrim", "update", "dawnguard", "hearthfires", "dragonborn"]
        .iter()
        .any(|base| {
            name == format!("{base}.esm")
                || name == format!("{base}.bsa")
                || name.starts_with(&format!("{base} - "))
        })
        || (name.starts_with("cc")
            && matches!(
                Path::new(&name).extension().and_then(|e| e.to_str()),
                Some("esm" | "esl" | "bsa")
            ))
}

fn verify_crc(path: &Path, entry: &GameMod) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|_| {
        format!(
            "Required game file missing: {}. Install it from your own Skyrim installation.",
            entry.filename
        )
    })?;
    if entry.size == 0 {
        return Err(format!(
            "Server published an empty file: {}",
            entry.filename
        ));
    }
    if metadata.len() != entry.size {
        return Err(format!(
            "{}: installed game/mod version differs from the server (size mismatch)",
            entry.filename
        ));
    }
    let mut input = File::open(path).map_err(|e| error("Open game file", e))?;
    let mut buffer = [0u8; 128 * 1024];
    let mut hasher = crc32fast::Hasher::new();
    loop {
        let count = input
            .read(&mut buffer)
            .map_err(|e| error("Verify game file", e))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    if hasher.finalize() != entry.crc32 as u32 {
        return Err(format!(
            "{}: CRC32 differs from the server; use the matching game/mod version",
            entry.filename
        ));
    }
    Ok(())
}

fn validate_runtime_path(path: &str) -> Result<(), String> {
    safe_path(path)?;
    let lower = path.to_ascii_lowercase();
    if lower == SETTINGS.to_ascii_lowercase()
        || lower.contains("auth-data")
        || lower.contains(".skymp")
        || lower.contains("/plugin-example/")
        || lower.contains("/modules/")
        || lower.contains("/source/")
        || lower.ends_with(".log")
        || lower.ends_with(".zip")
    {
        return Err(format!(
            "Runtime package contains a protected/unnecessary path: {path}"
        ));
    }
    if lower.starts_with("data/") {
        if official_file(path.rsplit('/').next().unwrap_or("")) {
            return Err("Runtime packages must not include Bethesda game files".into());
        }
        return Ok(());
    }
    if !path.contains('/')
        && (lower == "skse64_loader.exe"
            || (lower.starts_with("skse64_") && lower.ends_with(".dll")))
    {
        return Ok(());
    }
    Err(format!(
        "Runtime files must be under Data/ or be SKSE64 loader files: {path}"
    ))
}

fn enumerate_runtime(
    root: &Path,
    current: &Path,
    files: &mut Vec<String>,
    depth: usize,
) -> Result<(), String> {
    if depth > 16 || files.len() > 10000 {
        return Err("Runtime package too large/deep".into());
    }
    for entry in fs::read_dir(current).map_err(|e| error("Read client runtime", e))? {
        let entry = entry.map_err(|e| error("Read runtime entry", e))?;
        let path = entry.path();
        let metadata =
            fs::symlink_metadata(&path).map_err(|e| error("Read runtime metadata", e))?;
        if is_link(&metadata) {
            return Err(format!("Runtime contains link: {}", path.display()));
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if metadata.is_dir() {
            let lower = relative.to_ascii_lowercase();
            if !lower.starts_with("data")
                || lower.contains("/plugin-example")
                || lower.contains("/modules")
                || lower.contains("/source")
            {
                continue;
            }
            enumerate_runtime(root, &path, files, depth + 1)?;
        } else if validate_runtime_path(&relative).is_ok() {
            files.push(relative);
        }
    }
    Ok(())
}

fn runtime_file_url(manifest_url: &Url, path: &str) -> Result<Url, String> {
    safe_path(path)?;
    let mut url = manifest_url.join(".").map_err(|e| e.to_string())?;
    for part in path.split('/') {
        url.path_segments_mut()
            .map_err(|_| "Invalid runtime URL")?
            .pop_if_empty()
            .push(part);
    }
    Ok(url)
}

fn validate_runtime_manifest<G: Fn() -> Result<[u16; 4], String>>(
    manifest: &RuntimeManifest,
    game_version: &G,
) -> Result<(), String> {
    if manifest.version != 1 || manifest.files.is_empty() || manifest.files.len() > 10000 {
        return Err("Unsupported/empty runtime manifest".into());
    }
    let mut unique = HashSet::new();
    let mut size = 0u64;
    for entry in &manifest.files {
        validate_runtime_path(&entry.path)?;
        if let Some(download) = &entry.download_path {
            safe_path(download)?;
        }
        sha256(&entry.sha256)?;
        if !unique.insert(entry.path.to_ascii_lowercase()) {
            return Err(format!("Duplicate runtime path: {}", entry.path));
        }
        size = size
            .checked_add(entry.size)
            .ok_or("Runtime size overflow")?;
        if entry.size > FILE_LIMIT || size > TOTAL_LIMIT {
            return Err("Runtime exceeds size limit".into());
        }
    }
    if let Some(declared) = &manifest.game_version {
        let declared = runtime_version::parse(declared)?;
        let installed = game_version()?;
        if declared != installed {
            return Err(format!("Client package requires Skyrim {}, but {} is installed. Select a matching package.", runtime_version::display(declared), runtime_version::display(installed)));
        }
        let prefix = if installed[1] >= 6 {
            "versionlib"
        } else {
            "version"
        };
        let version = runtime_version::display(installed).replace('.', "-");
        let mut required = RUNTIME_REQUIRED
            .iter()
            .map(|p| p.to_string())
            .collect::<Vec<_>>();
        required.extend([
            "skse64_loader.exe".into(),
            format!(
                "skse64_{}_{}_{}.dll",
                installed[0], installed[1], installed[2]
            ),
            format!("Data/SKSE/Plugins/{prefix}-{version}.bin"),
        ]);
        for path in required {
            if !unique.contains(&path.to_ascii_lowercase()) {
                return Err(format!("Versioned client package is incomplete: {path}"));
            }
        }
        skse_version(
            manifest
                .skse_version
                .as_deref()
                .ok_or("Versioned client package must declare skseVersion")?,
        )?;
    } else if manifest.skse_version.is_some() {
        return Err("skseVersion requires gameVersion in the client manifest".into());
    }
    Ok(())
}

fn skse_version(value: &str) -> Result<[u16; 4], String> {
    runtime_version::parse(&format!("0.{value}"))
        .map_err(|_| format!("Invalid SKSE version (expected e.g. 2.3.1): {value}"))
}

fn resolve_runtime_manifest<G: Fn() -> Result<[u16; 4], String>>(
    client: &Client,
    mut url: Url,
    game_version: &G,
) -> Result<(Url, RuntimeManifest), String> {
    http_url(url.as_str())?;
    let mut bytes = read_json_bytes(client, &url, false)?.ok_or("Missing runtime manifest")?;
    let document: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| error("Runtime manifest", e))?;
    let catalog = document.get("version").and_then(|v| v.as_u64()) == Some(2);
    if catalog {
        let catalog: RuntimeCatalog =
            serde_json::from_value(document).map_err(|e| error("Runtime catalog", e))?;
        if catalog.packages.is_empty() || catalog.packages.len() > 512 {
            return Err("Runtime catalog must contain 1 to 512 packages".into());
        }
        let installed = game_version()?;
        let mut versions = HashSet::new();
        let mut selected = None;
        for package in catalog.packages {
            let version = runtime_version::parse(&package.game_version)?;
            let target = runtime_file_url(&url, &package.manifest)?;
            let hash = sha256(&package.sha256)?;
            if !versions.insert(version) {
                return Err(format!(
                    "Duplicate runtime catalog version: {}",
                    package.game_version
                ));
            }
            if version == installed {
                selected = Some((target, hash));
            }
        }
        let (target, hash) = selected.ok_or_else(|| format!("No compatible client package for Skyrim {} is published. The game was not started.", runtime_version::display(installed)))?;
        url = target;
        bytes = read_json_bytes(client, &url, false)?.ok_or("Missing selected runtime manifest")?;
        if format!("{:x}", Sha256::digest(&bytes)) != hash {
            return Err("Selected runtime manifest changed or failed SHA-256 verification; refresh the catalog".into());
        }
    }
    let mut manifest: RuntimeManifest =
        serde_json::from_slice(&bytes).map_err(|e| error("Runtime package manifest", e))?;
    manifest.source_sha256 = Some(format!("{:x}", Sha256::digest(&bytes)));
    if catalog && manifest.game_version.is_none() {
        return Err("Catalog packages must declare gameVersion".into());
    }
    validate_runtime_manifest(&manifest, game_version)?;
    Ok((url, manifest))
}

fn verify_runtime_binaries(
    manifest: &RuntimeManifest,
    staged: &[StagedFile],
) -> Result<(), String> {
    let Some(game_version) = manifest.game_version.as_deref() else {
        return Ok(());
    };
    let game_version = runtime_version::parse(game_version)?;
    let expected_skse = skse_version(
        manifest
            .skse_version
            .as_deref()
            .ok_or("Missing skseVersion")?,
    )?;
    for file in staged {
        let lower = file.path.to_ascii_lowercase();
        if lower == "skse64_loader.exe"
            || lower
                == format!(
                    "skse64_{}_{}_{}.dll",
                    game_version[0], game_version[1], game_version[2]
                )
        {
            let actual = runtime_version::read(&file.source)?;
            if actual != expected_skse {
                return Err(format!(
                    "{} has SKSE version {}, expected {}",
                    file.path,
                    runtime_version::display(actual),
                    runtime_version::display(expected_skse)
                ));
            }
        }
        if lower.ends_with(&format!(
            "-{}.bin",
            runtime_version::display(game_version).replace('.', "-")
        )) && lower.starts_with("data/skse/plugins/version")
        {
            let mut header = [0u8; 4];
            File::open(&file.source)
                .and_then(|mut f| f.read_exact(&mut header))
                .map_err(|e| error("Read Address Library format", e))?;
            let expected = if game_version[1] >= 7 {
                5
            } else if game_version[1] >= 6 {
                2
            } else {
                1
            };
            if u32::from_le_bytes(header) != expected {
                return Err(format!(
                    "{} has an incompatible Address Library format; expected {expected}",
                    file.path
                ));
            }
        }
    }
    Ok(())
}

fn stage_runtime<F: Fn(Progress)>(
    downloader: &mut Downloader<F>,
    staged: &mut Vec<StagedFile>,
    game: &Path,
) -> Result<(), String> {
    let Some(source) = downloader
        .request
        .runtime_source
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    else {
        return Ok(());
    };
    let game_version = || runtime_version::read(&game.join("SkyrimSE.exe"));
    if source.starts_with("http://") || source.starts_with("https://") {
        let manifest_url = Url::parse(source).map_err(|e| error("Runtime manifest URL", e))?;
        let (manifest_url, manifest) =
            resolve_runtime_manifest(downloader.client, manifest_url, &game_version)?;
        downloader.runtime_manifest_sha256 = manifest.source_sha256.clone();
        for entry in &manifest.files {
            let url = runtime_file_url(
                &manifest_url,
                entry.download_path.as_deref().unwrap_or(&entry.path),
            )?;
            let hash = sha256(&entry.sha256)?;
            let file = downloader.obtain_runtime(url, entry.size, &hash, &entry.path)?;
            staged.push(StagedFile {
                root: Root::Game,
                path: entry.path.clone(),
                source: file,
                hash,
            });
        }
        verify_runtime_binaries(&manifest, staged)?;
    } else {
        let root = PathBuf::from(source.trim());
        checked_path(&root, "Data")?;
        let local_manifest = checked_path(&root, "runtime-manifest.json")?;
        let manifest = if local_manifest.is_file() {
            let bytes =
                fs::read(&local_manifest).map_err(|e| error("Read local runtime manifest", e))?;
            if bytes.len() as u64 > JSON_LIMIT {
                return Err("Runtime manifest exceeds 8 MiB".into());
            }
            let manifest: RuntimeManifest =
                serde_json::from_slice(&bytes).map_err(|e| error("Local runtime manifest", e))?;
            downloader.runtime_manifest_sha256 = Some(format!("{:x}", Sha256::digest(&bytes)));
            validate_runtime_manifest(&manifest, &game_version)?;
            Some(manifest)
        } else {
            None
        };
        let mut files = Vec::new();
        if let Some(manifest) = &manifest {
            files.extend(manifest.files.iter().map(|f| f.path.clone()));
        } else {
            enumerate_runtime(&root, &root, &mut files, 0)?;
        }
        if files.is_empty() {
            return Err("Client runtime folder contains no installable files".into());
        }
        for path in files {
            downloader.progress("runtime", &path, 0, 0);
            let download_path = manifest.as_ref().and_then(|m| {
                m.files
                    .iter()
                    .find(|f| f.path == path)
                    .and_then(|f| f.download_path.as_deref())
            });
            let source = checked_path(&root, download_path.unwrap_or(&path))?;
            let hash = hash_file(&source)?;
            if let Some(manifest) = &manifest {
                let declared = manifest
                    .files
                    .iter()
                    .find(|f| f.path == path)
                    .ok_or("Runtime file missing from manifest")?;
                if !matches_file(&source, declared.size, &sha256(&declared.sha256)?) {
                    return Err(format!(
                        "Local runtime file failed size/SHA-256 verification: {path}"
                    ));
                }
            }
            // Stage a snapshot; the selected build can be rebuilt during download.
            let cached = checked_path(&downloader.cache, &hash)?;
            let size = fs::metadata(&source).map_err(|e| e.to_string())?.len();
            downloader.total_size = downloader
                .total_size
                .checked_add(size)
                .ok_or("Runtime size overflow")?;
            if size > FILE_LIMIT || downloader.total_size > TOTAL_LIMIT {
                return Err("Runtime exceeds size limit".into());
            }
            if !matches_file(&cached, size, &hash) {
                atomic_copy(&source, &cached)?;
            }
            if hash_file(&cached)? != hash {
                return Err(format!("Runtime changed while staging {path}; retry"));
            }
            staged.push(StagedFile {
                root: Root::Game,
                path,
                source: cached,
                hash,
            });
        }
        if let Some(manifest) = &manifest {
            verify_runtime_binaries(manifest, staged)?;
        }
    }
    Ok(())
}

fn root_path<'a>(root: Root, game: &'a Path, profile: &'a Path) -> &'a Path {
    match root {
        Root::Game => game,
        Root::Profile => profile,
    }
}

fn save_journal(state: &Path, journal: &Journal) -> Result<(), String> {
    atomic_bytes(
        &checked_path(state, "active.json")?,
        &serde_json::to_vec_pretty(journal).map_err(|e| e.to_string())?,
    )
}

fn read_journal(state: &Path) -> Result<Journal, String> {
    let path = checked_path(state, "active.json")?;
    if !path.exists() {
        return Ok(Journal::default());
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| error("Read activation journal", e))?)
        .map_err(|e| error("Invalid activation journal", e))
}

// Skyrim and mod managers legitimately rewrite these generated lists after a launch.
// Recognize old journals too, without marking mods, settings or DLLs as mutable.
fn is_load_order_file(entry: &JournalEntry) -> bool {
    match entry.root {
        Root::Profile => {
            entry.path.eq_ignore_ascii_case("plugins.txt")
                || entry.path.eq_ignore_ascii_case("loadorder.txt")
        }
        Root::Game => entry.path.eq_ignore_ascii_case("Skyrim.ccc"),
    }
}

fn changed_outside_launcher(entry: &JournalEntry, actual: &str) -> bool {
    actual != entry.installed_hash && Some(actual) != entry.original_hash.as_deref()
}

fn preserve_load_order_change(
    entry: &JournalEntry,
    state: &Path,
    path: &Path,
) -> Result<Option<PreservedFile>, String> {
    if !is_load_order_file(entry) || !path.exists() {
        return Ok(None);
    }
    let actual = hash_file(path)?;
    if !changed_outside_launcher(entry, &actual) {
        return Ok(None);
    }
    let root = match entry.root {
        Root::Game => "game",
        Root::Profile => "profile",
    };
    // Content-addressed snapshots survive journal replacement and repeated switches.
    // They never replace the pre-launcher originals in backups/.
    let backup = checked_path(
        state,
        &format!("external-changes/{root}/{actual}/{}", entry.path),
    )?;
    if !backup.exists() {
        atomic_copy(path, &backup)?;
    }
    if hash_file(&backup)? != actual {
        return Err(format!(
            "Cannot verify the saved external change: {}. The current load order was kept.",
            backup.display()
        ));
    }
    if hash_file(path)? != actual {
        return Err(format!(
            "{} changed while saving its external changes. Close Skyrim and mod managers, then retry. A snapshot is in {}.",
            path.display(), backup.display()
        ));
    }
    Ok(Some(PreservedFile {
        path: path.display().to_string(),
        backup_path: backup.display().to_string(),
    }))
}

fn check_restore(
    journal: &Journal,
    state: &Path,
    game: &Path,
    profile: &Path,
) -> Result<(), String> {
    for entry in &journal.entries {
        let path = checked_path(root_path(entry.root, game, profile), &entry.path)?;
        if path.exists() {
            let actual = hash_file(&path)?;
            if !entry.mutable
                && !is_load_order_file(entry)
                && changed_outside_launcher(entry, &actual)
            {
                return Err(format!("{} was changed outside the launcher. Keep a copy and restore the launcher version before switching servers. Originals are in {}.", path.display(), state.display()));
            }
        }
        if let Some(backup) = &entry.backup {
            let backup_path = checked_path(state, backup)?;
            if Some(hash_file(&backup_path)?) != entry.original_hash {
                return Err(format!(
                    "Original file backup is missing/damaged: {}",
                    backup_path.display()
                ));
            }
        }
    }
    Ok(())
}

fn restore(state: &Path, game: &Path, profile: &Path) -> Result<Vec<PreservedFile>, String> {
    let mut journal = read_journal(state)?;
    check_restore(&journal, state, game, profile)?;
    let mut preserved = Vec::new();
    while let Some(entry) = journal.entries.last() {
        let path = checked_path(root_path(entry.root, game, profile), &entry.path)?;
        if let Some(saved) = preserve_load_order_change(entry, state, &path)? {
            preserved.push(saved);
        }
        if let Some(backup) = &entry.backup {
            atomic_copy(&checked_path(state, backup)?, &path)?;
        } else if path.exists() {
            fs::remove_file(&path).map_err(|e| error("Remove previous server file", e))?;
        }
        journal.entries.pop();
        save_journal(state, &journal)?;
    }
    Ok(preserved)
}

fn activate(
    files: &[StagedFile],
    state: &Path,
    game: &Path,
    profile: &Path,
) -> Result<Vec<PreservedFile>, String> {
    let preserved = restore(state, game, profile)?;
    let mut journal = Journal::default();
    let result = (|| {
        for (index, entry) in files.iter().enumerate() {
            let destination = checked_path(root_path(entry.root, game, profile), &entry.path)?;
            let original_hash = if destination.exists() {
                Some(hash_file(&destination)?)
            } else {
                None
            };
            let backup = if original_hash.is_some() {
                let name = format!("backups/{index}");
                atomic_copy(&destination, &checked_path(state, &name)?)?;
                Some(name)
            } else {
                None
            };
            journal.entries.push(JournalEntry {
                root: entry.root,
                path: entry.path.clone(),
                backup,
                original_hash,
                installed_hash: entry.hash.clone(),
                mutable: entry
                    .path
                    .starts_with("Data/Platform/Plugins/auth-data-no-load."),
            });
            // Write ahead: recovery also works if the launcher is interrupted mid-copy.
            save_journal(state, &journal)?;
            atomic_copy(&entry.source, &destination)?;
            if hash_file(&destination)? != entry.hash {
                return Err(format!("Activation verification failed: {}", entry.path));
            }
        }
        Ok(())
    })();
    if let Err(err) = result {
        return match restore(state, game, profile) {
            Ok(_) => Err(err),
            Err(rollback) => Err(format!("{err}. Recovery required: {rollback}")),
        };
    }
    Ok(preserved)
}

fn stage_bytes(cache: &Path, root: Root, path: &str, bytes: &[u8]) -> Result<StagedFile, String> {
    let hash = format!("{:x}", Sha256::digest(bytes));
    let source = checked_path(cache, &hash)?;
    if !matches_file(&source, bytes.len() as u64, &hash) {
        atomic_bytes(&source, bytes)?;
    }
    Ok(StagedFile {
        root,
        path: path.into(),
        source,
        hash,
    })
}

/// Preserve graphics/language/client options; replace only server/auth selection.
fn client_settings(
    existing: Option<&[u8]>,
    request: &ConnectRequest,
    host: &str,
) -> Result<Vec<u8>, String> {
    let mut value = if let Some(bytes) = existing {
        serde_json::from_slice::<serde_json::Value>(bytes)
            .map_err(|e| error("Existing client settings are invalid", e))?
    } else {
        serde_json::json!({})
    };
    let object = value
        .as_object_mut()
        .ok_or("Client settings must be a JSON object")?;
    object.remove("gameData");
    object.remove("master-key");
    object.remove("server-public-keys"); // Keys from another server must never follow a switch.
    object.insert("server-ip".into(), host.into());
    object.insert("server-port".into(), request.port.into());
    object.insert("server-info-ignore".into(), true.into());
    object.insert(
        "master".into(),
        request
            .master_url
            .as_deref()
            .unwrap_or("")
            .trim()
            .trim_end_matches('/')
            .into(),
    );
    object.insert(
        "server-master-key".into(),
        request
            .server_master_key
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(serde_json::Value::from)
            .unwrap_or(serde_json::Value::Null),
    );
    let display_name = crate::player_name::validate(request.player_name.as_deref())?;
    object.remove("playerName");
    if let Some(name) = &display_name { object.insert("playerName".into(), name.clone().into()); }
    if let Some(steam) = &request.steam_auth {
        object.insert("gameData".into(), serde_json::json!({
            "steamSession": steam.steam_session, "steamId": steam.steam_id,
            "accountLoginRequired": steam.account_login_required,
            "playerName": display_name,
        }));
        return serde_json::to_vec_pretty(&value).map_err(|e| e.to_string());
    }
    if request.offline {
        let profile = request.profile_id.unwrap_or(1);
        if profile == 0 || profile > i32::MAX as u32 {
            return Err("Offline profile ID must be from 1 to 2147483647".into());
        }
        object.insert(
            "gameData".into(),
            serde_json::json!({ "profileId": profile }),
        );
    } else {
        http_url(request.master_url.as_deref().unwrap_or(""))?;
    }
    if let Some(name) = crate::player_name::validate(request.player_name.as_deref())? {
        object.insert("playerName".into(), name.clone().into());
        if let Some(data) = object.get_mut("gameData").and_then(|data| data.as_object_mut()) { data.insert("playerName".into(), name.into()); }
    } else { object.remove("playerName"); }
    serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())
}

fn download_url(base: &Url, name: &str) -> Result<Url, String> {
    file_name(name)?;
    // The fork's earlier *.esm deny route also matches its download route.
    // Percent-encode the whole filename; Koa decodes the named route parameter.
    let encoded: String = name
        .as_bytes()
        .iter()
        .map(|b| format!("%{b:02X}"))
        .collect();
    base.join(&format!("api/resources/download/{encoded}"))
        .map_err(|e| e.to_string())
}

/// V2 preserves installation paths; it never turns server data into arbitrary
/// writes or silently installs a client runtime from a mod manifest.
fn resource_target(entry: &Resource, v2: bool) -> Result<String, String> {
    file_name(&entry.name)?;
    if !v2 {
        return Ok(if entry.kind == "script" {
            format!("Data/Scripts/{}", entry.name)
        } else {
            format!("Data/{}", entry.name)
        });
    }
    let target = entry
        .path
        .as_deref()
        .ok_or("Resource has no installation path")?;
    safe_path(target)?;
    let lower = target.to_ascii_lowercase();
    if !target.starts_with("Data/")
        || target.rsplit('/').next() != Some(entry.name.as_str())
        || lower.starts_with("data/platform/")
        || lower.contains("auth-data")
        || lower.contains(".skymp")
        || official_file(&entry.name)
    {
        return Err(format!("Protected/invalid mod destination: {target}"));
    }
    let ext = Path::new(target)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let valid = match entry.kind.as_str() {
        "mod" => target.split('/').count() == 2 && matches!(ext.as_str(), "esm" | "esp" | "esl"),
        "archive" => target.split('/').count() == 2 && ext == "bsa",
        "script" => lower.starts_with("data/scripts/") && ext == "pex",
        "asset" => matches!(
            ext.as_str(),
            "nif"
                | "dds"
                | "hkx"
                | "tri"
                | "btr"
                | "bto"
                | "wav"
                | "xwm"
                | "fuz"
                | "lip"
                | "strings"
                | "dlstrings"
                | "ilstrings"
                | "swf"
                | "gfx"
                | "seq"
                | "ttf"
                | "otf"
                | "png"
                | "jpg"
                | "jpeg"
                | "tga"
                | "bmp"
        ),
        "config" => matches!(
            ext.as_str(),
            "ini" | "json" | "xml" | "txt" | "toml" | "yaml" | "yml"
        ),
        _ => false,
    };
    if !valid {
        return Err(format!("Unsupported mod file type/path: {target}"));
    }
    Ok(target.into())
}

fn resource_url(base: &Url, entry: &Resource, v2: bool) -> Result<Url, String> {
    if !v2 {
        return download_url(base, &entry.name);
    }
    let route = entry
        .download_path
        .as_deref()
        .ok_or("Resource has no download path")?;
    let id = route
        .strip_prefix("api/launcher/files/")
        .ok_or("Invalid launcher download path")?;
    if id.len() != 64
        || !id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("Invalid launcher resource ID".into());
    }
    base.join(route).map_err(|e| e.to_string())
}

fn baseline_path(
    old: &Journal,
    state: &Path,
    game: &Path,
    relative: &str,
) -> Result<Option<PathBuf>, String> {
    if let Some(entry) = old
        .entries
        .iter()
        .find(|e| matches!(e.root, Root::Game) && e.path.eq_ignore_ascii_case(relative))
    {
        return entry
            .backup
            .as_ref()
            .map(|p| checked_path(state, p))
            .transpose();
    }
    let path = checked_path(game, relative)?;
    Ok(path.is_file().then_some(path))
}

pub fn prepare<F: Fn(Progress)>(
    request: &ConnectRequest,
    game: &Path,
    profile: &Path,
    cache_root: &Path,
    notify: F,
) -> Result<PreparedServer, String> {
    let host = validate_host(&request.ip, request.port)?;
    let base = http_url(
        request
            .resource_url
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(&default_resource_url(&host)),
    )?;
    // Validate authentication before downloading anything.
    client_settings(None, request, &host)?;
    let state = checked_path(game, ".skymp-launcher")?;
    fs::create_dir_all(&state).map_err(|e| error("Create launcher state directory", e))?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(checked_path(&state, "operation.lock")?)
        .map_err(|e| error("Open operation lock", e))?;
    lock.try_lock_exclusive()
        .map_err(|_| "Another launcher operation is already preparing this Skyrim installation")?;
    let old = read_journal(&state)?;
    check_restore(&old, &state, game, profile)?;
    let server_id = format!(
        "{:x}",
        Sha256::digest(format!("{host}:{}|{base}", request.port).as_bytes())
    );
    let cache = checked_path(cache_root, &server_id)?;
    fs::create_dir_all(&cache).map_err(|e| error("Create server cache", e))?;
    let client = client()?;
    notify(Progress {
        operation_id: request.operation_id.clone(),
        stage: "manifest",
        file: base.to_string(),
        completed: 0,
        total: 0,
    });
    let modern: Option<ResourceManifest> = read_json(
        &client,
        base.join("api/launcher/manifest")
            .map_err(|e| e.to_string())?,
        true,
    )?;
    let v2 = modern.is_some();
    let public: ResourceManifest = if let Some(manifest) = modern {
        manifest
    } else {
        read_json(
            &client,
            base.join("api/resources/manifest")
                .map_err(|e| e.to_string())?,
            true,
        )?
        .unwrap_or(ResourceManifest {
            version: "1".into(),
            resources: Vec::new(),
            load_order: None,
            required_local_files: Vec::new(),
            total_size: None,
            runtime_source: None,
        })
    };
    if public.version != (if v2 { "2" } else { "1" }) || public.resources.len() > 10000 {
        return Err("Unsupported/oversized resource manifest".into());
    }
    let mut effective_request = request.clone();
    if v2
        && effective_request
            .runtime_source
            .as_deref()
            .map(str::trim)
            .unwrap_or("")
            .is_empty()
    {
        if let Some(source) = public
            .runtime_source
            .as_deref()
            .filter(|s| !s.trim().is_empty())
        {
            http_url(source)?;
            effective_request.runtime_source = Some(source.into());
        }
    }
    let mut downloader = Downloader {
        client: &client,
        cache,
        request: &effective_request,
        notify: &notify,
        downloaded: 0,
        cached: 0,
        total_size: 0,
        runtime_manifest_sha256: None,
    };
    let legacy: Option<GameManifest> = if v2 {
        if public
            .required_local_files
            .iter()
            .any(|entry| !official_file(&entry.filename))
        {
            return Err("Only base-game files may be declared as local requirements".into());
        }
        Some(GameManifest {
            version_major: 1,
            mods: public.required_local_files.clone(),
            load_order: public
                .load_order
                .clone()
                .ok_or("Launcher manifest has no loadOrder")?,
        })
    } else {
        read_json(
            &client,
            base.join("manifest.json").map_err(|e| e.to_string())?,
            true,
        )?
    };
    if legacy
        .as_ref()
        .map(|m| m.version_major != 1 || m.mods.len() > 10000)
        .unwrap_or(false)
    {
        return Err("Unsupported game manifest".into());
    }
    let order = legacy.as_ref().map(|m| m.load_order.clone()).or(public.load_order).ok_or("Server must publish /manifest.json with loadOrder (or loadOrder in the resource manifest)")?;
    if order.is_empty() || order.len() > 4096 {
        return Err("Server load order is empty/too large".into());
    }
    let mut order_set = HashSet::new();
    for name in &order {
        file_name(name)?;
        let ext = Path::new(name)
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !matches!(ext.as_str(), "esm" | "esp" | "esl")
            || !order_set.insert(name.to_ascii_lowercase())
        {
            return Err(format!("Invalid/duplicate plugin in load order: {name}"));
        }
    }
    let mut resources: BTreeMap<String, Resource> = BTreeMap::new();
    let mut declared_size = 0u64;
    for entry in public.resources {
        let target = resource_target(&entry, v2)?;
        if v2 {
            resource_url(&base, &entry, true)?;
            if entry.kind == "mod" && !order_set.contains(&entry.name.to_ascii_lowercase()) {
                return Err(format!(
                    "Downloaded plugin is not in server loadOrder: {}",
                    entry.name
                ));
            }
            declared_size = declared_size
                .checked_add(entry.size)
                .ok_or("Package size overflow")?;
            if entry.size > FILE_LIMIT || declared_size > TOTAL_LIMIT {
                return Err("Mod package exceeds size limits".into());
            }
        }
        // This fork also emits unreadable placeholder duplicates for loadOrder entries.
        if !v2 && entry.hash.is_empty() && entry.size == 0 {
            continue;
        }
        sha256(&entry.hash)?;
        let extension = Path::new(&entry.name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !v2
            && !matches!(
                (entry.kind.as_str(), extension.as_str()),
                ("mod", "esm" | "esp" | "esl" | "bsa") | ("archive", "bsa") | ("script", "pex")
            )
        {
            return Err(format!("Unsupported resource type: {}", entry.name));
        }
        let key = target.to_lowercase();
        if let Some(previous) = resources.get(&key) {
            if v2 || previous.hash != entry.hash || previous.size != entry.size {
                return Err(format!(
                    "Ambiguous resource destination on server: {}",
                    target
                ));
            }
        } else {
            resources.insert(key, entry);
        }
    }
    if v2 && public.total_size != Some(declared_size) {
        return Err("Launcher manifest totalSize does not match its resources".into());
    }
    let mut staged = Vec::new();
    // Game files belong to the user's installation; verify, never download/replace.
    for name in order.iter().filter(|n| official_file(n)) {
        downloader.progress("verifying", name, 0, 0);
        let path = baseline_path(&old, &state, game, &format!("Data/{name}"))?
            .ok_or_else(|| format!("Required local Skyrim file missing: {name}"))?;
        if let Some(entry) = legacy.as_ref().and_then(|m| {
            m.mods
                .iter()
                .find(|m| m.filename.eq_ignore_ascii_case(name))
        }) {
            verify_crc(&path, entry)?;
        } else if let Some(entry) = resources.get(&format!("Data/{name}").to_lowercase()) {
            if !matches_file(&path, entry.size, &sha256(&entry.hash)?) {
                return Err(format!(
                    "Required local game file missing/different: {name}"
                ));
            }
        } else if v2 || !path.is_file() {
            return Err(format!("Required local Skyrim file missing: {name}"));
        }
    }
    for entry in resources.values() {
        if official_file(&entry.name)
            || (entry.kind == "mod"
                && !entry.name.to_ascii_lowercase().ends_with(".bsa")
                && !order_set.contains(&entry.name.to_ascii_lowercase()))
        {
            continue;
        }
        let hash = sha256(&entry.hash)?;
        let source = downloader.obtain(
            resource_url(&base, entry, v2)?,
            entry.size,
            &hash,
            entry.path.as_deref().unwrap_or(&entry.name),
        )?;
        let path = resource_target(entry, v2)?;
        staged.push(StagedFile {
            root: Root::Game,
            path,
            source,
            hash,
        });
    }
    // Check every declared legacy plugin/archive, including files the new scanner omits.
    if let Some(legacy) = &legacy {
        let mut unique = HashSet::new();
        for entry in &legacy.mods {
            file_name(&entry.filename)?;
            if !unique.insert(entry.filename.to_ascii_lowercase()) {
                return Err("Duplicate file in game manifest".into());
            }
            let target = format!("Data/{}", entry.filename);
            let source = staged.iter().find(|s| s.path.eq_ignore_ascii_case(&target)).map(|s| s.source.clone())
                .or(baseline_path(&old, &state, game, &target)?).ok_or_else(|| format!("{} is missing from the verified server package; check the server's published mod files", entry.filename))?;
            downloader.progress("verifying", &entry.filename, 0, 0);
            verify_crc(&source, entry).map_err(|e| format!("{e}. If this is a custom mod/archive, the server must expose it in /api/resources/manifest and /api/resources/download/:name."))?;
        }
    }
    for name in &order {
        let target = format!("Data/{name}");
        let has_checksum = resources.contains_key(&target.to_lowercase())
            || legacy
                .as_ref()
                .map(|manifest| {
                    manifest
                        .mods
                        .iter()
                        .any(|m| m.filename.eq_ignore_ascii_case(name))
                })
                .unwrap_or(false);
        if !official_file(name) && !has_checksum {
            return Err(format!(
                "Server does not publish a checksum for required plugin {name}"
            ));
        }
        if !staged.iter().any(|s| s.path.eq_ignore_ascii_case(&target))
            && baseline_path(&old, &state, game, &target)?.is_none()
        {
            return Err(format!("Server load order requires {name}, but no verified download/local file is available"));
        }
    }
    let mut runtime = Vec::new();
    stage_runtime(&mut downloader, &mut runtime, game)?;
    // Server scripts can override a runtime script, never the reverse.
    runtime.retain(|r| !staged.iter().any(|s| s.path.eq_ignore_ascii_case(&r.path)));
    staged.splice(0..0, runtime);
    for required in RUNTIME_REQUIRED {
        if !staged.iter().any(|s| s.path.eq_ignore_ascii_case(required))
            && baseline_path(&old, &state, game, required)?.is_none()
        {
            return Err(format!("SkyMP client runtime missing: {required}. Select a client package folder (build/dist/client) or its runtime-manifest.json URL."));
        }
    }
    // Use original settings, not the selected previous server's modified settings.
    let original_settings = old
        .entries
        .iter()
        .find(|e| matches!(e.root, Root::Game) && e.path.eq_ignore_ascii_case(SETTINGS));
    let settings_bytes = match original_settings {
        Some(entry) => entry
            .backup
            .as_ref()
            .map(|p| checked_path(&state, p).and_then(|p| fs::read(p).map_err(|e| e.to_string())))
            .transpose()?,
        None => {
            let path = checked_path(game, SETTINGS)?;
            if path.exists() {
                Some(fs::read(path).map_err(|e| e.to_string())?)
            } else {
                None
            }
        }
    };
    staged.push(stage_bytes(
        &downloader.cache,
        Root::Game,
        SETTINGS,
        &client_settings(settings_bytes.as_deref(), request, &host)?,
    )?);
    let plugins = format!(
        "# Managed by SkyMP Launcher\r\n{}\r\n",
        order
            .iter()
            .map(|s| format!("*{s}"))
            .collect::<Vec<_>>()
            .join("\r\n")
    );
    let load_order = format!("# Managed by SkyMP Launcher\r\n{}\r\n", order.join("\r\n"));
    staged.push(stage_bytes(
        &downloader.cache,
        Root::Profile,
        "plugins.txt",
        plugins.as_bytes(),
    )?);
    staged.push(stage_bytes(
        &downloader.cache,
        Root::Profile,
        "loadorder.txt",
        load_order.as_bytes(),
    )?);
    // Anniversary Edition can force-load Creation Club files outside plugins.txt.
    if checked_path(game, "Skyrim.ccc")?.exists()
        || order
            .iter()
            .any(|name| name.to_ascii_lowercase().starts_with("cc"))
    {
        let creation_club = order
            .iter()
            .filter(|name| name.to_ascii_lowercase().starts_with("cc"))
            .cloned()
            .collect::<Vec<_>>()
            .join("\r\n");
        staged.push(stage_bytes(
            &downloader.cache,
            Root::Game,
            "Skyrim.ccc",
            creation_club.as_bytes(),
        )?);
    }
    // A cached login from a different master must not authenticate to the new server.
    for auth_file in [
        "Data/Platform/Plugins/auth-data-no-load.js",
        "Data/Platform/Plugins/auth-data-no-load.txt",
    ] {
        staged.push(stage_bytes(
            &downloader.cache,
            Root::Game,
            auth_file,
            b"//null",
        )?);
    }
    let mut unique = BTreeMap::new();
    for entry in &staged {
        let key = format!("{:?}/{}", entry.root, entry.path.to_ascii_lowercase());
        if unique.insert(key, ()).is_some() {
            return Err(format!("Duplicate installation target: {}", entry.path));
        }
        checked_path(root_path(entry.root, game, profile), &entry.path)?;
    }
    downloader.progress("installing", "", 0, staged.len() as u64);
    // The native client watches both default plugin folders. Empty directories
    // cannot be represented by the file manifest, so prepare them explicitly.
    ensure_runtime_folders(game)?;
    let preserved_files = activate(&staged, &state, game, profile)?;
    downloader.progress("ready", "", staged.len() as u64, staged.len() as u64);
    Ok(PreparedServer {
        resource_url: base.to_string(),
        downloaded_files: downloader.downloaded,
        cached_files: downloader.cached,
        load_order: order,
        preserved_files,
        runtime_manifest_sha256: downloader.runtime_manifest_sha256,
        verified_files: staged.len(),
    })
}

fn ensure_runtime_folders(game: &Path) -> Result<(), String> {
    for relative in ["Data/Platform/Plugins", "Data/Platform/PluginsDev"] {
        let directory = checked_path(game, relative)?;
        if directory.exists() && !directory.is_dir() {
            return Err(format!("Runtime folder is occupied by a file: {relative}"));
        }
        fs::create_dir_all(directory).map_err(|e| error("Prepare native plugin folder", e))?;
    }
    Ok(())
}

pub fn restore_installation(game: &Path, profile: &Path) -> Result<Vec<PreservedFile>, String> {
    let state = checked_path(game, ".skymp-launcher")?;
    if !state.exists() {
        return Ok(Vec::new());
    }
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(checked_path(&state, "operation.lock")?)
        .map_err(|e| e.to_string())?;
    lock.try_lock_exclusive()
        .map_err(|_| "Another launcher operation is running")?;
    restore(&state, game, profile)
}

/// Only import public connection fields; never return admin/bot credentials.
pub fn import_build(build_dir: &str, connect_host: &str) -> Result<ImportedServer, String> {
    let root = PathBuf::from(build_dir.trim());
    let server = if root.join("dist/server/server-settings.json").is_file() {
        root.join("dist/server")
    } else {
        root.clone()
    };
    let bytes = fs::read(server.join("server-settings.json")).map_err(|e| {
        error(
            "Read server-settings.json (select build/ or a server package folder)",
            e,
        )
    })?;
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| error("Invalid server settings", e))?;
    let port = value["port"]
        .as_u64()
        .filter(|p| *p > 0 && *p <= u16::MAX as u64)
        .ok_or("Invalid game port in server settings")? as u16;
    let ip = validate_host(connect_host, port)?;
    let ui_port = value["uiPort"].as_u64().unwrap_or(8080);
    if ui_port == 0 || ui_port > u16::MAX as u64 {
        return Err("Invalid HTTP port in server settings".into());
    }
    let http_host = if ip.contains(':') {
        format!("[{ip}]")
    } else {
        ip.clone()
    };
    let runtime = [root.join("dist/client"), root.join("../client")]
        .into_iter()
        .find(|p| p.join("Data/Platform/Plugins/skymp5-client.js").is_file());
    Ok(ImportedServer {
        name: value["name"].as_str().unwrap_or("SkyMP").into(),
        ip,
        port,
        resource_url: format!("http://{http_host}:{ui_port}"),
        master_url: value["master"].as_str().unwrap_or("").into(),
        server_master_key: value["serverUid"]
            .as_str()
            .or_else(|| value["masterKey"].as_str())
            .map(String::from),
        offline: value["offlineMode"].as_bool().unwrap_or(false),
        runtime_source: runtime.map(|p| p.to_string_lossy().to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::net::TcpListener;
    use std::sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    };

    #[cfg(windows)]
    #[test]
    fn atomic_replacement_waits_for_a_temporary_windows_file_lock() {
        use std::os::windows::fs::OpenOptionsExt;
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("active.json");
        atomic_bytes(&path, b"old journal").unwrap();
        let held = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(120));
            drop(held);
        });
        atomic_bytes(&path, b"new journal").unwrap();
        release.join().unwrap();
        assert_eq!(fs::read(path).unwrap(), b"new journal");
    }

    struct TestServer {
        url: String,
        routes: Arc<Mutex<HashMap<String, (u16, Vec<u8>)>>>,
        downloads: Arc<AtomicUsize>,
        stop: Arc<AtomicBool>,
        worker: Option<std::thread::JoinHandle<()>>,
    }

    impl TestServer {
        fn new() -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!("http://{}/", listener.local_addr().unwrap());
            listener.set_nonblocking(true).unwrap();
            let routes = Arc::new(Mutex::new(HashMap::<String, (u16, Vec<u8>)>::new()));
            let downloads = Arc::new(AtomicUsize::new(0));
            let stop = Arc::new(AtomicBool::new(false));
            let (map, counter, stopped) = (routes.clone(), downloads.clone(), stop.clone());
            let worker = std::thread::spawn(move || {
                while !stopped.load(Ordering::Relaxed) {
                    let (mut stream, _) = match listener.accept() {
                        Ok(value) => value,
                        Err(_) => {
                            std::thread::sleep(Duration::from_millis(2));
                            continue;
                        }
                    };
                    // Windows sockets inherit the listener's mode; wait for all request fragments.
                    stream.set_nonblocking(false).unwrap();
                    stream
                        .set_read_timeout(Some(Duration::from_secs(2)))
                        .unwrap();
                    let mut request = Vec::new();
                    let mut byte = [0u8; 1];
                    while request.len() < 16384 && !request.ends_with(b"\r\n\r\n") {
                        if stream.read(&mut byte).unwrap_or(0) == 0 {
                            break;
                        }
                        request.push(byte[0]);
                    }
                    let request = String::from_utf8_lossy(&request);
                    let route = request.split_whitespace().nth(1).unwrap_or("");
                    if route.starts_with("/api/resources/download/")
                        || route.starts_with("/api/launcher/files/")
                    {
                        counter.fetch_add(1, Ordering::Relaxed);
                    }
                    let (status, body) = map
                        .lock()
                        .unwrap()
                        .get(route)
                        .cloned()
                        .unwrap_or((404, b"not found".to_vec()));
                    let response = format!(
                        "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.write_all(&body);
                }
            });
            Self {
                url,
                routes,
                downloads,
                stop,
                worker: Some(worker),
            }
        }

        fn json(&self, path: &str, value: serde_json::Value) {
            self.routes
                .lock()
                .unwrap()
                .insert(path.into(), (200, serde_json::to_vec(&value).unwrap()));
        }

        fn configure(&self, plugin: &str, script: &[u8]) {
            let base = b"owned Skyrim data";
            let mod_bytes = format!("{plugin} content").into_bytes();
            let resource = |name: &str, kind: &str, bytes: &[u8]| {
                serde_json::json!({
                    "name": name, "kind": kind, "size": bytes.len(), "hash": format!("sha256:{:x}", Sha256::digest(bytes))
                })
            };
            self.json("/api/resources/manifest", serde_json::json!({ "version": "1", "resources": [
                resource("Skyrim.esm", "mod", base), resource(plugin, "mod", &mod_bytes), resource("Shared.pex", "script", script),
                { "name": plugin, "kind": "mod", "size": 0, "hash": "" }
            ] }));
            self.json("/manifest.json", serde_json::json!({ "versionMajor": 1,
                "mods": [
                    { "filename": "Skyrim.esm", "size": base.len(), "crc32": crc32fast::hash(base) as i32 },
                    { "filename": plugin, "size": mod_bytes.len(), "crc32": crc32fast::hash(&mod_bytes) as i32 }
                ], "loadOrder": ["Skyrim.esm", plugin]
            }));
            for (name, bytes) in [(plugin, mod_bytes), ("Shared.pex", script.to_vec())] {
                let url = download_url(&Url::parse(&self.url).unwrap(), name).unwrap();
                self.routes
                    .lock()
                    .unwrap()
                    .insert(url.path().into(), (200, bytes));
            }
        }

        fn modern(&self, files: &[(&str, &str, &[u8])]) -> serde_json::Value {
            let base = b"owned Skyrim data";
            let resources: Vec<_> = files.iter().map(|(path, kind, bytes)| {
                let sha = format!("{:x}", Sha256::digest(bytes));
                let id = format!("{:x}", Sha256::digest(format!("{}\0{sha}", path.to_lowercase()).as_bytes()));
                let route = format!("api/launcher/files/{id}");
                self.routes.lock().unwrap().insert(format!("/{route}"), (200, bytes.to_vec()));
                serde_json::json!({ "name": path.rsplit('/').next().unwrap(), "path": path,
                    "kind": kind, "size": bytes.len(), "hash": format!("sha256:{sha}"), "downloadPath": route })
            }).collect();
            let value = serde_json::json!({ "version": "2", "loadOrder": ["Skyrim.esm", "Community.esp"],
                "requiredLocalFiles": [{ "filename": "Skyrim.esm", "size": base.len(), "crc32": crc32fast::hash(base) as i32 }],
                "totalSize": files.iter().map(|(_, _, bytes)| bytes.len()).sum::<usize>(), "resources": resources });
            self.json("/api/launcher/manifest", value.clone());
            value
        }
    }

    impl Drop for TestServer {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::Relaxed);
            self.worker.take().unwrap().join().unwrap();
        }
    }

    fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let game = temp.path().join("game");
        let profile = temp.path().join("profile");
        let cache = temp.path().join("cache");
        for (path, bytes) in [
            ("Data/Skyrim.esm", b"owned Skyrim data".as_slice()),
            ("Data/Scripts/Shared.pex", b"original script".as_slice()),
            (
                SETTINGS,
                br#"{"language":"de","gameData":{"profile_id":1},"otherOption":true}"#.as_slice(),
            ),
        ] {
            atomic_bytes(&game.join(path), bytes).unwrap();
        }
        for required in RUNTIME_REQUIRED {
            atomic_bytes(&game.join(required), b"installed runtime").unwrap();
        }
        atomic_bytes(&profile.join("plugins.txt"), b"*MySinglePlayer.esp").unwrap();
        (temp, game, profile, cache)
    }

    fn request(server: &TestServer) -> ConnectRequest {
        ConnectRequest {
            ip: "127.0.0.1".into(),
            port: 7777,
            skyrim_dir: None,
            resource_url: Some(server.url.clone()),
            master_url: None,
            server_master_key: None,
            offline: true,
            profile_id: Some(42),
            runtime_source: None,
            operation_id: "test".into(),
            player_name: None,
            steam_auth: None,
        }
    }

    #[test]
    fn verified_steam_session_replaces_offline_identity_and_is_not_accepted_from_ui() {
        let server = TestServer::new();
        let mut req = request(&server);
        req.steam_auth = Some(crate::steam_auth::SteamProof {
            steam_id: "76561198000000000".into(), steam_session: "a".repeat(64), account_login_required: false
        });
        req.player_name = Some("Hüter ÄÖÜ Довакин".into());
        let bytes = client_settings(None, &req, "127.0.0.1").unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["gameData"]["steamId"], "76561198000000000");
        assert_eq!(value["gameData"]["steamSession"], "a".repeat(64));
        assert_eq!(value["gameData"]["playerName"], "Hüter ÄÖÜ Довакин");
        assert_eq!(value["playerName"], "Hüter ÄÖÜ Довакин");
        assert!(value["gameData"].get("profileId").is_none());
        let incoming: ConnectRequest = serde_json::from_value(serde_json::json!({
            "ip": "127.0.0.1", "port": 7777, "operationId": "test", "steamAuth": {
                "steamId": "76561198000000000", "steamSession": "forged", "accountLoginRequired": false
            }
        })).unwrap();
        assert!(incoming.steam_auth.is_none());
    }

    fn transferred_runtime(
        server: &TestServer,
        target: &str,
        original: &[u8],
        transferred: &[u8],
    ) -> ConnectRequest {
        let mut paths = RUNTIME_REQUIRED.to_vec();
        if !paths.contains(&target) {
            paths.push(target);
        }
        let files = paths.iter().map(|path| {
            let bytes = if *path == target { original } else { b"runtime fixture".as_slice() };
            let response = if *path == target { transferred } else { bytes };
            server.routes.lock().unwrap().insert(format!("/runtime/{path}"), (200, response.to_vec()));
            serde_json::json!({"path":path,"size":bytes.len(),"sha256":format!("{:x}",Sha256::digest(bytes))})
        }).collect::<Vec<_>>();
        server.json(
            "/runtime/runtime-manifest.json",
            serde_json::json!({"version":1,"files":files}),
        );
        let mut req = request(server);
        req.runtime_source = Some(format!("{}runtime/runtime-manifest.json", server.url));
        req
    }

    #[test]
    fn ftp_lf_readme_restores_exact_original_bytes_and_repairs_the_cache() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        let target = "Data/SKSE/Docs/skse64_readme.txt";
        let original = "SKSE\r\nGrüße aus Himmelsrand\r\nСкайрим\r\n".as_bytes();
        let transferred = String::from_utf8(original.to_vec())
            .unwrap()
            .replace("\r\n", "\n");
        atomic_bytes(&game.join(target), b"previous local documentation").unwrap();
        let req = transferred_runtime(&server, target, original, transferred.as_bytes());
        let first = prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(fs::read(game.join(target)).unwrap(), original);
        let cached = cache
            .join(format!(
                "{:x}",
                Sha256::digest(format!("127.0.0.1:7777|{}", server.url))
            ))
            .join(format!("{:x}", Sha256::digest(original)));
        assert_eq!(fs::read(&cached).unwrap(), original);
        let repeat = prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(repeat.downloaded_files, 0);
        assert_eq!(
            repeat.cached_files,
            first.downloaded_files + first.cached_files
        );
        atomic_bytes(&cached, transferred.as_bytes()).unwrap();
        assert_eq!(
            prepare(&req, &game, &profile, &cache, |_| {})
                .unwrap()
                .downloaded_files,
            1
        );
        assert_eq!(fs::read(&cached).unwrap(), original);
        restore_installation(&game, &profile).unwrap();
        assert_eq!(
            fs::read(game.join(target)).unwrap(),
            b"previous local documentation"
        );
    }

    #[test]
    fn preparation_creates_optional_native_watch_folder_without_removing_existing_files() {
        let server = TestServer::new();
        server.configure("Test.esm", b"server mod");
        let (_temp, game, profile, cache) = fixture();
        let developer_folder = game.join("Data/Platform/PluginsDev");
        assert!(!developer_folder.exists());
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        assert!(developer_folder.is_dir());
        atomic_bytes(&developer_folder.join("keep.txt"), b"user file").unwrap();
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(
            fs::read(developer_folder.join("keep.txt")).unwrap(),
            b"user file"
        );
    }

    #[test]
    fn blocked_native_watch_folder_does_not_activate_server_files() {
        let server = TestServer::new();
        server.configure("Test.esm", b"server mod");
        let (_temp, game, profile, cache) = fixture();
        atomic_bytes(
            &game.join("Data/Platform/PluginsDev"),
            b"preserve this file",
        )
        .unwrap();
        let original = fs::read(profile.join("plugins.txt")).unwrap();
        let failure = prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap_err();
        assert!(failure.contains("Runtime folder is occupied"), "{failure}");
        assert_eq!(fs::read(profile.join("plugins.txt")).unwrap(), original);
        assert_eq!(
            fs::read(game.join("Data/Platform/PluginsDev")).unwrap(),
            b"preserve this file"
        );
        assert!(!game.join("Data/Test.esm").exists());
    }

    fn binary_runtime(
        server: &TestServer,
        target: &str,
        original: &[u8],
        transferred: &[u8],
    ) -> ConnectRequest {
        let req = transferred_runtime(server, target, original, transferred);
        let mut routes = server.routes.lock().unwrap();
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&routes["/runtime/runtime-manifest.json"].1).unwrap();
        let entry = manifest["files"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|f| f["path"] == target)
            .unwrap();
        let download = format!("payloads/{:x}.bin", Sha256::digest(original));
        entry["downloadPath"] = download.clone().into();
        routes.insert(format!("/runtime/{download}"), (200, original.to_vec()));
        routes.insert(
            "/runtime/runtime-manifest.json".into(),
            (200, serde_json::to_vec(&manifest).unwrap()),
        );
        req
    }

    #[test]
    fn binary_transport_installs_mixed_line_endings_at_the_original_target_path() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        let target = RUNTIME_REQUIRED[2];
        let original = b"first\r\nsecond\nthird\r\n";
        let req = binary_runtime(&server, target, original, b"first\nsecond\nthird\n");
        prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(fs::read(game.join(target)).unwrap(), original);
        assert!(!game.join("payloads").exists());
        assert!(
            prepare(&req, &game, &profile, &cache, |_| {})
                .unwrap()
                .downloaded_files
                == 0
        );
        restore_installation(&game, &profile).unwrap();
        assert_eq!(fs::read(game.join(target)).unwrap(), b"installed runtime");
    }

    #[test]
    fn local_manifest_uses_the_verified_binary_copy_instead_of_a_changed_text_copy() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        let target = "Data/SKSE/Docs/skse64_readme.txt";
        let original = b"first\r\nsecond\nthird\r\n";
        let mut req = binary_runtime(&server, target, original, b"first\nsecond\nthird\n");
        let local = tempfile::tempdir().unwrap();
        {
            let routes = server.routes.lock().unwrap();
            for (route, (_, bytes)) in routes.iter().filter(|(r, _)| r.starts_with("/runtime/")) {
                atomic_bytes(
                    &local.path().join(route.trim_start_matches("/runtime/")),
                    bytes,
                )
                .unwrap();
            }
        }
        req.runtime_source = Some(local.path().display().to_string());
        prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(fs::read(game.join(target)).unwrap(), original);
        restore_installation(&game, &profile).unwrap();
        assert!(!game.join(target).exists());
    }

    #[test]
    fn runtime_transport_paths_cannot_escape_the_manifest_directory() {
        for download in [
            "../escape.bin",
            "/root.bin",
            "https://other.example/file.bin",
            "payloads\\bad.bin",
            "payloads/CON.bin",
            "payloads/file.bin?x",
        ] {
            let server = TestServer::new();
            server.configure("Test.esm", b"script");
            let (_temp, game, profile, cache) = fixture();
            let req = binary_runtime(&server, "Data/SKSE/Docs/test.txt", b"original", b"original");
            let mut manifest: serde_json::Value = serde_json::from_slice(
                &server.routes.lock().unwrap()["/runtime/runtime-manifest.json"].1,
            )
            .unwrap();
            manifest["files"]
                .as_array_mut()
                .unwrap()
                .last_mut()
                .unwrap()["downloadPath"] = download.into();
            server.json("/runtime/runtime-manifest.json", manifest);
            assert!(
                prepare(&req, &game, &profile, &cache, |_| {}).is_err(),
                "{download}"
            );
            assert!(read_journal(&game.join(".skymp-launcher"))
                .unwrap()
                .entries
                .is_empty());
            assert_eq!(
                fs::read(game.join(RUNTIME_REQUIRED[0])).unwrap(),
                b"installed runtime"
            );
        }
    }

    #[test]
    fn corrupt_binary_transport_does_not_fall_back_to_an_unverified_text_copy() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        let target = "Data/SKSE/Docs/test.txt";
        let req = binary_runtime(&server, target, b"original", b"original");
        server.routes.lock().unwrap().insert(
            format!("/runtime/payloads/{:x}.bin", Sha256::digest(b"original")),
            (200, b"tampered".to_vec()),
        );
        assert!(prepare(&req, &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("verification failed"));
        assert!(!game.join(target).exists());
        assert!(read_journal(&game.join(".skymp-launcher"))
            .unwrap()
            .entries
            .is_empty());
    }

    #[test]
    fn mixed_line_endings_are_not_guessed_when_the_original_hash_cannot_be_restored() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        let target = RUNTIME_REQUIRED[2];
        let req = transferred_runtime(
            &server,
            target,
            b"first\r\nsecond\nthird\r\n",
            b"first\nsecond\nthird\n",
        );
        assert!(prepare(&req, &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("verification failed"));
        assert_eq!(fs::read(game.join(target)).unwrap(), b"installed runtime");
    }

    #[test]
    fn ftp_crlf_script_is_restored_to_the_exact_lf_manifest_bytes() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        let target = RUNTIME_REQUIRED[2];
        let original = "// Grüße\nconst value = 42;\n".as_bytes();
        let transferred = String::from_utf8(original.to_vec())
            .unwrap()
            .replace('\n', "\r\n");
        let req = transferred_runtime(&server, target, original, transferred.as_bytes());
        prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(fs::read(game.join(target)).unwrap(), original);
        restore_installation(&game, &profile).unwrap();
        assert_eq!(fs::read(game.join(target)).unwrap(), b"installed runtime");
    }

    #[test]
    fn text_content_changes_still_fail_before_activation() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        let active = fs::read(game.join(".skymp-launcher/active.json")).unwrap();
        let plugins = fs::read(profile.join("plugins.txt")).unwrap();
        let req = transferred_runtime(
            &server,
            "Data/SKSE/Docs/skse64_readme.txt",
            b"SKSE original\r\n",
            b"SKSE changed!\n",
        );
        let failure = prepare(&req, &game, &profile, &cache, |_| {}).unwrap_err();
        assert!(failure.contains("verification failed"));
        assert!(failure.contains("expected 15 bytes, received 14"));
        assert!(failure.contains("binary mode"));
        assert_eq!(
            fs::read(game.join(".skymp-launcher/active.json")).unwrap(),
            active
        );
        assert_eq!(fs::read(profile.join("plugins.txt")).unwrap(), plugins);
        assert_eq!(
            fs::read(game.join(RUNTIME_REQUIRED[0])).unwrap(),
            b"installed runtime"
        );
        assert!(!game.join("Data/SKSE/Docs/skse64_readme.txt").exists());
    }

    #[test]
    fn runtime_binary_files_are_never_normalized() {
        for target in [
            RUNTIME_REQUIRED[0],
            "Data/Scripts/Plugin.pex",
            "Data/SKSE/Plugins/versionlib.bin",
        ] {
            let server = TestServer::new();
            server.configure("Test.esm", b"script");
            let (_temp, game, profile, cache) = fixture();
            let req = transferred_runtime(&server, target, b"binary\r\nbytes", b"binary\nbytes");
            assert!(prepare(&req, &game, &profile, &cache, |_| {})
                .unwrap_err()
                .contains("verification failed"));
            assert!(read_journal(&game.join(".skymp-launcher"))
                .unwrap()
                .entries
                .is_empty());
            assert_eq!(
                fs::read(game.join(RUNTIME_REQUIRED[0])).unwrap(),
                b"installed runtime"
            );
        }
    }

    #[test]
    fn mod_resource_bytes_keep_their_strict_download_contract() {
        let server = TestServer::new();
        let mut files = modern_files();
        files.push(("Data/config/Example.txt", "config", b"original\r\n"));
        let manifest = server.modern(&files);
        let entry = manifest["resources"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["path"] == "Data/config/Example.txt")
            .unwrap();
        server.routes.lock().unwrap().insert(
            format!("/{}", entry["downloadPath"].as_str().unwrap()),
            (200, b"original\n".to_vec()),
        );
        let (_temp, game, profile, cache) = fixture();
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("verification failed"));
        assert!(!game.join("Data/config/Example.txt").exists());
    }

    #[test]
    fn runtime_text_with_binary_nuls_is_not_reconstructed() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        let req = transferred_runtime(
            &server,
            "Data/SKSE/Docs/test.txt",
            b"binary\0\r\n",
            b"binary\0\n",
        );
        assert!(prepare(&req, &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("verification failed"));
        assert!(!game.join("Data/SKSE/Docs/test.txt").exists());
    }

    #[test]
    fn runtime_text_transfer_limits_and_wrong_sizes_still_block() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        let req = transferred_runtime(&server, "Data/SKSE/Docs/test.txt", b"ok\r\n", &[b'x'; 1000]);
        assert!(prepare(&req, &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("larger than declared"));
        assert!(original_text_bytes(
            b"ok\n",
            TEXT_REPAIR_LIMIT + 1,
            &format!("{:x}", Sha256::digest(b"ok\r\n"))
        )
        .is_none());
        assert!(
            original_text_bytes(b"ok\n", 5, &format!("{:x}", Sha256::digest(b"ok\r\n"))).is_none()
        );
        assert!(read_journal(&game.join(".skymp-launcher"))
            .unwrap()
            .entries
            .is_empty());
    }

    #[test]
    fn download_cache_repair_switch_and_restore_originals() {
        let a = TestServer::new();
        a.configure("ServerA.esm", b"script A");
        let b = TestServer::new();
        b.configure("ServerB.esm", b"script B");
        let (_temp, game, profile, cache) = fixture();
        let first = prepare(&request(&a), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(first.downloaded_files, 2);
        assert_eq!(
            fs::read(game.join("Data/Scripts/Shared.pex")).unwrap(),
            b"script A"
        );
        let settings: serde_json::Value =
            serde_json::from_slice(&fs::read(game.join(SETTINGS)).unwrap()).unwrap();
        assert_eq!(settings["gameData"]["profileId"], 42);
        assert_eq!(settings["language"], "de");
        assert_eq!(settings["otherOption"], true);
        assert!(
            String::from_utf8(fs::read(profile.join("plugins.txt")).unwrap())
                .unwrap()
                .contains("*ServerA.esm")
        );
        // The in-game login writes this file; it must not prevent a normal switch.
        atomic_bytes(
            &game.join("Data/Platform/Plugins/auth-data-no-load.js"),
            b"//{\"session\":\"server-a-only\"}",
        )
        .unwrap();
        let second = prepare(&request(&a), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(second.downloaded_files, 0);
        assert_eq!(second.cached_files, 2);
        assert_eq!(a.downloads.load(Ordering::Relaxed), 2);
        // Corrupt cached data is downloaded again, never trusted by filename.
        let hash = format!("{:x}", Sha256::digest(b"script A"));
        let server_cache = fs::read_dir(&cache)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        atomic_bytes(&server_cache.join(hash), b"bad cache").unwrap();
        assert_eq!(
            prepare(&request(&a), &game, &profile, &cache, |_| {})
                .unwrap()
                .downloaded_files,
            1
        );
        prepare(&request(&b), &game, &profile, &cache, |_| {}).unwrap();
        assert!(!game.join("Data/ServerA.esm").exists());
        assert!(game.join("Data/ServerB.esm").exists());
        assert_eq!(
            fs::read(game.join("Data/Scripts/Shared.pex")).unwrap(),
            b"script B"
        );
        assert_eq!(
            fs::read(game.join("Data/Platform/Plugins/auth-data-no-load.js")).unwrap(),
            b"//null"
        );
        restore_installation(&game, &profile).unwrap();
        assert!(!game.join("Data/ServerB.esm").exists());
        assert!(!game
            .join("Data/Platform/Plugins/auth-data-no-load.js")
            .exists());
        assert_eq!(
            fs::read(game.join("Data/Scripts/Shared.pex")).unwrap(),
            b"original script"
        );
        assert_eq!(
            fs::read(profile.join("plugins.txt")).unwrap(),
            b"*MySinglePlayer.esp"
        );
        assert!(!profile.join("loadorder.txt").exists());
    }

    #[test]
    fn failed_download_leaves_active_server_intact() {
        let good = TestServer::new();
        good.configure("Good.esm", b"good script");
        let bad = TestServer::new();
        bad.configure("Bad.esm", b"bad script");
        let url = download_url(&Url::parse(&bad.url).unwrap(), "Bad.esm").unwrap();
        bad.routes
            .lock()
            .unwrap()
            .insert(url.path().into(), (200, b"tampered".to_vec()));
        let (_temp, game, profile, cache) = fixture();
        prepare(&request(&good), &game, &profile, &cache, |_| {}).unwrap();
        let previous = fs::read(game.join(SETTINGS)).unwrap();
        assert!(prepare(&request(&bad), &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("verification failed"));
        assert_eq!(fs::read(game.join(SETTINGS)).unwrap(), previous);
        assert!(game.join("Data/Good.esm").exists());
        assert!(!game.join("Data/Bad.esm").exists());
        assert_eq!(
            fs::read(game.join("Data/Scripts/Shared.pex")).unwrap(),
            b"good script"
        );
    }

    #[test]
    fn externally_changed_mod_is_not_overwritten() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        atomic_bytes(&game.join("Data/Test.esm"), b"user edited this").unwrap();
        assert!(restore_installation(&game, &profile)
            .unwrap_err()
            .contains("changed outside"));
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("changed outside"));
        assert_eq!(
            fs::read(game.join("Data/Test.esm")).unwrap(),
            b"user edited this"
        );
    }

    #[test]
    fn missing_multiplayer_ui_blocks_preparation_before_activation() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        fs::remove_file(game.join("Data/Platform/UI/index.html")).unwrap();
        let plugins = fs::read(profile.join("plugins.txt")).unwrap();
        let error = prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap_err();
        assert!(error.contains("Data/Platform/UI/index.html"));
        assert_eq!(fs::read(profile.join("plugins.txt")).unwrap(), plugins);
        assert!(read_journal(&game.join(".skymp-launcher"))
            .unwrap()
            .entries
            .is_empty());
    }

    #[test]
    fn game_rewritten_plugins_are_preserved_and_preparation_can_repeat() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        let state = game.join(".skymp-launcher");
        let journal = read_journal(&state).unwrap();
        let plugins = journal
            .entries
            .iter()
            .find(|e| e.path == "plugins.txt")
            .unwrap();
        assert!(!plugins.mutable); // Journals from older launcher versions work unchanged.
        let original = fs::read(state.join(plugins.backup.as_ref().unwrap())).unwrap();
        let rewritten = b"# This file is used by Skyrim to keep track of your downloaded content.\r\nccBGSSSE001-Fish.esm\r\nccQDRSSE001-SurvivalMode.esl\r\n";
        atomic_bytes(&profile.join("plugins.txt"), rewritten).unwrap();
        let prepared = prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(prepared.preserved_files.len(), 1);
        let saved = &prepared.preserved_files[0];
        assert_eq!(fs::read(&saved.backup_path).unwrap(), rewritten);
        assert_eq!(
            saved.path,
            profile.join("plugins.txt").display().to_string()
        );
        assert!(saved.backup_path.contains("external-changes"));
        assert!(
            String::from_utf8(fs::read(profile.join("plugins.txt")).unwrap())
                .unwrap()
                .contains("*Test.esm")
        );
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {})
            .unwrap()
            .preserved_files
            .is_empty());
        restore_installation(&game, &profile).unwrap();
        assert_eq!(fs::read(profile.join("plugins.txt")).unwrap(), original);
        assert_eq!(fs::read(&saved.backup_path).unwrap(), rewritten);
    }

    #[test]
    fn switching_servers_preserves_each_changed_load_order_version() {
        let a = TestServer::new();
        a.configure("ServerA.esm", b"script A");
        let b = TestServer::new();
        b.configure("ServerB.esm", b"script B");
        let (_temp, game, profile, cache) = fixture();
        atomic_bytes(&game.join("Skyrim.ccc"), b"original Creation Club list").unwrap();
        prepare(&request(&a), &game, &profile, &cache, |_| {}).unwrap();
        for (path, bytes) in [
            (profile.join("plugins.txt"), b"*UserAdded.esp".as_slice()),
            (profile.join("loadorder.txt"), b"UserAdded.esp".as_slice()),
            (game.join("Skyrim.ccc"), b"ccUserAdded.esl".as_slice()),
        ] {
            atomic_bytes(&path, bytes).unwrap();
        }
        let switched = prepare(&request(&b), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(switched.preserved_files.len(), 3);
        for saved in &switched.preserved_files {
            let expected = if saved.path.ends_with("plugins.txt") {
                b"*UserAdded.esp".as_slice()
            } else if saved.path.ends_with("loadorder.txt") {
                b"UserAdded.esp".as_slice()
            } else {
                b"ccUserAdded.esl".as_slice()
            };
            assert_eq!(fs::read(&saved.backup_path).unwrap(), expected);
        }
        assert!(!game.join("Data/ServerA.esm").exists());
        assert!(game.join("Data/ServerB.esm").exists());
        atomic_bytes(&profile.join("plugins.txt"), b"*AnotherUserChange.esp").unwrap();
        let again = prepare(&request(&a), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(again.preserved_files.len(), 1);
        assert_eq!(
            fs::read(&again.preserved_files[0].backup_path).unwrap(),
            b"*AnotherUserChange.esp"
        );
        assert!(switched
            .preserved_files
            .iter()
            .all(|saved| Path::new(&saved.backup_path).is_file()));
        restore_installation(&game, &profile).unwrap();
        assert_eq!(
            fs::read(profile.join("plugins.txt")).unwrap(),
            b"*MySinglePlayer.esp"
        );
        assert!(!profile.join("loadorder.txt").exists());
        assert_eq!(
            fs::read(game.join("Skyrim.ccc")).unwrap(),
            b"original Creation Club list"
        );
    }

    #[test]
    fn explicit_restore_preserves_external_lists_before_restoring_originals() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        atomic_bytes(&profile.join("plugins.txt"), b"*ChangedOutside.esp").unwrap();
        atomic_bytes(&profile.join("loadorder.txt"), b"ChangedOutside.esp").unwrap();
        let preserved = restore_installation(&game, &profile).unwrap();
        assert_eq!(preserved.len(), 2);
        assert_eq!(
            fs::read(
                &preserved
                    .iter()
                    .find(|p| p.path.ends_with("plugins.txt"))
                    .unwrap()
                    .backup_path
            )
            .unwrap(),
            b"*ChangedOutside.esp"
        );
        assert_eq!(
            fs::read(
                &preserved
                    .iter()
                    .find(|p| p.path.ends_with("loadorder.txt"))
                    .unwrap()
                    .backup_path
            )
            .unwrap(),
            b"ChangedOutside.esp"
        );
        assert_eq!(
            fs::read(profile.join("plugins.txt")).unwrap(),
            b"*MySinglePlayer.esp"
        );
        assert!(!profile.join("loadorder.txt").exists());
        assert!(read_journal(&game.join(".skymp-launcher"))
            .unwrap()
            .entries
            .is_empty());
        assert!(restore_installation(&game, &profile).unwrap().is_empty());
    }

    #[test]
    fn failed_download_does_not_replace_external_load_order() {
        let good = TestServer::new();
        good.configure("Good.esm", b"good script");
        let bad = TestServer::new();
        bad.configure("Bad.esm", b"bad script");
        let url = download_url(&Url::parse(&bad.url).unwrap(), "Bad.esm").unwrap();
        bad.routes
            .lock()
            .unwrap()
            .insert(url.path().into(), (200, b"tampered".to_vec()));
        let (_temp, game, profile, cache) = fixture();
        prepare(&request(&good), &game, &profile, &cache, |_| {}).unwrap();
        atomic_bytes(&profile.join("plugins.txt"), b"*UserOutside.esp").unwrap();
        let state = game.join(".skymp-launcher");
        let before = fs::read(state.join("active.json")).unwrap();
        assert!(prepare(&request(&bad), &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("verification failed"));
        assert_eq!(fs::read(state.join("active.json")).unwrap(), before);
        assert_eq!(
            fs::read(profile.join("plugins.txt")).unwrap(),
            b"*UserOutside.esp"
        );
        assert!(!state.join("external-changes").exists());
        assert!(game.join("Data/Good.esm").exists());
    }

    #[test]
    fn damaged_original_backup_still_blocks_changed_load_order_recovery() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        let state = game.join(".skymp-launcher");
        let before = fs::read(state.join("active.json")).unwrap();
        let journal = read_journal(&state).unwrap();
        let entry = journal
            .entries
            .iter()
            .find(|e| e.path == "plugins.txt")
            .unwrap();
        atomic_bytes(
            &state.join(entry.backup.as_ref().unwrap()),
            b"damaged original",
        )
        .unwrap();
        atomic_bytes(&profile.join("plugins.txt"), b"*ChangedOutside.esp").unwrap();
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("missing/damaged"));
        assert!(restore_installation(&game, &profile)
            .unwrap_err()
            .contains("missing/damaged"));
        assert_eq!(
            fs::read(profile.join("plugins.txt")).unwrap(),
            b"*ChangedOutside.esp"
        );
        assert_eq!(fs::read(state.join("active.json")).unwrap(), before);
        assert!(!state.join("external-changes").exists());
    }

    #[test]
    fn failed_external_snapshot_keeps_current_list_and_allows_recovery_retry() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        let state = game.join(".skymp-launcher");
        atomic_bytes(&state.join("external-changes"), b"folder blocked").unwrap();
        atomic_bytes(&profile.join("plugins.txt"), b"*ChangedOutside.esp").unwrap();
        assert!(restore_installation(&game, &profile).is_err());
        assert_eq!(
            fs::read(profile.join("plugins.txt")).unwrap(),
            b"*ChangedOutside.esp"
        );
        assert!(read_journal(&state)
            .unwrap()
            .entries
            .iter()
            .any(|e| e.path == "plugins.txt"));
        fs::remove_file(state.join("external-changes")).unwrap();
        let saved = restore_installation(&game, &profile).unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(
            fs::read(&saved[0].backup_path).unwrap(),
            b"*ChangedOutside.esp"
        );
        assert_eq!(
            fs::read(profile.join("plugins.txt")).unwrap(),
            b"*MySinglePlayer.esp"
        );
    }

    #[test]
    fn damaged_external_snapshot_is_not_overwritten_or_used_for_recovery() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        let changed = b"*ChangedOutside.esp";
        let hash = format!("{:x}", Sha256::digest(changed));
        let snapshot = game.join(format!(
            ".skymp-launcher/external-changes/profile/{hash}/plugins.txt"
        ));
        atomic_bytes(&snapshot, b"existing edited snapshot").unwrap();
        atomic_bytes(&profile.join("plugins.txt"), changed).unwrap();
        assert!(restore_installation(&game, &profile)
            .unwrap_err()
            .contains("Cannot verify"));
        assert_eq!(fs::read(profile.join("plugins.txt")).unwrap(), changed);
        assert_eq!(fs::read(&snapshot).unwrap(), b"existing edited snapshot");
    }

    fn modern_files() -> Vec<(&'static str, &'static str, &'static [u8])> {
        vec![
            ("Data/Community.esp", "mod", b"TES4-community"),
            ("Data/Community.bsa", "archive", b"community archive"),
            ("Data/Scripts/Shared.pex", "script", b"server script"),
            ("Data/textures/first/shared.dds", "asset", b"first texture"),
            (
                "Data/textures/second/shared.dds",
                "asset",
                b"second texture",
            ),
            ("Data/meshes/Community/Schwert.nif", "asset", b"mesh"),
            ("Data/SKSE/Plugins/Community.ini", "config", b"[community]"),
        ]
    }

    #[test]
    fn modern_paths_cache_updates_and_reversible_server_switch() {
        let server = TestServer::new();
        // A modern server's complete manifest takes precedence over legacy routes.
        server.configure("Ignored.esm", b"legacy");
        let files = modern_files();
        server.modern(&files);
        let (_temp, game, profile, cache) = fixture();
        atomic_bytes(
            &game.join("Data/textures/first/shared.dds"),
            b"single-player texture",
        )
        .unwrap();
        let first = prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(first.downloaded_files, files.len());
        assert_eq!(first.load_order, ["Skyrim.esm", "Community.esp"]);
        for (path, _, bytes) in &files {
            assert_eq!(fs::read(game.join(path)).unwrap(), *bytes);
        }
        let second = prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(second.downloaded_files, 0);
        assert_eq!(second.cached_files, files.len());
        assert_eq!(server.downloads.load(Ordering::Relaxed), files.len());
        let mut update = files.clone();
        update[4].2 = b"updated second texture";
        server.modern(&update);
        let changed = prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(changed.downloaded_files, 1);
        assert_eq!(changed.cached_files, files.len() - 1);
        assert_eq!(fs::read(game.join(update[4].0)).unwrap(), update[4].2);
        update.retain(|(path, _, _)| *path != "Data/textures/first/shared.dds");
        server.modern(&update);
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(
            fs::read(game.join("Data/textures/first/shared.dds")).unwrap(),
            b"single-player texture"
        );
        restore_installation(&game, &profile).unwrap();
        assert!(!game.join("Data/Community.esp").exists());
        assert!(!game.join("Data/textures/second/shared.dds").exists());
        assert_eq!(
            fs::read(game.join("Data/Scripts/Shared.pex")).unwrap(),
            b"original script"
        );
    }

    #[test]
    fn modern_load_order_survives_downloads_cache_updates_and_server_switches() {
        let server = TestServer::new();
        let files: Vec<(&str, &str, &[u8])> = vec![
            ("Data/Alpha.esp", "mod", b"alpha plugin"),
            ("Data/ZZWorld.esm", "mod", b"world master"),
            ("Data/ZZPatch.esp", "mod", b"patch plugin"),
            ("Data/Small.esl", "mod", b"light plugin"),
        ];
        let mut manifest = server.modern(&files);
        let initial = ["Skyrim.esm", "ZZWorld.esm", "Small.esl", "ZZPatch.esp", "Alpha.esp"];
        manifest["loadOrder"] = serde_json::json!(initial);
        server.json("/api/launcher/manifest", manifest.clone());
        let (_temp, game, profile, cache) = fixture();
        let original = fs::read(profile.join("plugins.txt")).unwrap();
        let active = |name: &str| {
            String::from_utf8(fs::read(profile.join(name)).unwrap())
                .unwrap()
                .lines()
                .filter(|line| !line.starts_with('#') && !line.is_empty())
                .map(|line| line.trim_start_matches('*').to_owned())
                .collect::<Vec<_>>()
        };
        let prepared = prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(prepared.downloaded_files, files.len());
        assert_eq!(prepared.load_order, initial);
        assert_eq!(active("plugins.txt"), initial);
        assert_eq!(active("loadorder.txt"), initial);
        assert!(!active("plugins.txt").iter().any(|name| name == "MySinglePlayer.esp"));

        // A manifest-only order change must apply even when every mod comes from cache.
        let changed = ["Skyrim.esm", "ZZWorld.esm", "Small.esl", "Alpha.esp", "ZZPatch.esp"];
        manifest["loadOrder"] = serde_json::json!(changed);
        server.json("/api/launcher/manifest", manifest);
        let prepared = prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(prepared.downloaded_files, 0);
        assert_eq!(prepared.cached_files, files.len());
        assert_eq!(prepared.load_order, changed);
        assert_eq!(active("plugins.txt"), changed);
        assert_eq!(active("loadorder.txt"), changed);

        let other = TestServer::new();
        other.configure("Other.esm", b"other server script");
        prepare(&request(&other), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(active("plugins.txt"), ["Skyrim.esm", "Other.esm"]);
        assert_eq!(active("loadorder.txt"), ["Skyrim.esm", "Other.esm"]);
        for (path, _, _) in files { assert!(!game.join(path).exists()); }
        restore_installation(&game, &profile).unwrap();
        assert_eq!(fs::read(profile.join("plugins.txt")).unwrap(), original);
        assert!(!profile.join("loadorder.txt").exists());
    }

    #[test]
    fn modern_rejects_paths_executable_files_and_external_download_urls_before_installation() {
        let server = TestServer::new();
        let original = server.modern(&modern_files());
        let (_temp, game, profile, cache) = fixture();
        for bad in [
            "../Community.esp",
            "Data/../Community.esp",
            "Data/Platform/Plugins/skymp5-client.js",
            "Data/SKSE/Plugins/Other.dll",
            "Data/NUL.dds",
            "Data/C:/bad.dds",
            "Data/Skyrim.esm",
        ] {
            let mut value = original.clone();
            value["resources"][0]["path"] = bad.into();
            value["resources"][0]["name"] = bad.rsplit('/').next().unwrap().into();
            server.json("/api/launcher/manifest", value);
            assert!(
                prepare(&request(&server), &game, &profile, &cache, |_| {}).is_err(),
                "{bad}"
            );
            assert!(!game.join("Data/Community.esp").exists());
        }
        for bad in [
            "https://other.example.org/a",
            "/api/launcher/files/abc",
            "api/launcher/files/../a",
            "api/launcher/files/abc?x=1",
        ] {
            let mut value = original.clone();
            value["resources"][0]["downloadPath"] = bad.into();
            server.json("/api/launcher/manifest", value);
            assert!(
                prepare(&request(&server), &game, &profile, &cache, |_| {}).is_err(),
                "{bad}"
            );
        }
        assert_eq!(server.downloads.load(Ordering::Relaxed), 0);
        assert_eq!(
            fs::read(profile.join("plugins.txt")).unwrap(),
            b"*MySinglePlayer.esp"
        );
    }

    #[test]
    fn modern_rejects_duplicate_destinations_sizes_and_missing_game_checksums() {
        let server = TestServer::new();
        let original = server.modern(&modern_files());
        let (_temp, game, profile, cache) = fixture();
        let mut duplicate = original.clone();
        let mut alias = duplicate["resources"][3].clone();
        alias["path"] = "Data/Textures/FIRST/shared.dds".into();
        duplicate["resources"].as_array_mut().unwrap().push(alias);
        server.json("/api/launcher/manifest", duplicate);
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("Ambiguous"));
        let mut wrong_size = original.clone();
        wrong_size["totalSize"] = 9999.into();
        server.json("/api/launcher/manifest", wrong_size);
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("totalSize"));
        let mut huge = original.clone();
        huge["resources"][0]["size"] = (FILE_LIMIT + 1).into();
        server.json("/api/launcher/manifest", huge);
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("size limits"));
        let mut missing = original.clone();
        missing["requiredLocalFiles"] = serde_json::json!([]);
        server.json("/api/launcher/manifest", missing);
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {}).is_err());
        assert_eq!(server.downloads.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn modern_server_error_does_not_fall_back_to_an_incomplete_legacy_manifest() {
        let server = TestServer::new();
        server.configure("Legacy.esm", b"script");
        server.routes.lock().unwrap().insert(
            "/api/launcher/manifest".into(),
            (503, b"publication incomplete".to_vec()),
        );
        let (_temp, game, profile, cache) = fixture();
        let result = prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap_err();
        assert!(result.contains("503"));
        assert_eq!(server.downloads.load(Ordering::Relaxed), 0);
        assert!(!game.join("Data/Legacy.esm").exists());
    }

    #[test]
    fn modern_bad_download_retains_the_active_installation() {
        let server = TestServer::new();
        let files = modern_files();
        server.modern(&files);
        let (_temp, game, profile, cache) = fixture();
        prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        let settings = fs::read(game.join(SETTINGS)).unwrap();
        let mut update = files.clone();
        update[4].2 = b"changed texture";
        let manifest = server.modern(&update);
        let route = manifest["resources"][4]["downloadPath"].as_str().unwrap();
        server
            .routes
            .lock()
            .unwrap()
            .insert(format!("/{route}"), (200, b"tampered bytes".to_vec()));
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {}).is_err());
        assert_eq!(fs::read(game.join(SETTINGS)).unwrap(), settings);
        assert_eq!(fs::read(game.join(files[4].0)).unwrap(), files[4].2);
    }

    #[test]
    fn modern_discovers_the_servers_runtime_package_and_preserves_manual_overrides() {
        let server = TestServer::new();
        let mut manifest = server.modern(&modern_files());
        let bytes = b"server selected runtime";
        let files: Vec<_> = RUNTIME_REQUIRED.iter().map(|path| {
            server.routes.lock().unwrap().insert(format!("/client-runtime/{path}"), (200, bytes.to_vec()));
            serde_json::json!({ "path": path, "size": bytes.len(), "sha256": format!("{:x}", Sha256::digest(bytes)) })
        }).collect();
        server.json(
            "/client-runtime/runtime-manifest.json",
            serde_json::json!({ "version": 1, "files": files }),
        );
        manifest["runtimeSource"] =
            format!("{}client-runtime/runtime-manifest.json", server.url).into();
        server.json("/api/launcher/manifest", manifest);
        let (_temp, game, profile, cache) = fixture();
        let mut req = request(&server);
        prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(fs::read(game.join(RUNTIME_REQUIRED[0])).unwrap(), bytes);
        let own_runtime = tempfile::tempdir().unwrap();
        for required in RUNTIME_REQUIRED {
            atomic_bytes(&own_runtime.path().join(required), b"manual runtime").unwrap();
        }
        req.runtime_source = Some(own_runtime.path().to_string_lossy().into());
        prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(
            fs::read(game.join(RUNTIME_REQUIRED[0])).unwrap(),
            b"manual runtime"
        );
    }

    #[test]
    fn partial_activation_rolls_back() {
        let (_temp, game, profile, cache) = fixture();
        fs::create_dir_all(&cache).unwrap();
        let state = game.join(".skymp-launcher");
        fs::create_dir_all(&state).unwrap();
        let first = stage_bytes(&cache, Root::Game, "Data/Scripts/Shared.pex", b"new").unwrap();
        let missing = StagedFile {
            root: Root::Game,
            path: "Data/Missing.esm".into(),
            source: cache.join("missing"),
            hash: "no".into(),
        };
        assert!(activate(&[first, missing], &state, &game, &profile).is_err());
        assert_eq!(
            fs::read(game.join("Data/Scripts/Shared.pex")).unwrap(),
            b"original script"
        );
        assert!(!game.join("Data/Missing.esm").exists());
        assert!(read_journal(&state).unwrap().entries.is_empty());
    }

    #[test]
    fn online_auth_does_not_inherit_offline_identity_or_old_keys() {
        let server = TestServer::new();
        let mut req = request(&server);
        req.offline = false;
        req.master_url = Some("https://auth.example.org/".into());
        let bytes = client_settings(Some(br#"{"gameData":{"profileId":1},"server-public-keys":{"old":"key"},"master-key":"old","volume":0.5}"#), &req, "other.example.org").unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!(value.get("gameData").is_none());
        assert!(value.get("server-public-keys").is_none());
        assert!(value.get("master-key").is_none());
        assert_eq!(value["volume"], 0.5);
        assert_eq!(value["server-ip"], "other.example.org");
        assert_eq!(value["master"], "https://auth.example.org");
    }

    #[test]
    fn rejects_unsafe_paths_and_protocols() {
        for path in [
            "../bad",
            "C:/bad",
            "//server/file",
            "Data/a:stream",
            "Data/NUL.txt",
            "Data/COM1",
            "Data/../bad",
            "Data\\bad",
            "Data/x.",
            "Data/x ",
        ] {
            assert!(safe_path(path).is_err(), "{path}");
        }
        for url in [
            "file:///C:/data",
            "ftp://host/path",
            "https://user:password@example.org",
            "https://example.org/?token=x",
        ] {
            assert!(http_url(url).is_err());
        }
        assert!(validate_host("::1", 7777).is_ok());
        assert!(validate_host("host/path", 7777).is_err());
        assert!(validate_runtime_path(SETTINGS).is_err());
        assert!(validate_runtime_path("Data/Skyrim.esm").is_err());
        assert!(validate_runtime_path("SkyrimSE.exe").is_err());
        assert!(validate_runtime_path("Data/Platform/Plugins/auth-data-no-load.js").is_err());
    }

    #[test]
    fn missing_hash_and_unknown_manifest_are_rejected() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        server.json(
            "/api/resources/manifest",
            serde_json::json!({ "version": "2", "resources": [] }),
        );
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {})
            .unwrap_err()
            .contains("Unsupported"));
        server.json("/api/resources/manifest", serde_json::json!({ "version": "1", "resources": [{ "name": "Test.esm", "kind": "mod", "hash": "", "size": 12 }] }));
        assert!(prepare(&request(&server), &game, &profile, &cache, |_| {}).is_err());
        assert_eq!(
            fs::read(profile.join("plugins.txt")).unwrap(),
            b"*MySinglePlayer.esp"
        );
    }

    #[test]
    fn legacy_server_without_resource_api_uses_verified_local_mods() {
        let server = TestServer::new();
        server.configure("Legacy.esm", b"script");
        server
            .routes
            .lock()
            .unwrap()
            .remove("/api/resources/manifest");
        let (_temp, game, profile, cache) = fixture();
        atomic_bytes(&game.join("Data/Legacy.esm"), b"Legacy.esm content").unwrap();
        let prepared = prepare(&request(&server), &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(prepared.downloaded_files, 0);
        assert_eq!(prepared.load_order, ["Skyrim.esm", "Legacy.esm"]);
        assert_eq!(server.downloads.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn import_build_only_returns_public_connection_fields() {
        let temp = tempfile::tempdir().unwrap();
        atomic_bytes(&temp.path().join("dist/server/server-settings.json"), br#"{"name":"Test","port":27777,"uiPort":28080,"offlineMode":true,"master":"https://auth.example.org","masterKey":"public-routing-key","adminUiUsers":[{"password":"secret"}],"discordBot":{"token":"secret"}}"#).unwrap();
        atomic_bytes(
            &temp
                .path()
                .join("dist/client/Data/Platform/Plugins/skymp5-client.js"),
            b"client",
        )
        .unwrap();
        let profile = import_build(temp.path().to_str().unwrap(), "::1").unwrap();
        assert_eq!(profile.port, 27777);
        assert!(profile.offline);
        assert_eq!(profile.resource_url, "http://[::1]:28080");
        let json = serde_json::to_string(&profile).unwrap();
        assert!(!json.contains("secret"));
        assert!(profile.runtime_source.is_some());
    }

    #[test]
    fn import_prefers_public_server_id_over_private_heartbeat_key() {
        let temp = tempfile::tempdir().unwrap();
        atomic_bytes(&temp.path().join("server-settings.json"), br#"{"name":"Online","port":7777,"uiPort":8080,"offlineMode":false,"master":"https://api.example.org","serverUid":"public-server-id","masterKey":"private-server-credential"}"#).unwrap();
        let profile = import_build(temp.path().to_str().unwrap(), "127.0.0.1").unwrap();
        assert_eq!(
            profile.server_master_key.as_deref(),
            Some("public-server-id")
        );
        assert!(!serde_json::to_string(&profile)
            .unwrap()
            .contains("private-server-credential"));
        assert!(!profile.offline);
    }

    #[test]
    fn catalog_installs_a_complete_matching_skse_and_rejects_bad_releases_before_activation() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        atomic_bytes(
            &game.join("SkyrimSE.exe"),
            &runtime_version::tests::executable([1, 7, 104, 0], true),
        )
        .unwrap();
        let original_loader = runtime_version::tests::executable([0, 2, 2, 6], true);
        atomic_bytes(&game.join("skse64_loader.exe"), &original_loader).unwrap();
        let publish = |binary_version, format: u32| {
            let mut payloads = RUNTIME_REQUIRED
                .iter()
                .map(|path| (path.to_string(), b"matching client".to_vec()))
                .collect::<Vec<_>>();
            payloads.extend([
                (
                    "skse64_loader.exe".into(),
                    runtime_version::tests::executable(binary_version, true),
                ),
                (
                    "skse64_1_7_104.dll".into(),
                    runtime_version::tests::executable(binary_version, true),
                ),
                (
                    "Data/SKSE/Plugins/versionlib-1-7-104-0.bin".into(),
                    format.to_le_bytes().to_vec(),
                ),
            ]);
            let files = payloads.iter().map(|(path, bytes)| {
                server.routes.lock().unwrap().insert(format!("/runtime/release/{path}"), (200, bytes.clone()));
                serde_json::json!({"path":path,"size":bytes.len(),"sha256":format!("{:x}",Sha256::digest(bytes))})
            }).collect::<Vec<_>>();
            let manifest = serde_json::to_vec(&serde_json::json!({"version":1,"gameVersion":"1.7.104.0","skseVersion":"2.3.1","files":files})).unwrap();
            let hash = format!("{:x}", Sha256::digest(&manifest));
            server.routes.lock().unwrap().insert(
                "/runtime/release/runtime-manifest.json".into(),
                (200, manifest),
            );
            server.json("/runtime/catalog.json", serde_json::json!({"version":2,"packages":[{"gameVersion":"1.7.104.0","manifest":"release/runtime-manifest.json","sha256":hash}]}));
        };
        publish([0, 2, 3, 1], 5);
        let mut req = request(&server);
        req.runtime_source = Some(format!("{}runtime/catalog.json", server.url));
        prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(
            runtime_version::read(&game.join("skse64_loader.exe")).unwrap(),
            [0, 2, 3, 1]
        );
        assert!(game.join("skse64_1_7_104.dll").is_file());
        let active_settings = fs::read(game.join(SETTINGS)).unwrap();
        for (binary, format, expected) in [
            ([0, 2, 3, 0], 5, "SKSE version"),
            ([0, 2, 3, 1], 2, "Address Library format"),
        ] {
            publish(binary, format);
            let failure = prepare(&req, &game, &profile, &cache, |_| {}).unwrap_err();
            assert!(failure.contains(expected), "{failure}");
            assert_eq!(fs::read(game.join(SETTINGS)).unwrap(), active_settings);
            assert_eq!(
                runtime_version::read(&game.join("skse64_loader.exe")).unwrap(),
                [0, 2, 3, 1]
            );
        }
        restore_installation(&game, &profile).unwrap();
        assert_eq!(
            fs::read(game.join("skse64_loader.exe")).unwrap(),
            original_loader
        );
        assert!(!game.join("skse64_1_7_104.dll").exists());
        assert!(!game
            .join("Data/SKSE/Plugins/versionlib-1-7-104-0.bin")
            .exists());
        assert_eq!(
            runtime_version::read(&game.join("SkyrimSE.exe")).unwrap(),
            [1, 7, 104, 0]
        );
    }

    #[test]
    fn runtime_catalog_selects_the_installed_game_and_refreshes_without_a_launcher_update() {
        let server = TestServer::new();
        let version = [1, 7, 104, 0];
        let publish = |release: &str| {
            let mut paths = RUNTIME_REQUIRED
                .iter()
                .map(|p| p.to_string())
                .collect::<Vec<_>>();
            paths.extend([
                "skse64_loader.exe".into(),
                "skse64_1_7_104.dll".into(),
                "Data/SKSE/Plugins/versionlib-1-7-104-0.bin".into(),
            ]);
            let files = paths.iter().map(|path| serde_json::json!({"path":path,"size":release.len(),"sha256":format!("{:x}",Sha256::digest(release.as_bytes()))})).collect::<Vec<_>>();
            let package = serde_json::json!({"version":1,"gameVersion":"1.7.104.0","skseVersion":"2.3.1","files":files});
            let bytes = serde_json::to_vec(&package).unwrap();
            server.routes.lock().unwrap().insert(
                "/runtime/1.7.104.0/runtime-manifest.json".into(),
                (200, bytes.clone()),
            );
            server.json("/runtime/catalog.json", serde_json::json!({"version":2,"packages":[
                {"gameVersion":"1.6.1170.0","manifest":"1.6.1170.0/runtime-manifest.json","sha256":"0".repeat(64)},
                {"gameVersion":"1.7.104.0","manifest":"1.7.104.0/runtime-manifest.json","sha256":format!("{:x}",Sha256::digest(&bytes))},
                {"gameVersion":"1.7.999.0","manifest":"future/runtime-manifest.json","sha256":"0".repeat(64)}
            ]}));
        };
        let url = Url::parse(&format!("{}runtime/catalog.json", server.url)).unwrap();
        publish("first release");
        let (selected_url, first) =
            resolve_runtime_manifest(&client().unwrap(), url.clone(), &|| Ok(version)).unwrap();
        assert!(selected_url
            .path()
            .ends_with("/1.7.104.0/runtime-manifest.json"));
        assert_eq!(first.game_version.as_deref(), Some("1.7.104.0"));
        publish("updated release");
        let (_, updated) =
            resolve_runtime_manifest(&client().unwrap(), url.clone(), &|| Ok(version)).unwrap();
        assert_ne!(first.files[0].sha256, updated.files[0].sha256);
        let failure =
            resolve_runtime_manifest(&client().unwrap(), url, &|| Ok([1, 6, 640, 0])).unwrap_err();
        assert!(failure.contains("No compatible client package for Skyrim 1.6.640.0"));
    }

    #[test]
    fn runtime_catalog_rejects_ambiguous_paths_changed_manifests_and_wrong_game_versions() {
        let server = TestServer::new();
        let url = Url::parse(&format!("{}runtime/catalog.json", server.url)).unwrap();
        let package = serde_json::json!({"gameVersion":"1.7.104.0","manifest":"release/runtime-manifest.json","sha256":"0".repeat(64)});
        for path in [
            "../outside.json",
            "https://other.invalid/manifest.json",
            "/absolute.json",
            "unsafe\\file.json",
        ] {
            let mut invalid = package.clone();
            invalid["manifest"] = path.into();
            server.json(
                "/runtime/catalog.json",
                serde_json::json!({"version":2,"packages":[invalid]}),
            );
            assert!(
                resolve_runtime_manifest(&client().unwrap(), url.clone(), &|| Ok([1, 7, 104, 0]))
                    .is_err()
            );
        }
        server.json(
            "/runtime/catalog.json",
            serde_json::json!({"version":2,"packages":[package.clone(),package.clone()]}),
        );
        assert!(
            resolve_runtime_manifest(&client().unwrap(), url.clone(), &|| Ok([1, 7, 104, 0]))
                .unwrap_err()
                .contains("Duplicate runtime catalog version")
        );
        server.json(
            "/runtime/release/runtime-manifest.json",
            serde_json::json!({"version":1,"gameVersion":"1.6.1170.0","files":[]}),
        );
        server.json(
            "/runtime/catalog.json",
            serde_json::json!({"version":2,"packages":[package]}),
        );
        assert!(
            resolve_runtime_manifest(&client().unwrap(), url, &|| Ok([1, 7, 104, 0]))
                .unwrap_err()
                .contains("SHA-256")
        );
        let invalid: RuntimeManifest = serde_json::from_value(serde_json::json!({"version":1,"gameVersion":"1.6.1170.0","files":[{"path":RUNTIME_REQUIRED[0],"size":1,"sha256":"0".repeat(64)}]})).unwrap();
        assert!(validate_runtime_manifest(&invalid, &|| Ok([1, 7, 104, 0]))
            .unwrap_err()
            .contains("requires Skyrim 1.6.1170.0"));
    }

    #[test]
    fn a_bad_versioned_runtime_does_not_modify_the_active_installation() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        let mut req = request(&server);
        prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        let active = fs::read(game.join(SETTINGS)).unwrap();
        server.json("/runtime/catalog.json", serde_json::json!({"version":2,"packages":[{"gameVersion":"1.7.104.0","manifest":"release/runtime-manifest.json","sha256":"0".repeat(64)}]}));
        req.runtime_source = Some(format!("{}runtime/catalog.json", server.url));
        assert!(prepare(&req, &game, &profile, &cache, |_| {}).is_err());
        assert_eq!(fs::read(game.join(SETTINGS)).unwrap(), active);
        assert_eq!(
            fs::read(game.join("Data/Scripts/Shared.pex")).unwrap(),
            b"script"
        );
        restore_installation(&game, &profile).unwrap();
        assert_eq!(
            fs::read(game.join("Data/Scripts/Shared.pex")).unwrap(),
            b"original script"
        );
    }

    #[test]
    fn local_and_remote_runtime_packages_are_installed_and_restored() {
        let server = TestServer::new();
        server.configure("Test.esm", b"script");
        let (_temp, game, profile, cache) = fixture();
        let runtime = tempfile::tempdir().unwrap();
        for required in RUNTIME_REQUIRED {
            atomic_bytes(&runtime.path().join(required), b"fork runtime").unwrap();
        }
        atomic_bytes(
            &runtime.path().join(SETTINGS),
            br#"{"gameData":{"profileId":99}}"#,
        )
        .unwrap();
        let mut req = request(&server);
        req.runtime_source = Some(runtime.path().to_str().unwrap().into());
        prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(
            fs::read(game.join(RUNTIME_REQUIRED[0])).unwrap(),
            b"fork runtime"
        );
        // Remote files have paths relative to the runtime manifest, without arbitrary URLs.
        let bytes = b"remote runtime";
        let files: Vec<_> = RUNTIME_REQUIRED.iter().map(|path| {
            server.routes.lock().unwrap().insert(format!("/runtime/{path}"), (200, bytes.to_vec()));
            serde_json::json!({ "path": path, "size": bytes.len(), "sha256": format!("{:x}", Sha256::digest(bytes)) })
        }).collect();
        server.json(
            "/runtime/runtime-manifest.json",
            serde_json::json!({ "version": 1, "files": files }),
        );
        req.runtime_source = Some(format!("{}runtime/runtime-manifest.json", server.url));
        prepare(&req, &game, &profile, &cache, |_| {}).unwrap();
        assert_eq!(fs::read(game.join(RUNTIME_REQUIRED[0])).unwrap(), bytes);
        restore_installation(&game, &profile).unwrap();
        assert_eq!(
            fs::read(game.join(RUNTIME_REQUIRED[0])).unwrap(),
            b"installed runtime"
        );
    }
}
