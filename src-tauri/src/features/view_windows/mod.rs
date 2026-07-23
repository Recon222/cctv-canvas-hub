//! View pop-out windows (Phase 7.1, A1/AD13): the case dashboard and map
//! views open as secondary Tauri windows on the quick-pane lifecycle —
//! create-once/focus-if-open, native ✕ destroys (reset-per-open: every
//! open re-runs the JS-side token handshake), and async commands only
//! (AGENTS.md CRITICAL: sync window commands deadlock WebView2 on
//! Windows). Auth topology is AD13: these windows never touch the vault —
//! the main window pushes the access token over Tauri events.

pub mod commands;
pub mod services;
pub mod types;
