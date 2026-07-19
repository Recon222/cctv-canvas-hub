# AI Agent Instructions

## Overview

This repository is a template with sensible defaults for building Tauri v2 + React desktop apps. Code is organized by **domain feature** on both the frontend and the Rust backend. Everything below is project-agnostic — it holds for any app built from this template.

## Core Rules

### New Sessions

- Read @docs/tasks.md for task management
- Review `docs/developer/architecture-guide.md` for high-level patterns
- Check `docs/developer/README.md` for the full documentation index
- Check git status and project structure

### Development Practices

**CRITICAL:** Follow these strictly:

0. **Use npm only**: This project uses `npm`, NOT `pnpm`. Always use `npm install`, `npm run`, etc.
1. **Read Before Editing**: Always read files first to understand context
2. **Follow Established Patterns**: Use patterns from this file and `docs/developer`
3. **Senior Architect Mindset**: Consider performance, maintainability, testability
4. **Batch Operations**: Use multiple tool calls in single responses
5. **Match Code Style**: Follow existing formatting and patterns
6. **Test Coverage**: Write comprehensive tests for business logic
7. **Quality Gates (definition of done)**: `npm run check:all` is the enforcement — nothing runs automatically. Run it while working to catch drift early, and it **must pass green before every commit and before marking any task complete**. A red gate is not done. Never bypass a stage (no `--no-verify`, no disabling a rule to make it pass) — fix the code, or raise it with the user if a rule itself is wrong.
8. **No Dev Server**: Ask the user to run and report back — _exception:_ an agent may launch and drive the app itself for end-to-end verification via the `driving-agent-shell` skill (which also handles teardown)
9. **No Unsolicited Commits**: Only when explicitly requested
10. **Documentation**: Update relevant `docs/developer/` files for new patterns
11. **Removing files**: Always use `rm -f`

**CRITICAL:** Use Tauri v2 docs only. Always use modern Rust formatting: `format!("{variable}")`

## Architecture Patterns (CRITICAL)

### State Management Onion

```
useState (component) → Zustand (global UI) → TanStack Query (persistent data)
```

**Decision**: Is data needed across components? → Does it persist between sessions?

### Performance Pattern (CRITICAL)

```typescript
// ✅ GOOD: Selector syntax - only re-renders when specific value changes
const leftSidebarVisible = useUIStore(state => state.leftSidebarVisible)

// ❌ BAD: Destructuring causes render cascades (caught by ast-grep)
const { leftSidebarVisible } = useUIStore()

// ✅ GOOD: Use getState() in callbacks for current state
const handleAction = () => {
  const { data, setData } = useStore.getState()
  setData(newData)
}
```

### Static Analysis

- **React Compiler**: Handles memoization automatically - no manual `useMemo`/`useCallback` needed
- **ast-grep**: Enforces architecture patterns (e.g., no Zustand destructuring). See `docs/developer/static-analysis.md`
- **Knip/jscpd**: Periodic cleanup tools. Use `/cleanup` command (Claude Code)

### Event-Driven Bridge

- **Rust → React**: `app.emit("event-name", data)` → `listen("event-name", handler)`
- **React → Rust**: Use typed commands from `@/lib/tauri-bindings` (tauri-specta)
- **Commands**: All actions flow through centralized command system

### Feature-Based Architecture — Frontend (CRITICAL)

Code is organized by **domain feature**, not by technical role:

```
src/features/<feature>/
├── components/   # UI components
├── hooks/        # TanStack Query hooks (orchestration)
├── services/     # Plain async functions wrapping Tauri IPC
├── store/        # Feature-local Zustand (if needed)
├── types/        # Feature types
├── __tests__/    # Feature tests
└── index.ts      # Barrel export (public API)
```

**Critical rules:**

```typescript
// ✅ GOOD: Import from barrel export
import { PreferencesDialog } from '@/features/preferences'

// ❌ BAD: Deep import into feature internals
import { PreferencesDialog } from '@/features/preferences/components/PreferencesDialog'

// ✅ GOOD: Service owns IPC calls (plain async function)
// src/features/preferences/services/preferencesService.ts
export async function loadPreferences(): Promise<AppPreferences> {
  const result = await commands.loadPreferences()
  if (result.status === 'error') return defaults
  return result.data
}

// ❌ BAD: Component calls Tauri directly
const result = await commands.loadPreferences() // Not in a service file!
```

