//! View-window commands (Phase 7.1A) — thin async wrappers over the
//! service. `async fn` is load-bearing (AGENTS.md CRITICAL): a sync
//! command that builds/destroys a WebviewWindow runs on the main thread
//! and deadlocks WebView2 on Windows.

use tauri::AppHandle;

use super::services;
use super::types::ViewWindow;

/// Opens (or focuses, create-once) the pop-out window for `view`.
///
/// `case_id` is logging context only — the case reaches the secondary
/// via the JS-side `view-context` handshake (AD13; one emitter,
/// `sessionEvents.ts`), never through this command.
#[tauri::command]
#[specta::specta]
pub async fn open_view_window(
    app: AppHandle,
    view: ViewWindow,
    case_id: Option<String>,
) -> Result<(), String> {
    log::info!("Opening view window {view:?} (case {case_id:?})");
    services::open_view_window(&app, view)
}

/// Destroys the pop-out window for `view` (idempotent).
#[tauri::command]
#[specta::specta]
pub async fn close_view_window(app: AppHandle, view: ViewWindow) -> Result<(), String> {
    log::info!("Closing view window {view:?}");
    services::close_view_window(&app, view)
}
