//! Headless TypeScript-bindings generator.
//!
//! Run via `npm run rust:bindings` (`cargo run --bin gen_bindings`).
//!
//! Why a binary and not `cargo test export_bindings`: on Windows the test
//! harness runs from `target/debug/deps/`, which does not have the staged
//! WebView2 loader DLL on its path, so the binary fails to load with
//! STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139). A normal binary runs from
//! `target/debug/`, where the DLL is staged, so it loads cleanly.
fn main() {
    tauri_app_lib::export_ts_bindings();
    println!("✓ TypeScript bindings exported to src/lib/bindings.ts");
}
