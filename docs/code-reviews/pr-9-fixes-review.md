# PR 9 — Fix Delta Review

**PR:** [#9](https://github.com/Recon222/cctv-canvas-hub/pull/9) — feat(canvass): M6 — kiosk hardening (idle lock, wake catch-up, ProcessPanel port)
**Scope:** Fix delta only — re-review of the 5 commits landed in response to the initial review (`pr-9-review.md`).
**Reviewers (resumed via SendMessage, full transcript context):** rust-reviewer, typescript-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, database-reviewer (full six-lane surface)
**Date:** 2026-07-22

> **For the implementing instance:** This document is self-contained. You do not need to reread `pr-9-review.md`.

## Verdict

**APPROVE.**

All three graded findings are closed at the level that matters, each with mutation-verified coverage and a passing live re-smoke (real F5 + full cold relaunch both return LOCKED; whole-window `inert`; no false sign-out on a CDP-blocked wake). The fix round introduced no new HIGH/MEDIUM. Two LOW residuals remain — one accepted tradeoff (the H1 persist-write-failure edge) and one genuinely-new-but-narrow gap the `inert` mechanism inherently can't reach (a Preferences dialog left open when the lock fires portals outside the inert shell). Both are optional; neither blocks merge. PR #9 is ready.

## Pre-flight gates (re-verified after fixes)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 332 passed, 0 failed (41 files; +6 supporting arms) |
| `npm run rust:test` | 15 passed (unchanged — the `locked` field added no `#[test]`) |
| `npm run check:all` (orchestrator re-run) | green, exit 0 |
| Working tree at review end | clean, HEAD `5ed1d8c` |

## Fix commit → original finding mapping

| Commit | Original finding | Type of fix | Verdict |
| --- | --- | --- | --- |
| `d5345db` | **H1** idle lock not durable — reload/relaunch escapes to `active` (HIGH — the REVISE gate) | Persist a `locked` flag in `cloud-config.json` (`#[serde(default)]`, one write home via the store actions, cleared on sign-out); `bootstrap()` branches `config.locked ? 'locked' : 'active'` after the gate. Closes the keyboard-free relaunch door, not just F5. Two red-first arms | **CLOSED** (LOW residual) |
| `5103624` | **M1** lock overlay covers only the content region + no focus containment (MEDIUM, two facets) | Overlay hoisted to the `MainWindow` shell (covers the TitleBar); whole shell `inert={locked}` (React 19 native); overlay a SIBLING outside the inert subtree. One mechanism closes both the titlebar-toggle click-through and the keyboard-reachability. Structural red-first arm + live-smoke behavioral leg | **CLOSED** (LOW portal residual) |
| `984b55c` | **M2** wake blip → false sign-out (MEDIUM) · **L2** catchUp broad catch | New `'deferred'` freshness state: `isNetworkAuthError` (network/0/429/5xx) → stay put and retry; only `invalid_grant` (4xx) → `'failed'` → sign-out. `catchUp`'s outer catch is now log-only. Both red-first | **CLOSED** |
| `8506fc0` | **L3** 429 misclassified · **L10** allow-list membership unpinned · **L9** doc accuracy | 429 → unreachable (shared classifier); membership loop pins exactly the 5 window ids; the two `supabase-integration.md` corrections; D19 ledger updated + D20 added | **CLOSED / deferred** |
| `5ed1d8c` | doc mirror | #106 spec-row amended in place for M2's freshness change | **CLOSED** |

## Reviewer verdicts at a glance (fix delta)

| Lane | Own findings closed | New findings | Verdict |
| --- | --- | --- | --- |
| silent-failure-hunter | H1 ✓ M1 ✓ M2 ✓ | 2 LOW (persist-edge accepted; Prefs-over-lock portal) | APPROVE |
| pr-test-analyzer | H1 ✓ M1 ✓ L10 ✓ | 0 | APPROVE |
| database-reviewer | M2 ✓ L2 ✓ L3 ✓ L9 ✓ (+ D19 adjudicated) | 0 | APPROVE |
| typescript-reviewer | M1 ✓ (L1/L6 → D20) | 0 | APPROVE |
| type-design-analyzer | (L4/L5 → D20) | 0 | APPROVE |
| rust-reviewer | (config field re-check) | 0 | APPROVE |

## Closed findings — verification detail

- **H1 (silent + test-analyzer + rust + orchestrator):** persist has ONE home (store actions — idle timer, palette, overlay unlock all route through it); `signOut` clears the flag on the one exit that skips `unlock()` (so a stale `locked:true` can't survive into the next sign-in); `#[serde(default)]` confirmed literally present so pre-M6 config parses `false` (the honest direction — an old file predates locking); rides the existing `atomic_write` `save_config` (no partial-flag corruption of the enrollment url+key). Bootstrap gate still precedes the locked branch, so a `locked:true` config with no valid session lands in `signed-out`, never a passwordless limbo. **Mutation-verified:** revert bootstrap to unconditional `active` → reds; drop the persist call → reds. Live-smoke: real F5 AND full cold process relaunch both return LOCKED.
- **M1 (typescript + silent + test-analyzer):** `inert={locked}` on the whole shell kills pointer AND keyboard for every direct-store control (titlebar toggles, NavRail, MonitorToggle, zoom); overlay sibling outside the inert subtree keeps its own input live; React 19 boolean coercion confirmed (`inert={false}` omits the attribute). **Mutation-verified structural pin** (remove `inert` → reds) with the browser's actual pointer/focus blocking honestly scoped to the live-smoke leg — the arm asserts containment, not a click jsdom couldn't evaluate. Live-smoke: titlebar toggles no-op, Tab cycles only password→sign-out.
- **M2 + L2 (database + silent + test-analyzer):** classifier verified arm-by-arm against installed gotrue 2.110.7 — offline (status 0) and 5xx → `deferred`; `invalid_grant` (400) and `session_not_found` (`AuthSessionMissingError`, 400) → `failed`→sign-out (the dead-session paths still travel to sign-out). The one live path the harm lived in (gotrue's proactive-preserve edge) is confirmed closed. No dangerous latch: while unreachable nothing is fetched behind the token, so `deferred` can't hide a dead session serving data. No new race (gotrue single-flights + 60 s failure cooldown). L2: outer catch log-only, sign-out keys off explicit `'failed'`. **Mutation-verified both directions** (blip→failed reds; invalid_grant→deferred reds; remove setAuth try/catch reds the hiccup arm).
- **L3 / L10 / L9 (database + test-analyzer):** 429 → unreachable via the shared classifier without swallowing real 4xx refusals; membership loop reds when `session-sign-out` is leaked into the allow-list; the two doc inaccuracies corrected and verified against installed sources.

## Deferral justifications — verification detail

- **D19 (LOW/accept)** — ledger rewritten to match the adjudication: bound ≤ access-token TTL (~1 h); no admin path pushes a socket disconnect; the genuinely-silent membership-revoked sub-case recorded with the same bound; inherent to stateless-JWT + agency-wide reads, not introduced by M6; only faster-revocation lever is a shorter server-side TTL. Both silent and database reached this independently.
- **D20 (new consolidating row)** — carries L1 (catchUp no dedup — benign, "if a wake-storm is observed"), L4 (`ProcessPanelRow.lane` vestigial — "next panel touch"), L5 (`VaultStatus` coupling — "next touch"), L6 (`ansiParser` test-only — knip note), L7 (wedged log-tail — optional watchdog), L8 (`vaultGet` on focus — conscious trade). Each has a pick-up trigger. Verified present and specific.

## New findings introduced by / surfaced during the fixes

**N1 [LOW] — H1 persist-write-failure edge (accepted tradeoff)** _(silent-failure-hunter)_
`persistLockedFlag` is fire-and-forget with a log-only `.catch`. If `lock()` flips in-memory but the disk write fails AND a reload lands before any later successful persist, bootstrap reads the stale `locked:false` and restores to `active` — the H1 escape reappears. Compound-rare (write-failure ∩ reload-in-window ∩ first-lock-after-active). **Accept:** fire-and-forget is correct (the wall must go up instantly; blocking it on a disk write would be worse), `atomic_write` rules out a corrupt-flag case, and an unattended kiosk can't act on a toast anyway. No better fix that doesn't make the common path worse.

**N2 [LOW] — A Preferences dialog left open when the lock fires escapes the inert shell** _(silent-failure-hunter; orchestrator-confirmed)_
`inert` does not cross React portals. `PreferencesDialog` (shadcn/Radix `Dialog`, portals to `document.body`) is gated only on `preferencesOpen`; there is no close-on-lock effect (orchestrator grep confirmed — `'locked'` appears only in MainWindow's inert selector and the mount gate). If a dialog is open when the idle lock fires, it floats over the overlay and its Save path is a plain TanStack mutation, *not* dispatcher-gated → an editable+savable config surface (theme, language, mapbox token, `idle_lock_minutes`) behind the "wall." Narrow precondition (operator opens Preferences, walks away for the full timeout), config-only, no case-data/auth reach — and it predates the fix (a body-portalled dialog floated over the old content-region overlay too). **Cheap fix worth taking on a hardening PR:** one effect that dismisses transient overlays (`setPreferencesOpen(false)` + `setCommandPaletteOpen(false)`) on `state → locked`. Ship-or-defer is a judgment call; if deferred, add a D20 row with the trigger.

## Architecture invariants — re-verified clean

- `#[serde(default)]` back-compat confirmed by two lanes (rust + type-design); `locked` rides the existing atomic `save_config`, no new write path, bindings faithful (`locked?: boolean`).
- `SessionFreshness` extended cleanly — `'deferred'` has its own explicit branch before the fall-through, never swallowed as `'failed'` or `'fresh'` (type-design + typescript). Single producer, single consumer.
- The `inert` mechanism composes with the untouched overlay pointer-wall (harmless double-coverage); `MainWindowContent` correctly dropped its now-unused `relative` (typescript).
- Counts reconcile three ways: 326 + 6 = 332; the 7th changed `it()` is a rename (#106 `…fails`→`…refused`, net-zero); L3's 429 is an assertion inside existing #103; numbered still 137; cargo unchanged at 15 (test-analyzer).
- Flake 0/15 on both H1-durability timer files; tree clean at HEAD after all mutations (test-analyzer).

## Recommended next steps

**Ready for merge** — owner's specs: `gh pr merge 9 --merge --delete-branch`, then `git checkout main && git pull && git fetch --prune`. This artifact is the last uncommitted review record — commit it with or before the merge.

Two optional LOWs the owner may fold in or defer:
- **N2** (Prefs-over-lock) is the one worth closing on a kiosk-hardening milestone — one effect, closes the sole gap `inert` can't reach. If deferred, ledger it (D20).
- **N1** (persist-edge) is a genuine accept — recommend a one-line D20/D19-adjacent note recording the tradeoff so a future reader doesn't re-discover it as a bug.

**Next: M7** — the final milestone (multi-window / quick-pane topology; reread doc 01 §A1/A2). D18 still open (fires at first `exportInformation` consumption); D20 carries the deferred LOWs.

## Reviewer pipeline notes

- **The fix round closed a real HIGH cleanly and the delta caught what the fix couldn't reach** — N2 is the model case for why a fix-delta re-hunts rather than just re-checking: the `inert` fix is correct and complete *for the DOM subtree*, and only an adversarial "what escapes the subtree?" sweep finds the portal gap. Silent asked the right follow-up question of its own fix.
- **The persist-failure edge (N1) is the orchestrator's planted doubt landing as an accepted tradeoff** — the right outcome for a fire-and-forget durability write: name it, reason about the alternative (blocking the lock on I/O is worse), accept with a ledger note. Not every planted doubt is a finding; some are confirmations that the tradeoff was made consciously.
- **The test lane's honesty on the M1 pin** (mutation-catchable containment assertion + named live-smoke behavioral leg, explicitly "not assertion-of-a-prop theater") is exactly the calibration this project's jsdom-boundary precedent asks for — it neither overclaims jsdom coverage of `inert` nor dismisses the structural pin as worthless.
- **Two independent installed-source verifications of the M2 classifier** (silent behaviorally, database against gotrue error classes arm-by-arm) — the kind of redundancy that has been decisive on this project's auth surface three times.
- Full six-lane resume, all six needed the idle-without-report nudge; recovery-by-name held at 100%.
