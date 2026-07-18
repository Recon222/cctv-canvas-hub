//! Cross-platform utilities, re-exported from the `platform-utils` workspace crate.
//!
//! The implementation and its unit tests live in `crates/platform-utils/` — a
//! pure, Tauri-free crate, so the logic is testable with `cargo test` on Windows
//! without the WebView2 lib-harness crash. This module keeps the
//! `crate::utils::platform::*` path stable for code built on the template.
//! See `docs/developer/testing.md` for the pattern.

// Re-exported for apps built on this template; the template itself does not call
// these helpers, so the re-export is intentionally unused here — this mirrors the
// `#![allow(dead_code)]` that lived on this module before the logic moved into
// the crate.
#[allow(unused_imports)]
pub use platform_utils::*;
