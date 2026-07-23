//! View-window lifecycle (Phase 7.1A): create-once/focus-if-open on the
//! quick-pane pattern. Callers are `async` commands (AGENTS.md CRITICAL —
//! a sync window-creating command deadlocks WebView2 on Windows), so this
//! code runs on the async runtime, never the main thread.

use tauri::webview::WebviewWindowBuilder;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};

use super::types::ViewWindow;

/// hub-ground (`#03060b`) — pre-paint background so Windows never
/// flashes a white rectangle before the webview paints (secondary-window
/// checklist #5; the entry CSS reset in `window.html` is the other half).
const VIEW_WINDOW_BACKGROUND: tauri::window::Color = tauri::window::Color(3, 6, 11, 255);

const VIEW_WINDOW_WIDTH: f64 = 1440.0;
const VIEW_WINDOW_HEIGHT: f64 = 900.0;
const VIEW_WINDOW_MIN_WIDTH: f64 = 1000.0;
const VIEW_WINDOW_MIN_HEIGHT: f64 = 700.0;

/// Rust → JS notification that a view window was destroyed (native ✕ or
/// `close_view_window`) — main clears its rail popped-state indicator
/// without touching selection/view (#121). Payload: the `ViewWindow`
/// (serializes to `"case"` / `"map"`).
const VIEW_WINDOW_CLOSED_EVENT: &str = "view-window-closed";

/// Create-once/focus-if-open (checklist #2). The `view-context` retarget
/// emit on focus-if-open is JS-side ONLY — the invoking caller emits
/// after this resolves (7.1A: one emitter, `sessionEvents.ts`, never two).
pub fn open_view_window(app: &AppHandle, view: ViewWindow) -> Result<(), String> {
    let label = view.label();

    if let Some(window) = app.get_webview_window(label) {
        window
            .show()
            .map_err(|e| format!("Failed to show view window {label}: {e}"))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus view window {label}: {e}"))?;
        return Ok(());
    }

    let built = WebviewWindowBuilder::new(
        app,
        label,
        WebviewUrl::App(format!("window.html?view={}", view.query()).into()),
    )
    .title(view.title())
    .inner_size(VIEW_WINDOW_WIDTH, VIEW_WINDOW_HEIGHT)
    .min_inner_size(VIEW_WINDOW_MIN_WIDTH, VIEW_WINDOW_MIN_HEIGHT)
    .background_color(VIEW_WINDOW_BACKGROUND)
    .build();

    let window = match built {
        Ok(window) => window,
        Err(build_error) => {
            // Double-open race arm (7.1A/checklist #2): two interleaved
            // async opens — if the label now exists, the OTHER call won;
            // focus its window and succeed. Destroy only a genuine
            // corpse (exists but cannot even take focus) — never the
            // window a concurrent call just built.
            if let Some(window) = app.get_webview_window(label) {
                match window.set_focus() {
                    Ok(()) => return Ok(()),
                    Err(focus_error) => {
                        log::error!(
                            "view window {label} half-created (focus failed: {focus_error}); destroying"
                        );
                        if let Err(destroy_error) = window.destroy() {
                            log::error!(
                                "failed to destroy half-created view window {label}: {destroy_error}"
                            );
                        }
                    }
                }
            }
            return Err(format!(
                "Failed to create view window {label}: {build_error}"
            ));
        }
    };

    // Native ✕ → destroy is Tauri's default for an unhandled
    // CloseRequested — the deliberate choice here (checklist #4):
    // reset-per-open, since each open re-runs the token handshake.
    // Destroyed → tell main so the rail clears its popped indicator.
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if let Err(e) = app_handle.emit(VIEW_WINDOW_CLOSED_EVENT, view) {
                log::warn!("failed to emit {VIEW_WINDOW_CLOSED_EVENT}: {e}");
            }
        }
    });

    log::info!("view window {label} created");
    Ok(())
}

/// Destroys the view window if it exists (idempotent — an absent window
/// is already closed).
pub fn close_view_window(app: &AppHandle, view: ViewWindow) -> Result<(), String> {
    let label = view.label();
    if let Some(window) = app.get_webview_window(label) {
        window
            .destroy()
            .map_err(|e| format!("Failed to close view window {label}: {e}"))?;
    }
    Ok(())
}