**Adding features**: Copy `src/features/example-feature/` and follow the patterns.

### Feature-Based Architecture — Rust Backend (CRITICAL)

The Rust backend mirrors the frontend. Each feature owns its commands, services, and types:

```
src-tauri/src/features/<feature>/
├── mod.rs          # Module declaration + re-exports
├── commands/
│   └── mod.rs      # Tauri command handlers (thin wrappers)
├── services/
│   └── mod.rs      # Business logic (file I/O, process mgmt, pure functions)
└── types/
    └── mod.rs      # Feature types with Serialize, Deserialize, specta::Type
```

**Critical rules:**

```rust
// ✅ GOOD: Commands are thin wrappers delegating to services
#[tauri::command]
#[specta::specta]
pub async fn load_example_data(app: AppHandle) -> Result<ExampleData, ExampleError> {
    let service = ExampleService::new(&app)?;
    service.load_example_data().await
}

// ❌ BAD: Business logic directly in a command handler
#[tauri::command]
#[specta::specta]
pub async fn load_example_data(app: AppHandle) -> Result<ExampleData, ExampleError> {
    let path = PathBuf::from(app.path().app_data_dir()?);  // Don't do this here
    let content = std::fs::read_to_string(&path)?;         // This belongs in services
    Ok(serde_json::from_str(&content)?)
}

// ✅ GOOD: Feature error types use a serde tag → TypeScript discriminated union
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type")]
pub enum ExampleError {
    NotFound { id: String },
    ValidationError { message: String },
    IoError { message: String },
}

// ✅ GOOD: Every IPC type derives these four for tauri-specta
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ExampleData { /* ... */ }
```

> **Error types — enum vs. `String`.** Prefer a `#[serde(tag = "type")]` enum when the frontend needs to _distinguish_ failure modes (the discriminated union above). Simple or UI-adjacent commands whose caller only logs or shows the message may return `Result<T, String>` — an accepted convention (see `docs/developer/rust-architecture.md`), used by `preferences`, `notifications`, and `quick_pane`. Reach for the enum the moment a caller must branch on the error kind.

**Registration flow:**

1. Feature re-exports its public API in `mod.rs`: `pub use types::{ExampleData, ExampleError};`
2. `src/features/mod.rs` re-exports each feature's command module: `pub use example_feature::commands as example_feature_commands;`
3. `src/bindings.rs` lists every command in `generate_bindings()` via `collect_commands![]`.
4. Regenerate `src/lib/bindings.ts` — see **Bindings Regeneration** below.

**Adding Rust features**: Copy `src-tauri/src/features/example_feature/` and follow the pattern. Register commands in `features/mod.rs` and `bindings.rs`.

> **No flat command/service dirs.** There is no `src-tauri/src/commands/` or `src/services/` — every command and service lives under its `features/<feature>/`, and `lib.rs` is app setup only (zero commands). Some external guides assume the flat layout; this template doesn't use it.

### Tauri Command Pattern (tauri-specta)

```typescript
// ✅ GOOD: Type-safe commands in SERVICE files only
import { commands } from '@/lib/tauri-bindings'

const result = await commands.loadPreferences()
if (result.status === 'ok') {
  console.log(result.data.theme)
}

// ❌ BAD: String-based invoke (no type safety)
const prefs = await invoke('load_preferences')
```

Multi-parameter commands take **positional** args on the JS side (`commands.saveFoo(a, b)`), never an options object (`commands.saveFoo({ a, b })`) — tauri-specta maps them by position.

**Adding commands**: See `docs/developer/tauri-commands.md`

### Bindings Regeneration

`src/lib/bindings.ts` is generated from the Rust commands — never edit it by hand.

