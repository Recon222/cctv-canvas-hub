# Fable — Start Here

You are **Fable 5**, and you're building **Canvas Hub** — a live project-room command-centre desktop app — in this repository. It's a Tauri v2 + React 19 + Rust template that has been prepared for you.

This document is your on-ramp. It does **not** re-explain the product (that's the design spec) or the architecture (that's `AGENTS.md` and `docs/developer/`). It tells you what to read, what skills to invoke, the guard rails already wired up around you, the non-obvious edges that will bite, and what to do first.

**Do not write any code yet.** Read, then respond in chat (see _Your first move_ at the bottom).

---

## 1. Read these, in this order

1. **`AGENTS.md`** (repo root) — the project bible. Architecture patterns, the CRITICAL rules, Windows gotchas, and the developer-docs index. It **overrides your defaults** — when it and a habit disagree, it wins.
2. **`docs/plans/initial plan/canvas-hub-spec.md`** — the product: who it's for, what success looks like, views/layout, media, live behaviour, auth/security, and the phasing. **§3 (Data contract) is non-negotiable and is your only source of truth for the cloud schema** — tables, columns, buckets, realtime. You have **no access** to the sibling mobile app's repo and **no live Supabase/MCP connection**; the contract is pinned precisely so you don't need them. Build against §3.
3. **`docs/plans/initial plan/planning-doc-house-style.md`** — how planning docs are written here. Match it when you write your own.
4. **`docs/tasks.md`** — how tasks are tracked (`tasks-todo/` → `tasks-done/`, the completion script).
5. **`docs/developer/README.md`** — the index. **Read the specific doc before you work in that area.** The load-bearing ones for early work: `architecture-guide.md`, `state-management.md`, `rust-architecture.md`, `tauri-commands.md`, and `testing.md`.

---

## 2. Invoke skills — don't wing it

The **`using-superpowers`** skill loads at session start. Follow its rule literally: **invoke the relevant skill _before_ acting**. Specifically:

- **Chasing a bug** → the **systematic-debugging** skill.
- **Actually running / driving the app** to verify end-to-end behaviour → **`driving-agent-shell`** (how to launch, reach the backend, observe, and tear down cleanly on Windows) together with **`live-smoke-testing`** (how to build a check that can genuinely fail — verify your repro goes red before you trust it green). These two are tuned for _this_ template.

Per `AGENTS.md` rule 8: don't casually spin up a dev server — drive it through `driving-agent-shell` (which handles teardown) or ask the user to run it.

---

## 3. The guard rails already wired for you

These exist so you can move fast without drifting. **Work _with_ them; when one fires, your code is wrong, not the rail.**

- **`npm run check:all` is the definition of done.** Eight stages — typecheck → lint → ast-grep → format → rust fmt → clippy → JS tests → rust tests. It is runnable and **green right now**. It must be green **before every commit and before you mark any task complete.** A red gate is not done.
- **Pre-commit hook (already active, no setup needed).** On every commit it runs the fast half (typecheck, lint, ast-grep, format). When you stage anything under `src-tauri/`, it _also_ runs the Rust half (fmt + clippy + test). Don't reach for `--no-verify`; fix the code.
- **Strict type-aware ESLint** (`strictTypeChecked` + `stylisticTypeChecked`). **Fix the code — do not disable a rule to make it pass.** Vendored `src/components/ui/**` and test files are already scope-exempt; don't widen exemptions without a real reason, and raise it with the user if you think a rule itself is wrong.
- **ast-grep architecture rules** enforce the feature-based layout. They will stop you from: deep-importing feature internals (import from the barrel `@/features/<x>`), **destructuring a Zustand store** (any `use*Store` — use the selector `useStore(s => s.value)` instead), calling `invoke()` in a component (services own IPC), and putting hooks in `lib/`. If `ast:lint` fails, change the code to fit the architecture.
- **tsconfig is strict** — `noUncheckedIndexedAccess`, `noImplicitReturns`, and the full `strict` set. Array accesses are `T | undefined`; handle it.
- **Rust tests go in a workspace crate.** Pure logic belongs in a Tauri-free crate under `src-tauri/crates/` (copy `platform-utils/`), **not** inline in the app crate — inline tests there crash on Windows (WebView2 loader). `[lib] test = false` is deliberate; leave it.

---

## 4. Sharp edges (the non-obvious "why", so you don't "fix" a deliberate choice)

- **Window-creating Tauri commands MUST be `async`.** A sync command that builds/destroys a `WebviewWindow` deadlocks WebView2 on Windows (multi-second hang, ghost window). Details in `docs/developer/tauri-commands.md`.
- **Regenerate bindings with `npm run rust:bindings`** — never `cargo test export_bindings` (crashes on Windows with `STATUS_ENTRYPOINT_NOT_FOUND`). `src/lib/bindings.ts` is generated; never hand-edit it.
- **`npm` only** (not pnpm). Removals use `rm -f`. Modern Rust formatting: `format!("{variable}")`.
- **DVR credentials in the data are meant to be _displayed_, not hidden** (spec §7 — "police inside a police building"). Don't mask them as secrets.
- **No unsolicited commits** (rule 9) — commit only when asked. When you do, the gate above applies.

---

## 5. Your first move

Once you've read §1's documents and the design spec:

**Respond in chat with a brief, no-code message** giving your honest read on the plan, the design spec, and the concept. Include:

- What you think is strong / well-scoped.
- Anything you'd push back on, or that reads as risky, under-specified, or contradictory.
- The handful of things you'd want nailed down before building (especially any gap in the §3 data contract).
- Your confidence level going in.

Keep it short and high-signal. **Don't start implementing, and don't write planning docs, until the user responds.** This first exchange is a gut-check on the concept — not a plan.
