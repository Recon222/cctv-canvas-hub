# PR 2 — Fix Delta Review

**PR:** [#2](https://github.com/Recon222/cctv-canvas-hub/pull/2) — feat(cloud-session): M1 — session foundation (vault, enrollment, sign-in, schema gate)
**Scope:** Fix delta only — re-review of the 8 commits landed in response to the initial review (`pr-2-review.md`).
**Reviewers (resumed via SendMessage, full transcript context, all Opus):** rust-reviewer · typescript-reviewer · pr-test-analyzer · silent-failure-hunter · type-design-analyzer · database-reviewer
**Date:** 2026-07-19

> **For the implementing instance:** This document is self-contained. You do not need to reread `pr-2-review.md`.

## Verdict

**APPROVE (with comments).**

Both HIGHs and all three MEDIUMs are closed with mutation-sound pinning tests; all three deferrals (D1–D3) are justified against the rubric; the auth-js `-user` discovery inside the fix work was verified accurate against the installed 2.110.7 source and its fix correctly scoped. One item remains open at LOW: the production-logging fix does not hold on **Windows** — the durable log target is macOS-gated and release builds detach the console, so the vault-degrade diagnosability the fix was meant to deliver is still missing on the primary platform. One-line config change (`src-tauri/src/lib.rs:76`). One new LOW (orphan `.tmp` accumulation on crash-mid-write) and one new latent INFO (sign-out no longer disconnects realtime — matters at M2) are both explicitly non-blocking.

## Pre-flight gates (re-verified after fixes)

| Gate | Result |
|---|---|
| `cargo test` (workspace) | 12/12 pass |
| `vitest run` | 13 files, all pass (56 → 64 TS tests; +8 arithmetic verified by pr-test-analyzer) |
| `tsc --noEmit` | clean (exit 0) |
| `npm run check:all` | reported green by author (all eight stages); eslint/ast-grep re-verified clean on changed surface |

## Fix commit → original finding mapping

| Commit | Original finding | Severity | Verdict |
|---|---|---|---|
| e79c29e | Sign-out destroys client singleton (+ masking test #19) | HIGH | **closed** — teardown call removed (the recommended root-cause fix); real-module `client.test.ts` (3 tests); #19 flipped to assert teardown NOT called |
| 9eb85a9 | Bootstrap error paths untested | HIGH | **closed** — 2 rejection tests asserting on store state; mutation-sound (deleting either catch fails exactly its test) |
| 121e2e8 | SchemaGateScreen race (ts) + swallowed sign-out failure (silent) | MEDIUM ×2 | **closed** — TOCTOU-free guard (`state === 'schema-gate'` re-read synchronously) + translated `toast.error`; both pinned, race test replays the exact interleaving |
| 30469d3 | Probe status-0 path untested + wrong comment | MEDIUM | **closed** — #11 case routes through the resolved-`{error, status: 0}` branch (not the catch); comment corrected |
| bf77c06 | Prod logging no-op | LOW | **partially closed — still open on Windows** (see below) |
| 9d0a1cf | Shared vault temp file | LOW | **closed** — `{file}.{pid}.{counter}.tmp` via `AtomicU64`; same-volume rename stays atomic; per-writer cleanup improved |
| adb9f44 | Teardown leaves refresh ticker | LOW | **closed** — `stopAutoRefresh()` first in teardown chain, awaited, spy-pinned |
| c425d1f | `seal`→`Corrupt` naming (L1) + 2 INFOs | LOW/INFO | **deferral-justified** — D1–D3 in `docs/code-reviews/deferred.md` |

## Reviewer verdicts at a glance (fix delta)

| Agent | closed | deferral-justified | still-open | new | verdict |
|---|---|---|---|---|---|
| rust-reviewer | (fix reviewed sound) | D1 ✓ | 0 | 1 LOW | APPROVE |
| typescript-reviewer | 1/1 | — | 0 | 0 | APPROVE |
| pr-test-analyzer | 3/3 | — | 0 | 0 | APPROVE |
| silent-failure-hunter | 1/2 | D3 ✓ | 1 LOW (carried) | 0 | APPROVE with comments |
| type-design-analyzer | (regression pass clean) | — | 0 | 0 | APPROVE |
| database-reviewer | 4/4 | D2 ✓ | 0 | 1 INFO (latent) | APPROVE |

## Closed findings — verification detail

- **Sign-out HIGH:** verified from three lanes. Database: singleton stays alive, in-process sign-out → sign-in works, `admin.signOut(scope:'global')` server revocation unaffected, and the fix *also* restores the `SIGNED_OUT` event auth-js was aborting before (latent M2 benefit). Test: `client.test.ts` is genuinely un-mocked (only global Tauri IPC stubbed) and each of its three tests has a real regression that trips it. TypeScript: `boundKey` correctly stays bound across sign-out.
- **Bootstrap HIGH:** both tests assert `useSessionStore.getState().state`, not mocks; the restore-rejects case is properly distinct from the existing restore-resolves-false test #21.
- **SchemaGate MEDIUMs:** the guard reads state synchronously after the await with no interleaving gap; the race pinning test holds the version fetch pending, completes sign-out, then resolves — asserting the store stays `signed-out`. The toast is reachable, pinned, and the key exists in all three locales (31 keys each, parity verified).
- **Probe MEDIUM:** the new case exercises the branch real users hit (postgrest-js resolves fetch failures as `{error, status: 0}`); dropping the `if (!status)` guard fails it.

## The auth-js `-user` discovery — verified

The fix work's mandated real-module test exposed that installed auth-js 2.110.7 `_removeSession` unconditionally removes `storageKey + '-user'` from main storage (verified at GoTrueClient.js:4326–4328; the `userStorage` guard only gates the copy) — so the single-blob loud-fail was rejecting every *real* sign-out, previously masked by authService's catch and fully-mocked tests. The choke-point fix (removeItem of an unbound sibling key is a no-op) was independently verified sound by three lanes:
- **Scoping:** getItem/setItem still call `assertSingleKey` unconditionally — a second session-class key that is read or *written* still fails loudly; only removal of a never-stored sibling no-ops (correct localStorage semantics). `_saveSession` never writes `-user` to main storage, so nothing is ever silently dropped.
- **Ordering edge (type-lane's heads-up, resolved structurally by two independent proofs):** `-user` cannot arrive while `boundKey` is null. Database-reviewer and silent-failure-hunter each verified against the installed source: `_removeSession`'s awaits are sequential with the main key removed first (GoTrueClient.js:4325 → 4327), all call sites are preceded by a session-key op, `_recoverAndRefresh`'s `-user` branch runs only after a truthy main-key read, all `userStorage`-gated ops are dead code (never configured), and the adapter binds `boundKey` on the main-key op even against an empty vault. The verifier-key precedent does not transfer — transient keys early-out before `assertSingleKey` and never bind.
- **Pinned:** sibling removal → no `vaultClear`; bound-key removal → `vaultClear` once; second-key write → loud fail.

## Deferral justifications — verification detail

| ID | Item | Rubric check | Verdict |
|---|---|---|---|
| D1 | `seal` encrypt-failure maps to `Corrupt` | Cited by ID + origin; specific rationale (unreachable < ~64 GiB, cosmetic); concrete trigger ("only if the seal path gains reachable failure modes") | justified (rust-reviewer) |
| D2 | Transient gate error → `signed-out` (not retryable) | Cited; rationale (fail-closed, recoverable); trigger (M2/M5 health work — health store is the right home for "gate check couldn't run") | justified (database-reviewer) |
| D3 | `reauthenticate` conflates wrong-password vs unreachable | Cited; rationale (no live caller in M1 — still true across all 8 commits); trigger (M6 Phase 6.1 LockOverlay, its first caller); named fix (reuse the Probe error types) | justified (silent-failure-hunter) |

## Still open / new findings

**[LOW, carried] Logger production sink has no durable target on Windows — the vault-degrade path is still invisible to a Windows operator**
Source agent: silent-failure-hunter
Files: src/lib/logger.ts:79–83 · src-tauri/src/lib.rs:70–80 · src-tauri/src/main.rs:2
Issue: The TS wiring is correct (warn/error → plugin-log, guarded serialization, non-throwing sink), but the Rust plugin's `LogDir` target is `#[cfg(target_os = "macos")]`-gated, and Windows release builds use `windows_subsystem = "windows"` (no attached console) — so on the primary platform, warn/error land only in a detached stdout and the ephemeral webview console. A persistent keychain fault forcing endless re-sign-ins remains undiagnosable in prod; the commit message and code comment ("stdout + the on-disk log file") are inaccurate for Windows. Dev and macOS are genuinely fixed.
Fix: Remove the macOS gate on the `LogDir` target (or add a cross-platform file target) in lib.rs — one line.

**[LOW, new] Crash-mid-write now leaks un-swept orphan `.tmp` files**
Source agent: rust-reviewer
File: src-tauri/src/features/cloud_session/services/mod.rs:46–50
Issue: The unique-per-write temp name (correct fix for the race) means a crash between write and rename leaves an orphan that no startup sweep collects (grep confirms none exists); the old fixed name self-healed by reuse. Impact: a handful of ~4 KB files under a rare trigger — explicitly non-blocking.
Fix: Optional startup glob-sweep of `{cloud-config.json,session.vault}.*.tmp`, or accept with a note.

**[INFO, new, latent] Sign-out no longer disconnects realtime**
Source agent: database-reviewer
Issue: Removing `teardownSupabase()` from `signOut()` also removed the channel/socket teardown that used to run there. Inert in M1 (no channels exist); at M2, ensure channel cleanup happens on active→signed-out so a subscribed channel doesn't linger with a revoked token. Candidate for the deferred ledger.

**[INFO, new, latent] `getItem` of the `-user` sibling would trip the single-key loud-fail if `userStorage` is ever configured**
Source agent: database-reviewer (found while proving the ordering edge)
Issue: The no-op fix patched `removeItem` only, but auth-js `_recoverAndRefresh` (GoTrueClient.js:4016) can *getItem* `storageKey + '-user'` on main storage, and `getItem` still calls `assertSingleKey` unconditionally. Unreachable for this app: the guarding branch requires a stored session without `.user`, which `_saveSession` never writes when no `userStorage` is configured. Even if reached, it fails closed (caught at :4082 → treated as no session → re-sign-in; `boundKey` is not poisoned). Correctly left unpatched (YAGNI).
Trigger for the ledger: if any future work sets `auth.userStorage`, scope the `-user` no-op to `getItem` too (return null for an unbound sibling) — while keeping `setItem` of a genuinely new key loud-failing.

**[INFO, new, latent] The removeItem-ordering safety is pinned to auth-js 2.110.7's internal await order — an upgrade could silently destroy the session**
Source agent: silent-failure-hunter (found while proving the ordering edge)
Issue: The unreachability proof rests on `_removeSession` removing the main key (GoTrueClient.js:4325) before `-user` (4327) — an undocumented third-party implementation detail held in place only by the lockfile. If a future auth-js bump reordered those awaits (or added a cold init-time `-user` cleanup before the main read), the guard would bind `boundKey` to `-user` and `vaultClear()` the real session — silent session destruction, caught by no test today.
Options: a one-line defense-in-depth hardening (bind `boundKey` only in getItem/setItem, never in removeItem — plus one adapter test: `-user` removal as the first vault op does not call vaultClear), or defer with the natural trigger.
Trigger for the ledger: any `@supabase/auth-js` / `@supabase/supabase-js` version bump — re-verify `_removeSession` ordering or land the hardening then.

## Architecture invariants — re-verified clean

- Crypto, key lifecycle, T3 no-log, `NoEntry`-only creation: untouched by fixes, confirmed intact (rust).
- Atomic write: same-volume rename preserved; per-writer temp cleanup strictly better (rust + database).
- Cross-language fidelity: IPC surface untouched by all 8 commits; bindings remain aligned (type-design).
- Single-blob invariant: protective half (loud fail on second read/written key) intact and pinned (three lanes).
- i18n: 31 keys per locale, parity + interpolation preserved (typescript).
- Mock-seam honesty upgraded: the client module now has real-module coverage (pr-test-analyzer).

## Recommended next steps

1. **One mechanical commit before merge (recommended):** un-gate the `LogDir` target in `src-tauri/src/lib.rs` so Windows prod gets a log file — the only substantive remainder, and the platform the app ships on. Optionally fold in the orphan-tmp sweep or ledger it.
2. Add the three latent INFOs to `docs/code-reviews/deferred.md`: the realtime-teardown assumption (trigger: M2 `useCaseRealtime`), the `-user` getItem asymmetry (trigger: any future `auth.userStorage` configuration), and the auth-js ordering pin (trigger: any supabase-js/auth-js version bump — or take the one-line bind-only-on-read/write hardening now).
3. Otherwise **ready for merge** — all HIGHs/MEDIUMs closed with mutation-sound tests, deferrals justified, no regressions found by any lane.

## Reviewer pipeline notes

- **The cross-lane relay worked:** type-design's ordering heads-up (removeItem-before-bind) was forwarded mid-review to the database and silent-failure lanes; the database lane resolved it definitively against the installed auth-js source (`_removeSession` removes the session key first). Three lanes converged on "verified safe" from three different methods.
- **The real-module test mandate paid for itself twice:** it exposed the auth-js `-user` sign-out breakage (a production bug no mocked test could see), and its flipped #19 now guards against the teardown call ever returning.
- **Resume-based fix-delta remained cheap and faithful:** every reviewer referenced its own original wording and verified its own scenarios rather than re-deriving context.
