---
name: driving-agent-shell
description: >
  Launch, drive, observe and tear down THIS Tauri v2 + React + Rust desktop app with the Windows MCP
  computer-use tools and process tooling, so you can verify a change against the running program
  instead of guessing. Use it whenever you need to actually run the app: "run the app and check",
  "does this work in the UI", "start tauri dev", "screenshot the app", "drive the window", "verify
  the command works end to end", "reproduce it in the running app", "check for zombie processes".
  Read it BEFORE your first `tauri dev`: a fresh checkout needs `npm install`, `npm run tauri:dev`
  fails outside bash, there is no devtools `invoke` (no window.__TAURI__), and a stale bundler on
  port 1420 will silently eat your next launches. Driving is done through the Windows MCP
  accessibility snapshot — no code injection required. Pair with `live-smoke-testing`, which supplies
  the method (verify your repro can fail; A/B with one variable); this skill supplies the mechanics.
---

# Driving This Tauri App

The method for *what makes a smoke test valid* lives in **`live-smoke-testing`**. This skill is the
wiring for **this** app (built from the Tauri v2 + React + Rust template): how to launch it, drive the
real window, reach a Rust command when there is no UI for it, watch what happens, and leave the machine
as you found it.

> This skill was ported from a richer descendant app (Agent Shell) and rewritten for this codebase.
> Where that app had sidecars, a voice engine, and a session-chat product, this app currently does not —
> so the driving method here is the **Windows MCP accessibility snapshot**, which needs no code
> injection. As this app grows real subsystems, extend this skill rather than reaching for the old one.

## Launching

**Install deps first on a fresh checkout.** The template does not commit `node_modules`; a bare clone
fails with `npx tauri could not determine executable to run` until you run `npm install`.

**Launch with `npx tauri dev`.** Cargo is on PATH, so call the binary directly and redirect to a log,
in the **background** (never pipe a process you intend to watch — the buffer makes the log look empty):

```bash
LOG=/tmp/canvas-hub-dev.log
npx tauri dev > "$LOG" 2>&1 &      # background
```

- `npm run tauri dev` works too (fine for a human). **Do not** use `npm run tauri:dev` from the Bash
  tool or any non-bash context — its `source ~/.cargo/env` prefix is run through `cmd.exe` by npm and
  fails with `'source' is not recognized`. Same for `rust:test` / `rust:clippy` / `rust:fmt` /
  `rust:bindings` — call `cargo …` / the `gen_bindings` bin directly.
- The crate ships two binaries (`tauri-app`, `gen_bindings`). `Cargo.toml` sets
  `default-run = "tauri-app"`, so `cargo run` / `tauri dev` resolve the app automatically. If you ever
  see `could not determine which binary to run`, that key was lost — restore it (don't paper over it
  with `-- --bin tauri-app`).

**Port 1420 is the trap.** `beforeDevCommand` starts vite on `http://localhost:1420`. If a previous
`tauri dev` died, its vite child can survive and the next launch fails with `Port 1420 is already in
use`. Find it, **read it, then kill it**:

```bash
netstat -ano | grep -E ":1420\s+.*LISTENING"          # get the PID
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ProcessId = <pid>' |
  Select-Object ProcessId,Name,ParentProcessId,CommandLine"
taskkill //PID <pid> //T //F
```

**Claude Code itself runs as `node.exe`.** Read `CommandLine` before killing; never
`taskkill /IM node.exe`.

**Know when it is up by the log, not the clock.** A cold Rust build is minutes; a warm one is seconds.

```bash
grep -aE "Running .target|could not compile|error\[E" "$LOG" | tail -5
```

`Running \`target\debug\tauri-app.exe\`` means the window is launching. To wait without blind polling,
use a background `until` loop that exits on success **or** failure (one notification):

```bash
until grep -aqE "tauri-app\.exe|could not compile|error\[E[0-9]" "$LOG"; do sleep 3; done
```

## Driving — the Windows MCP a11y snapshot is the primary method

Drive the real window through the Windows MCP tools. No harness, no code injection, fully portable —
this is the default for this app.

1. **Focus:** `mcp__windows-mcp__App { mode: "switch", name: "tauri-app" }`.
2. **Observe + locate:** `mcp__windows-mcp__Snapshot { use_vision: true }` returns a labeled interactive
   **UI tree** with screen coordinates and action hints (`[action: click]`, `[action: fill]`,
   `[toggle: on]`) plus a screenshot. This is richer than pixel-hunting a screenshot and is your primary
   instrument. Elements come labeled (`"Settings"`, `"Hide Left Sidebar"`, the app menu
   `"Tauri Template"` / `"View"`) — target them by reading the label's coordinates.
3. **Act:** `mcp__windows-mcp__Click { loc: [x, y] }`; `mcp__windows-mcp__Type { loc: [x, y], text: "…",
   clear: true }` for inputs. **UI-tree coordinates are already screen-space — pass them directly.**
   Only coordinates you eyeball off the (downscaled) screenshot image need multiplying by the scale the
   snapshot reports.
4. **Verify:** re-snapshot. A click that changed state yields a different tree; that before/after IS
   your evidence. (Proven: clicking `Settings` opens the `Preferences` dialog — the tree then shows
   General/Appearance/Advanced, the text field, the toggle.)

In-app Radix dialogs and the native Tauri menu are fine to drive. **Never** trigger a JS
`alert`/`confirm`/native blocking modal from injected code — it freezes the automation channel and you
lose the session.

