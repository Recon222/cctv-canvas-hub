//! Standalone tests for the pure functions in `src/utils/platform.rs`.
//!
//! The functions below are DUPLICATED from `src/utils/platform.rs` on purpose:
//! this integration binary must NOT link the `tauri_app_lib` crate. On Windows a
//! test harness that links tauri loads from `target/debug/deps/` without the
//! staged WebView2 loader DLL and aborts at startup with
//! STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) — see AGENTS.md "Testing Pure Rust
//! Logic". Keeping tauri-free copies here (picked up by `cargo test`, which
//! skips the lib harness via `[lib] test = false` in Cargo.toml) sidesteps
//! that. Keep them in sync with the canonical implementations — there is no
//! automated enforcement.

use std::path::{Path, PathBuf};

fn normalize_path_for_serialization(path: &Path) -> String {
    path.display().to_string().replace('\\', "/")
}

const fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

const fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

const fn is_linux() -> bool {
    cfg!(target_os = "linux")
}

const fn current_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

#[test]
fn test_normalize_path_forward_slashes() {
    let path = PathBuf::from("foo/bar/baz.txt");
    assert_eq!(normalize_path_for_serialization(&path), "foo/bar/baz.txt");
}

#[test]
fn test_normalize_path_empty() {
    let path = PathBuf::from("");
    assert_eq!(normalize_path_for_serialization(&path), "");
}

#[test]
fn test_current_platform_is_valid() {
    let platform = current_platform();
    assert!(
        platform == "macos" || platform == "windows" || platform == "linux",
        "Platform should be one of: macos, windows, linux"
    );
}

#[test]
fn test_platform_detection_consistency() {
    // Exactly one of these should be true.
    let platforms = [is_macos(), is_windows(), is_linux()];
    let count = platforms.iter().filter(|&&x| x).count();
    assert_eq!(count, 1, "Exactly one platform should be detected");
}
