# PR 10 — Fix Delta Review

**PR:** [#10](https://github.com/Recon222/cctv-canvas-hub/pull/10) — feat(canvass): M7 — multi-window pop-outs (the final V1 milestone)
**Scope:** Fix delta only — re-review of the 3 commits landed in response to the initial review (`pr-10-review.md`).
**Reviewers (resumed via SendMessage, full transcript context):** rust-reviewer, typescript-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, database-reviewer (full six-lane surface)
**Date:** 2026-07-22

> **For the implementing instance:** This document is self-contained. You do not need to reread `pr-10-review.md`.

## Verdict

**APPROVE.**

The HIGH (unlock re-auth token not propagated) is closed with the complete rotation class — verified against the full installed `AuthChangeEvent` enum — and the test that used to *pin the bug as correct* (#138) is flipped and now red-first. The MEDIUM (ended-window divergence) took **fix (b)** as two lanes recommended over the PR's stated preference, closing the cross-operator seed structurally. Both LOWs are fixed (the `PopOutView` alias's exhaustiveness is proven by probe). One narrow residual LOW noted (self-close behind an unlikely IPC failure) — optional, not a gate. This is the last milestone of V1; it is ready for merge.

## Pre-flight gates (re-verified after fixes)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 356 passed, 0 failed (43 files; +4 supporting arms) |
| `npm run rust:test` | 15 passed (no Rust changed) |
| `npm run build` | green (multi-entry) |
| `npm run check:all` (orchestrator re-run) | green, exit 0 |
| Working tree at review end | clean, HEAD `2fe9718` |

## Fix commit → original finding mapping

| Commit | Original finding | Type of fix | Verdict |
| --- | --- | --- | --- |
| `b9665e7` | **H1** unlock re-auth token not propagated (HIGH — the REVISE gate; found by db + tests) | Push on `TOKEN_REFRESHED \|\| SIGNED_IN \|\| USER_UPDATED` (`SIGNED_OUT` stays silent); **test #138 flipped** to assert the class pushes; real-`signInWithPassword` unlock rider added; doc corrected | **CLOSED** |
| `ab2358b` | **M1** ended-window divergence (MEDIUM; the self-flagged finding) · **L3** #117 ordering comment | **Fix (b)** — secondary self-closes via `commands.closeViewWindow` after teardown+purge+`setPhase('ended')`; `resetViewWindows()` clears `openViewCases` + `poppedViews` from CanvassRoot's session-exit unmount; `endedRef` arm + deferred-teardown ordering rider added | **CLOSED** (1 optional residual LOW) |
| `2fe9718` | **L2** `PopOutView` hand-duplicate | Aliased to the generated `ViewWindow` via the tauri-bindings barrel — exhaustiveness proven by probe | **CLOSED** |

## Reviewer verdicts at a glance (fix delta)

| Lane | Own findings closed | New findings | Verdict |
| --- | --- | --- | --- |
| database-reviewer | H1 ✓ | 0 | APPROVE |
| pr-test-analyzer | H1(#138) ✓ M1(endedRef) ✓ L3 ✓ | 0 | APPROVE |
| silent-failure-hunter | M1 ✓ (gave the fix-b rec) | 0 (1 optional residual noted) | APPROVE |
| typescript-reviewer | M1 ✓ (gave the fix-b rec) | 0 | APPROVE |
| type-design-analyzer | L2 ✓ | 0 | APPROVE |
| rust-reviewer | (self-close reuse re-check) | 0 | APPROVE |

## Closed findings — verification detail

- **H1 (database + test-analyzer):** the rotation class is complete against the full `AuthChangeEvent` enum — `SIGNED_IN` (the unlock path, GoTrueClient `:1252`), `USER_UPDATED`, `TOKEN_REFRESHED` all covered; `INITIAL_SESSION` correctly excluded (the handshake covers a fresh secondary, no double-push); `PASSWORD_RECOVERY`/`MFA_CHALLENGE_VERIFIED` are token-bearing but unreachable in V1 (no reset/OTP/MFA calls, `detectSessionInUrl:false`) — a forward-looking breadcrumb only. `SIGNED_OUT` stays silent (D19 preserved). The end-to-end unlock path closes (push → `emitSessionToken` → secondary `updateSecondaryToken` → `realtime.setAuth`), and the mid-handshake race is unreachable (locked main is `inert`). **Test #138 flipped and red-first** (revert to `TOKEN_REFRESHED`-only → reds), and the unlock rider drives a *real* `signInWithPassword` grant (not a synthetic event), pinning the M6→M7 seam end to end. (Honest note from the test lane: the SIGNED_OUT-silent arm is inert — guaranteed by the `token !== undefined` null-token check, not the event filter — no realistic regression to miss.)
- **M1 (silent + typescript + test-analyzer):** fix (b) taken as recommended. The cross-operator seed is structurally eliminated — `resetViewWindows` fires on every active/locked exit via `MainWindowContent`'s mount condition, and no session-end path both holds an open pop-out and leaves `CanvassRoot` mounted (silent). The `resetViewWindows` placement in CanvassRoot's unmount (not `signOut()`) is verified cycle-free (the `authService→viewWindows→barrel→authService` cycle would otherwise exist), fires on the right boundary, and can't spuriously clear (no StrictMode, view transitions don't remount CanvassRoot) (typescript). The self-close runs strictly after teardown, checks its result, and the double-clear/native-✕/lock-superseded races all resolve idempotently (silent + rust). **Red-first arms:** skip `closeViewWindow` → #117 self-close reds; no-op `resetViewWindows` → reopen-fresh reds; MUT11 (drop `endedRef`) → the revival-guard arm reds; MUT2 (setPhase before teardown) → the L3 ordering rider reds.
- **L2 (type-design):** `PopOutView = ViewWindow` (the generated type via the barrel) — exhaustiveness **proven by probe**: adding a `'diagnostics'` variant reds tsc at four construction sites plus a bonus `CanvassView` rejection; reverted by inverse edit, tree clean. The Rust→TS drift vector is closed — a future variant is a compile error, not a typed lie.
- **Rust self-close reuse (rust):** no Rust changed; the secondary self-destroying via the async `close_view_window` is safe (runs on the tokio pool, `destroy()` posts a teardown message, main-handle emit fires once, self+main race resolves idempotently via the `Some(window)` guard).

## New findings introduced by the fixes

None. One **optional residual LOW** (silent-failure-hunter): if the secondary's IPC self-close *genuinely fails* (not "already gone" — that's `Ok`; only a true IPC error), the window lingers on the ended screen and the original M1 focus-dead-window wart could recur on re-sign-in — now gated behind an unlikely, logged failure with zero data risk (token discarded, cache purged, `endedRef` blocks revival). Strictly narrower than the original M1. **Optional belt-and-braces:** have main also call `closeViewWindow` for both views on session exit, so closure doesn't depend solely on the secondary's IPC succeeding. Not required for merge; a candidate D-ledger row if deferred.

## Architecture invariants — re-verified clean

- The three load-bearing supabase-js mechanisms (accessToken → REST+storage+realtime, throwing auth proxy, `_manuallySetToken` gate), the per-context purge, the vault-free property, and setAuth-before-subscribe — all untouched by the fix round and remain verified (database).
- No import cycle from the L2 barrel surfacing or the `resetViewWindows` placement (typescript + type-design).
- Counts reconcile: 356 = 352 + 4 supporting arms (itemized: unlock rider + reopen-fresh + endedRef + deferred-teardown); numbered stays 140; #138 flipped in place, self-close is an assertion inside #117 (test-analyzer). Multi-entry build still green.
- Tree clean at HEAD after the full mutation battery; reverts by backup-copy this round (discipline note honored).

## Recommended next steps

**Ready for merge** — owner's specs: `gh pr merge 10 --merge --delete-branch`, then `git checkout main && git pull && git fetch --prune`. This is the **final V1 milestone** — with the merge, all seven milestones (M1–M7) are complete. This artifact is the last uncommitted review record; commit it with or before the merge.

Optional before or after merge:
- The self-close-IPC-failure residual LOW (main-side belt-and-braces close on session exit) — one small addition or a D-ledger row.
- The PR noted a re-smoke of the two auth paths (token-pushed-on-unlock; reopen-builds-fresh) was pending at fix-submission — worth confirming it ran green, since jsdom pins the wiring but the live cross-process behavior (real second OS window taking the fresh token after unlock) is live-smoke territory. The code-level mechanism is verified sound by all six lanes.

## Reviewer pipeline notes

- **The finale's HIGH was a two-lane find and a two-lane close:** database found the production defect and confirmed the complete rotation class against installed auth-js; test-analyzer found the test that pinned the bug and confirmed the flip is red-first with a *real* `signInWithPassword` rider. Find-and-protect on the way in, fix-and-flip on the way out — the cleanest demonstration of why the test lane re-runs mutations on a fix delta rather than trusting the diff.
- **Two lanes recommended fix (b) over the PR's preferred fix (a), and the implementer took (b)** — the fix-delta then confirmed (b) closes the cross-operator seed that made (a) dangerous. When a PR routes a fix-mechanism choice to the review, the convergent recommendation is the answer, and taking it produced a clean close.
- **The L2 probe is the model for a type-hardening fix-delta:** don't just confirm the alias compiles — simulate the drift (add a variant) and prove the compile error appears at every construction site. The exhaustiveness claim is only worth as much as the probe that demonstrates it bites.
- Six of six lanes needed the idle-without-report nudge across both rounds; recovery-by-name held at 100% throughout the M7 cycle. That closes the project's review pipeline: ten PRs, every cycle closed with evidence.