- **Automatic (primary):** debug builds re-export on every launch (`lib.rs` calls `export_ts_bindings()` under `#[cfg(debug_assertions)]`), so `npm run tauri:dev` keeps bindings fresh. This runs from `target/debug/`, so it works on Windows.
- **Manual / headless:** `npm run rust:bindings` → `cargo run --bin gen_bindings`. Use when you changed a command signature and want to regenerate without booting the full app (e.g. before a typecheck).

**Windows gotcha (hard-won):** do **not** regenerate via `cargo test export_bindings -- --ignored`. On Windows the test harness runs the binary from `target/debug/deps/`, which does not have the staged WebView2 loader DLL on its path → `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139). The `gen_bindings` **binary** runs from `target/debug/` where the DLL is staged, so it loads cleanly. (An `#[ignore]`d `export_bindings` test still exists as a non-Windows fallback — ignore its stale comment.)

### Window-Creating Commands Must Be `async` (CRITICAL · Windows)

Any Tauri command that **creates or manipulates a `WebviewWindow`** (`build()`, `destroy()`, `show()`, …) **must be `async fn`**. A synchronous command runs on the main thread and blocks the event loop WebView2 needs to pump → an intermittent multi-second hang + `WebView2 error: TaskCanceled` → a webview-less "ghost" window whose ✕ does nothing and that won't reopen (Windows).

```rust
// ❌ BAD: sync command → main-thread deadlock on Windows WebView2 creation
#[tauri::command]
pub fn open_window(app: AppHandle) -> Result<(), String> { /* build() hangs */ }

// ✅ GOOD: async runs off the main thread; build() dispatches to a free event loop
#[tauri::command]
pub async fn open_window(app: AppHandle) -> Result<(), String> { /* ... */ }
```

`async` vs sync doesn't change the generated bindings (both return a `Promise`). **macOS NSPanel is the inverse** — it must be created on the main thread (`setup()`/sync). Full rationale + the secondary-window checklist (background color, entry CSS reset, native-✕ → `destroy()`): `docs/developer/tauri-commands.md`.

### Testing Pure Rust Logic (workspace crates · Windows WebView2)

On Windows a test harness that links the app crate (`tauri_app_lib`) aborts at **load** with `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139): it runs from `target/debug/deps/` without the staged WebView2 loader DLL, _before any test runs_. So `Cargo.toml` keeps `[lib] test = false` (disables the app crate's unit-test harness — still required, verified), and **you do not put unit tests inside the app crate** (`src-tauri/src/`) — inline `#[cfg(test)]` there won't run.

**Pure logic that needs unit tests goes in a Tauri-free workspace crate** under `src-tauri/crates/<name>/` (no `tauri` dependency), with ordinary inline `#[cfg(test)]` tests — it never links WebView2, so `cargo test` runs it cleanly with no duplication. `src-tauri` is a Cargo workspace; `[workspace] default-members` lists the crates so bare `cargo test` (what `rust:test` runs) includes them. `crates/platform-utils/` is the shipped example — copy it. If a crate's public types need TypeScript bindings, gate the `specta::Type` derive behind an **optional `specta` feature** (off by default → `cargo test -p <crate>` stays WebView2-free; the app enables it via its path dependency). Full guide: `docs/developer/testing.md`.

### Internationalization (i18n)

```typescript
// ✅ GOOD: Use useTranslation hook in React components
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation()
  return <h1>{t('myFeature.title')}</h1>
}

// ✅ GOOD: Non-React contexts - bind for many calls, or use directly
import i18n from '@/i18n/config'
const t = i18n.t.bind(i18n)  // Bind once for many translations
i18n.t('key')                 // Or call directly for occasional use
```

- **Translations**: All strings in `/locales/*.json`
- **RTL Support**: Use CSS logical properties (`text-start` not `text-left`)
- **Adding strings**: See `docs/developer/i18n-patterns.md`

### Documentation & Versions

- **Context7 First**: Always use Context7 for framework docs before WebSearch
- **Version Requirements**: Tauri v2.x, shadcn/ui v4.x, Tailwind v4.x, React 19.x, Zustand v5.x, Vite v7.x, Vitest v4.x

## Windows Gotchas

