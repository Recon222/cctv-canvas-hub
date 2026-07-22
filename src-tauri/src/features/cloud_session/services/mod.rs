//! Config + vault persistence for the cloud session.
//!
//! SECURITY (T3): vault code paths never log or debug-format values,
//! arguments, or results — the decrypted session JSON carries the refresh
//! token. Do not add logging here (the preferences `{preferences:?}` idiom
//! must not be copied — it would bypass the vault via the on-disk log).

use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Manager};

use super::types::{CloudConfig, VaultStatus};

const CONFIG_FILE: &str = "cloud-config.json";
const VAULT_FILE: &str = "session.vault";
/// Keychain coordinates for the vault key (doc 01 §5.3).
const KEYRING_SERVICE: &str = "com.tauri-app.app";
const KEYRING_ENTRY: &str = "session-vault-key";

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create app data directory: {e}"))?;
    Ok(dir)
}

/// Monotonic discriminator: overlapping writes must never share a temp
/// file (an auth refresh can race a sign-in write once M6 wires re-auth).
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Atomic write (temp file + rename) — a crash mid-write degrades to a
/// missing/corrupt file that parses as absent, never a half-file. The
/// temp name is unique per write (pid + counter) so concurrent writers
/// cannot interleave into one temp file; the rename stays atomic.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_default();
    let pid = std::process::id();
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temp = path.with_file_name(format!("{file_name}.{pid}.{counter}.tmp"));
    std::fs::write(&temp, bytes).map_err(|e| format!("Failed to write file: {e}"))?;
    if let Err(rename_err) = std::fs::rename(&temp, path) {
        // Clean up the temp file to avoid leaving orphans on disk.
        let _ = std::fs::remove_file(&temp);
        return Err(format!("Failed to finalize file: {rename_err}"));
    }
    Ok(())
}

// ---- Cloud config (plain JSON — designed-public values, T4) ----

pub fn load_config(app: &AppHandle) -> Result<Option<CloudConfig>, String> {
    let path = app_data_dir(app)?.join(CONFIG_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read cloud config: {e}"))?;
    let config: CloudConfig = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse cloud config: {e}"))?;
    Ok(Some(config))
}

pub fn save_config(app: &AppHandle, config: &CloudConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize cloud config: {e}"))?;
    atomic_write(&app_data_dir(app)?.join(CONFIG_FILE), json.as_bytes())
}

pub fn clear_config(app: &AppHandle) -> Result<(), String> {
    remove_if_exists(&app_data_dir(app)?.join(CONFIG_FILE), "cloud config")
}

// ---- Session vault (AES-256-GCM; key in OS keychain — AD5, G5) ----

/// Read the vault key from the OS keychain, creating it on first use.
///
/// ONLY `keyring::Error::NoEntry` takes the create path. Any other keyring
/// error fails closed and propagates: a transient keychain failure must
/// never be treated as absence — regenerating over the stored key would
/// make every later `open` fail `AuthFailed` and silently force re-sign-in
/// on each relaunch (Flow B).
fn get_or_create_key() -> Result<[u8; 32], String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ENTRY)
        .map_err(|e| format!("Failed to access keychain: {e}"))?;
    match entry.get_secret() {
        // map_err discards the Vec — key material must never reach an error string.
        Ok(bytes) => bytes
            .try_into()
            .map_err(|_| "Keychain vault key has unexpected length".to_string()),
        Err(keyring::Error::NoEntry) => {
            let key = secure_vault::generate_key();
            entry
                .set_secret(&key)
                .map_err(|e| format!("Failed to store vault key in keychain: {e}"))?;
            Ok(key)
        }
        Err(e) => Err(format!("Failed to read vault key from keychain: {e}")),
    }
}

