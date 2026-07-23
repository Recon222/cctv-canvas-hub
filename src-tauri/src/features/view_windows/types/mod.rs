//! View-window types (Phase 7.1A).

use serde::{Deserialize, Serialize};
use specta::Type;

/// The pop-out views (A1/AD12): the case dashboard and the map.
///
/// The Cases landing is deliberately NOT a variant — it is bound to the
/// main window (test #119) — and A2 removed the diagnostics window, so
/// invalid views are unrepresentable over IPC. Deliberately distinct
/// from the frontend store's three-view union.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ViewWindow {
    Case,
    Map,
}

impl ViewWindow {
    /// The Tauri window label — must match `capabilities/view-windows.json`.
    pub fn label(self) -> &'static str {
        match self {
            ViewWindow::Case => "view-case",
            ViewWindow::Map => "view-map",
        }
    }

    /// The `window.html?view=…` query value the secondary entry parses.
    pub fn query(self) -> &'static str {
        match self {
            ViewWindow::Case => "case",
            ViewWindow::Map => "map",
        }
    }

    /// OS window title (quick-pane precedent: Rust-side window titles
    /// are not localized — the in-window UI is).
    pub fn title(self) -> &'static str {
        match self {
            ViewWindow::Case => "Canvas Hub — Case dashboard",
            ViewWindow::Map => "Canvas Hub — Map",
        }
    }
}