- **Bindings regeneration** → see _Bindings Regeneration_. Never use `cargo test export_bindings`.
- **Window-creating commands** → must be `async` (see that section). Sync ones deadlock WebView2.
- **Worktree removal locked**: if `git worktree remove` (or `Remove-Item -Recurse`) fails with _"Device or resource busy"_ / _"The process cannot access the file"_, a process is holding a handle inside the worktree — don't just retry, find the holder. Usual culprits: a terminal whose `cwd` is inside the worktree (Windows keeps an exclusive handle on the cwd), VS Code (file watcher + rust-analyzer), or a running `tauri:dev` / `vitest --watch`. Diagnostic:

  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*<worktree-name>*" } | Select-Object ProcessId, Name, CommandLine
  ```

## Developer Documentation

`docs/developer/` holds the full patterns — **read the relevant doc before working in that area.** Index (fuller descriptions in `docs/developer/README.md`):

- **Architecture** — `architecture-guide.md` (mental models, anti-patterns) · `rust-architecture.md` (feature module organization) · `state-management.md` (state onion, getState()) · `error-handling.md` (propagation, retry, user feedback)
- **Core systems** — `command-system.md` (action dispatch) · `keyboard-shortcuts.md` (global shortcuts) · `menus.md` (native menus + i18n) · `quick-panes.md` (multi-window entry) · `tauri-commands.md` (tauri-specta bridge) · `tauri-plugins.md` (plugin config)
- **UI & data** — `ui-patterns.md` (CSS, shadcn/ui) · `i18n-patterns.md` (translations, RTL) · `notifications.md` (toast + native) · `cross-platform.md` (OS adaptations) · `data-persistence.md` (files, atomic writes, SQLite) · `external-apis.md` (HTTP, auth, caching)
- **Quality & release** — `static-analysis.md` (ESLint/Prettier/ast-grep/knip/jscpd) · `writing-ast-grep-rules.md` (custom rules) · `testing.md` (patterns, Tauri mocking) · `logging.md` (Rust + TS) · `bundle-optimization.md` (bundle size) · `releases.md` (signing, auto-update) · `writing-docs.md` (maintaining these docs)

## Claude Code Commands & Agents

These are specific to Claude Code but documented here for context.

### Commands

- `/check` - Check work against architecture, run `npm run check:all`, suggest commit message
- `/cleanup` - Run static analysis (knip, jscpd, check:all), get structured recommendations
- `/init` - One-time template initialization
- `/react-tauri-rust-code-review [pr# | blank]` - Multi-agent review of a **code** PR (rust + ts + tests + silent-failure + type-design), strict BLOCK/REVISE/APPROVE. `--fix-delta` re-reviews fix commits via resumed agents.
- `/react-tauri-rust-plan-review [pr# | path | blank]` - Multi-agent review of **planning docs** before implementation (architect + quality + reality-check; optional rust/ts proposal-review lanes).

### Agents

Task-focused agents that leverage separate context for focused work:

- `plan-checker` - Validate implementation plans against documented architecture
- `docs-reviewer` - Review developer docs for accuracy and codebase consistency
- `userguide-reviewer` - Review user guide against actual system features
- `cleanup-analyzer` - Analyze static analysis output (used by `/cleanup`)

**Code-review fan-out** (dispatched by `/react-tauri-rust-code-review`):

- `rust-reviewer`, `typescript-reviewer` - language-specialist code reviewers
- `pr-test-analyzer` - test-quality reviewer (behavioral coverage, false-coverage traps)
- `silent-failure-hunter` - swallowed / downgraded / hidden errors
- `type-design-analyzer` - type design across the Rust + TS surface

**Plan-review fan-out** (dispatched by `/react-tauri-rust-plan-review`):

- `plan-architect-reviewer`, `plan-quality-checker`, `plan-reality-checker`

**Standalone reviewers** (manual / opt-in):

- `security-reviewer` - OWASP / secrets / injection (opt-in; many features accept deliberate trust boundaries)
- `comment-analyzer` - comment accuracy & rot (periodic sweep)
- `database-reviewer` - PostgreSQL / Supabase schema, RLS, and query review