pub fn vault_get(app: &AppHandle) -> Result<Option<String>, String> {
    let path = app_data_dir(app)?.join(VAULT_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let sealed = std::fs::read(&path).map_err(|e| format!("Failed to read session vault: {e}"))?;
    let key = get_or_create_key()?;
    let plaintext = secure_vault::open(&key, &sealed)
        .map_err(|e| format!("Failed to open session vault: {e}"))?;
    // map_err discards the FromUtf8Error — it carries the decrypted bytes.
    String::from_utf8(plaintext)
        .map(Some)
        .map_err(|_| "Session vault content is not valid UTF-8".to_string())
}

pub fn vault_set(app: &AppHandle, value: &str) -> Result<(), String> {
    let key = get_or_create_key()?;
    let sealed = secure_vault::seal(&key, value.as_bytes())
        .map_err(|e| format!("Failed to seal session vault: {e}"))?;
    atomic_write(&app_data_dir(app)?.join(VAULT_FILE), &sealed)
}

pub fn vault_clear(app: &AppHandle) -> Result<(), String> {
    remove_if_exists(&app_data_dir(app)?.join(VAULT_FILE), "session vault")
}

fn remove_if_exists(path: &Path, what: &str) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Failed to clear {what}: {e}")),
    }
}

// ---- SYSTEM-lane diagnostics (6.3B — log tail + vault status) ----

/// Hard clamp on requested tail lines.
const LOG_TAIL_MAX_LINES: u32 = 500;
/// Read at most this much from the end of the log per tail request.
const LOG_TAIL_WINDOW_BYTES: u64 = 64 * 1024;

/// Read the newest `lines` lines of the app log (6.3B).
///
/// The filename derives from `app.package_info().name` — never a
/// literal: tauri-plugin-log's `LogDir { file_name: None }` writes
/// `{name}.log`, and a `productName` rename must not silently strand
/// the SYSTEM lane on a permanently empty file. This function does the
/// bounded I/O only; the pure slicing is `platform_utils::tail_log`
/// (6.3B′ — the Tauri-free crate is where it is unit-testable on
/// Windows). Error strings name the operation, not the full path
/// (defensive redaction).
pub fn read_log_tail(app: &AppHandle, lines: u32) -> Result<String, String> {
    let lines = lines.min(LOG_TAIL_MAX_LINES) as usize;
    let name = &app.package_info().name;
    let path = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to resolve the log directory: {e}"))?
        .join(format!("{name}.log"));
    let mut file =
        std::fs::File::open(&path).map_err(|e| format!("Failed to open the app log: {e}"))?;
    let len = file
        .metadata()
        .map_err(|e| format!("Failed to stat the app log: {e}"))?
        .len();
    // `partial_first_line` is the caller's knowledge (6.3B′): true only
    // when this read actually seeked past the start of the file.
    let seeked = len > LOG_TAIL_WINDOW_BYTES;
    if seeked {
        file.seek(SeekFrom::End(-(LOG_TAIL_WINDOW_BYTES as i64)))
            .map_err(|e| format!("Failed to seek the app log: {e}"))?;
    }
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|e| format!("Failed to read the app log: {e}"))?;
    Ok(platform_utils::tail_log(&bytes, lines, seeked))
}

/// Presence status for the SYSTEM lane (6.3B). Never decrypts — status
/// must never touch plaintext (`vault_get` is the wrong tool here).
///
/// A locked or unreachable keychain is an **error**, never "absent":
/// an `Ok` of all-false would read as "no key present" and send an
/// operator to re-enroll a healthy install.
pub fn vault_status(app: &AppHandle) -> Result<VaultStatus, String> {
    let dir = app_data_dir(app)?;
    let config_present = dir.join(CONFIG_FILE).exists();
    let vault_path = dir.join(VAULT_FILE);
    let vault_present = vault_path.exists();
    let vault_mtime_ms = if vault_present {
        std::fs::metadata(&vault_path)
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|elapsed| elapsed.as_millis() as f64)
    } else {
        None
    };
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ENTRY)
        .map_err(|e| format!("Failed to access keychain: {e}"))?;
    let keyring_key_present = match entry.get_secret() {
        // Bytes dropped immediately — presence only, never key material.
        Ok(_) => true,
        Err(keyring::Error::NoEntry) => false,
        Err(e) => return Err(format!("Keychain unavailable: {e}")),
    };
    Ok(VaultStatus {
        config_present,
        vault_present,
        keyring_key_present,
        vault_mtime_ms,
    })
}
