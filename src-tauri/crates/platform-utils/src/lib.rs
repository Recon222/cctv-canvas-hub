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

/// Tail the newest `max_lines` lines out of a raw byte window (Phase 6.3B′).
///
/// The caller (`read_log_tail`, app crate) seeks at most 64 KB back from the
/// end of the log and hands the bytes here; the pure slicing lives in this
/// Tauri-free crate so it is unit-testable on Windows at all (the app crate's
/// harness is disabled — see the crate doc above).
///
/// - `from_utf8_lossy`: a seek-from-end read can land mid-codepoint, and the
///   log is not ASCII-only (`TargetKind::Webview` routes frontend fr/ar
///   strings into the same file) — never an error, at worst a replacement
///   char confined to the first (dropped) line.
/// - `partial_first_line`: pass `true` ONLY when the read actually seeked —
///   the bytes alone cannot say whether byte 0 is a real line start; the
///   caller holds that fact. When `true` the first line is dropped as a
///   presumed fragment; when `false` (whole file) every line is kept.
pub fn tail_log(bytes: &[u8], max_lines: usize, partial_first_line: bool) -> String {
    let text = String::from_utf8_lossy(bytes);
    let mut lines: Vec<&str> = text.lines().collect();
    if partial_first_line && !lines.is_empty() {
        lines.remove(0);
    }
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
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

    // Test #127 (6.3B′): a seek-from-end window that lands mid-codepoint
    // never errors — the lossy decode confines any replacement char to
    // the first line, and the flagged drop removes that fragment.
    // (Mutation-verified: deleting the partial_first_line drop fails
    // this arm.)
    #[test]
    fn tail_log_survives_a_mid_codepoint_slice_boundary() {
        let full = "première ligne — état: établi\nثانية: مقفلة\nthird line ok\n";
        let bytes = full.as_bytes();
        // Slice INSIDE the first line's multi-byte 'è' (é = 2 bytes;
        // find a boundary that is provably mid-codepoint).
        let mut cut = 4;
        while full.is_char_boundary(cut) {
            cut += 1;
        }
        let window = &bytes[cut..];
        let tail = tail_log(window, 10, true);
        // Only clean lines: the partial first line (with any replacement
        // char) is gone, the complete lines survive byte-exact.
        assert_eq!(tail, "ثانية: مقفلة\nthird line ok");
        assert!(!tail.contains('\u{FFFD}'));
    }

    // Test #128 (6.3B′): input above the clamp returns exactly the
    // newest `max_lines` lines.
    #[test]
    fn tail_log_clamps_to_the_last_max_lines() {
        let input = (1..=10)
            .map(|n| format!("line {n}"))
            .collect::<Vec<_>>()
            .join("\n");
        let tail = tail_log(input.as_bytes(), 3, false);
        assert_eq!(tail, "line 8\nline 9\nline 10");
    }

    // Test #129 (6.3B′): input shorter than the window with
    // `partial_first_line: false` keeps every line, first included —
    // the caller passes `false` because it never seeked; the flag is
    // the caller's knowledge, not inferable from bytes (fix-delta 2).
    #[test]
    fn tail_log_returns_whole_input_when_shorter_than_window() {
        let input = "boot line\nsecond line\n";
        let tail = tail_log(input.as_bytes(), 500, false);
        assert_eq!(tail, "boot line\nsecond line");
    }
}