## Reaching the backend when there is no UI (fallback harness)

`withGlobalTauri` is unset, so **`window.__TAURI__` does not exist** — you cannot call a Rust command
from a devtools console. When you need to invoke a command with no UI surface, mount a temporary
harness: a **new untracked** component rendered by the app's always-mounted root (wire it into the
top-level `App.tsx` / root provider), calling the feature's **service** (services own IPC per the
architecture rule — you get the typed wrapper and production error handling). Keep the tracked-file
diff to the two lines that import and render it; back up that file's bytes **outside** the repo and
restore by rewriting bytes, never a git command. A copy-paste overlay is in
**`references/harness-template.md`**. This is the fallback — the Windows-MCP path above covers anything
with a UI.

## Observing

- **The dev log** (`$LOG`) captures cargo output, every `log::info!` / `log::warn!` from the Rust side
  (`tauri-plugin-log`), and vite. Grep it before believing any theory, including your own.
- **Process census** (external truth):
  ```bash
  powershell -NoProfile -Command "@(Get-Process tauri-app -EA 0) | Select-Object Id,StartTime | Format-Table -Auto"
  ```
  `StartTime` tells you *which* instance survived, not merely how many — essential when a restart is in
  play. vite appears as `node.exe`; disambiguate via `Get-CimInstance Win32_Process` → `CommandLine`.
- **On-screen state** — the a11y snapshot's screenshot is itself an artifact; it doubles as footage if
  the user is recording.

## Rebuild semantics (how to A/B a Rust change)

| You edited | What happens | Cost |
|---|---|---|
| a `.tsx` / `.ts` file | vite HMR, instant | ~0 |
| a file under `src-tauri/src/` | the `tauri dev` watcher **rebuilds and relaunches the app itself** | ~20 s warm |

To A/B a Rust-side mutation, edit the source, wait, and the app returns with the new binary — you never
restart the dev server by hand. **Confirm the running binary contains your change** before concluding:

```bash
stat -c '%y' src-tauri/target/debug/tauri-app.exe    # newer than your edit?
grep -a "Compiling tauri-app\|Running .target" "$LOG" | tail -2
```

Each relaunch drops the app's whole process tree. If another agent or the user is driving the app, do
not rebuild-probe under them.

## Teardown

**Graceful `WM_CLOSE` is NOT reliable on this app.** `taskkill //PID <app>` without `/F` posts
`WM_CLOSE`, but here it gets swallowed (an open modal and/or the window-close path) and the app keeps
running. This app has no sidecars, so there is no graceful-shutdown sequence worth "testing" via the
quit anyway. Tear down by force-killing the dev tree from the top:

1. Find the `npx` / `@tauri-apps/cli` root PID, then `/T` cascades to vite, the app, its WebView2
   children, and the quick-pane second window (`com.tauri-app.app-siw`):
   ```bash
   powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" |
     Where-Object { \$_.CommandLine -match 'tauri dev' -and \$_.CommandLine -notmatch 'claude' } |
     Select-Object ProcessId,CommandLine"   # read first
   taskkill //PID <root-pid> //T //F
   ```
2. **Census clean:** `tauri-app` count 0, port 1420 free, no leftover `tauri dev` / vite node.
3. **Revert build churn:** the debug build regenerates `src/lib/bindings.ts` on every launch. The
   repo's `.gitattributes` (`eol=lf`) keeps that from dirtying the tree; if you still see it modified,
   `git checkout -- src/lib/bindings.ts`. **Never** `git stash`/`reset`/`checkout` a tree shared with
   another agent or the user — restore individual files only.
4. `git status --porcelain` → no unintended tracked changes; `git diff <reviewed-tip>` empty.
5. Re-run the suites you touched (`npx vitest run …`, `cargo test --test <y>`).

## Gotchas (this app / template)

- **`npm install` before the first launch** — deps are not committed.
- **`npm run tauri:dev` fails outside bash** (the `source ~/.cargo/env` prefix). Same for
  `rust:test` / `rust:clippy` / `rust:fmt` / `rust:bindings`. Use `npx tauri dev` / `cargo …` /
  `gen_bindings` directly.
- **`removeUnusedCommands: true`** — a Tauri command with no frontend caller can be stripped from a
  *release* build. Irrelevant in dev; don't infer installer contents from a working `tauri dev`.
- **Adding a Rust command?** Regenerate bindings with `npm run rust:bindings` (or just relaunch — the
  debug build re-exports `src/lib/bindings.ts` on startup). Do **not** use
  `cargo test export_bindings` — it fails on Windows with `STATUS_ENTRYPOINT_NOT_FOUND`.
- **`cargo test` against the lib is disabled** (`[lib] test = false`; the WebView2 DLL crashes the lib
  test harness at load). Pure logic is mirrored into `src-tauri/tests/*.rs` integration binaries.
- **No `window.__TAURI__`** (`withGlobalTauri` unset) — reach the backend via a mounted harness, above.
- **Never trigger `alert`/`confirm`/native modals** from injected code — they block the automation
  channel.
- **The working tree may be shared.** Back up outside the repo; restore by rewriting bytes; never
  `stash`/`checkout`/`reset`.

## References

- **`references/harness-template.md`** — a copy-paste overlay component for reaching the backend without
  UI (the fallback path).
