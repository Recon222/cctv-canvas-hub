//! Cross-platform path/OS helpers for Tauri apps built on this template.
//!
//! This is a **pure Rust crate with no Tauri dependency**, which is the whole
//! point: its logic is unit-testable with `cargo test` on Windows. A test
//! harness that links `tauri`/WebView2 aborts at *load* with
//! `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139) before any test runs, so pure
//! logic that needs tests belongs in Tauri-free workspace crates like this one.
//! This crate is the template's worked example of that pattern — copy it for
//! real domain logic. See `docs/developer/testing.md`.
//!
//! # Examples
//!
//! ```
//! use std::path::Path;
//! use platform_utils::normalize_path_for_serialization;
//!
//! let normalized = normalize_path_for_serialization(Path::new("some/path/file.txt"));
//! assert_eq!(normalized, "some/path/file.txt");
//! ```

// These helpers are provided for apps built on the template; the template
// itself does not call all of them.
#![allow(dead_code)]

use std::path::Path;

/// Normalizes a path to use forward slashes for consistent frontend handling.
///
/// Windows paths like `C:\Users\foo\bar.txt` become `C:/Users/foo/bar.txt`.
/// This is useful when sending paths to the React frontend, which expects
/// forward slashes regardless of the platform. On macOS and Linux paths already
/// use forward slashes, so this is essentially a no-op but ensures consistency.
pub fn normalize_path_for_serialization(path: &Path) -> String {
    path.display().to_string().replace('\\', "/")
}

/// Returns true if running on macOS.
///
/// Use this for runtime checks. For compile-time checks, use `#[cfg(target_os = "macos")]`.
#[inline]
pub const fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

/// Returns true if running on Windows.
///
/// Use this for runtime checks. For compile-time checks, use `#[cfg(target_os = "windows")]`.
#[inline]
pub const fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

/// Returns true if running on Linux.
///
/// Use this for runtime checks. For compile-time checks, use `#[cfg(target_os = "linux")]`.
#[inline]
pub const fn is_linux() -> bool {
    cfg!(target_os = "linux")
}

/// Returns the current platform as a string ("macos", "windows", or "linux").
///
/// Useful when you need to pass platform info to the frontend without the OS plugin.
pub const fn current_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_normalize_path_forward_slashes() {
        let path = PathBuf::from("foo/bar/baz.txt");
        assert_eq!(normalize_path_for_serialization(&path), "foo/bar/baz.txt");
    }

    #[test]
    fn test_normalize_path_converts_backslashes() {
        // Exercises the core replacement on every OS: literal backslashes in the
        // string become forward slashes (on Unix `\` is a normal path char, on
        // Windows it is a separator — either way the output is forward slashes).
        let normalized = normalize_path_for_serialization(Path::new("a\\b\\c.txt"));
        assert_eq!(normalized, "a/b/c.txt");
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
}
