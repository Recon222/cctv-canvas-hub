# PR 10 — Aggregate Code Review

**PR:** [#10](https://github.com/Recon222/cctv-canvas-hub/pull/10) — feat(canvass): M7 — multi-window pop-outs (the final V1 milestone)
**Branch:** `feature/canvas-hub-m7` → `main`
**Cut / Phase:** M7 of 7 (phases 7.1–7.3 — the finale; a second OS window authenticated by a token pushed across the process boundary)
**Reviewers (fresh fan-out, all forced Opus):** rust-reviewer, typescript-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, database-reviewer (full six-lane surface)
**Date:** 2026-07-22

## Verdict

**REVISE.**

One HIGH, and it's a cross-milestone seam the PR did not flag: main pushes the session token to secondaries only on `TOKEN_REFRESHED`, but M6's unlock flow re-authenticates via `signInWithPassword` (a full new session firing `SIGNED_IN`, not a refresh), so after every routine lock→unlock a pop-out window is orphaned on the old token and goes stale within the hour. The milestone's security premise is sound — **all three load-bearing supabase-js library claims independently re-verified TRUE against installed 2.110.7**, and the token-crossing headline is proven — so this is a lifecycle gap, not a design failure, with a small fix. One MEDIUM (the self-flagged ended-window reopen divergence, from the JS-wiring angle, with two lanes converging against the PR's preferred fix direction) and several LOWs round it out.

## Pre-flight gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 352 passed, 0 failed (43 files) |
| `npm run rust:test` | 15 passed |
| `npm run build` | green (multi-entry; `dist/window.html` + `SecondaryRoot` chunk emitted) |
| `npm run check:all` (orchestrator re-run) | green, exit 0 |
| Pre-existing failures | none |

## Reviewer verdicts at a glance

| Lane | C | H | M | L | Verdict |
| --- | --- | --- | --- | --- | --- |
| rust-reviewer | 0 | 0 | 0 | 1 | APPROVE |
| typescript-reviewer | 0 | 0 | 1 | 0 | APPROVE w/ comments |
| pr-test-analyzer | 0 | 1 | 1 | 1 | REVISE |
| silent-failure-hunter | 0 | 0 | 0 | 0 | APPROVE (clean) |
| type-design-analyzer | 0 | 0 | 0 | 1 | APPROVE |
| database-reviewer | 0 | 1 | 0 | 0 | REVISE |
| **Deduped totals** | **0** | **1** | **1** | **3** | **REVISE** |

(H1 is a two-lane finding: database-reviewer found the production defect, pr-test-analyzer found the test that pins it as correct — same root cause, deduped to one HIGH. Raw lane HIGHs: 2 → 1 deduped.)

## Findings (deduped, ranked by severity)

### CRITICAL

None.

### HIGH

**H1 — Unlock re-auth mints a new token that is never propagated; the secondary rides the orphaned old token to expiry** _(database-reviewer; orchestrator-confirmed by direct read; test-analyzer confirmed a false-confidence pin protecting it)_
`src/lib/supabase/client.ts:63-68`
Main pushes `session-token` only on `TOKEN_REFRESHED`. Verified against installed auth-js 2.110.7: routine refresh fires `TOKEN_REFRESHED` (GoTrueClient `:4985`), but `signInWithPassword` fires `SIGNED_IN` (`:1252`). The unlock flow is a full re-auth — `LockOverlay.tsx:170` → `reauthenticate()` → `authService.ts:147` `signInWithPassword` — minting a **new session S2** whose token is never pushed; `unlock()` broadcasts only `session-unlocked` (no token).

**Concrete routine scenario:** operator locks the kiosk with a secondary board open on a wall display → during lock main keeps pushing `TOKEN_REFRESHED` (secondary holds the freshest S1 token) → operator unlocks by typing the password → S2 is minted, `SIGNED_IN` fires, main ignores it → the secondary rides S1's orphaned token, which main no longer refreshes → when S1's token hits `exp`, the secondary's REST refetches 401/403 and its socket drops. The board is stale/disconnected for up to ~56 min (avg ~28) until S2's first autoRefresh. The health machine degrades honestly (so not *silent* — see silent-failure-hunter's hunt #3), but a wall board non-functional for ~an hour after every unlock is a HIGH functional defect.

**Orchestrator verification:** confirmed `client.ts:65` gates on `TOKEN_REFRESHED` only, `authService.ts:147` uses `signInWithPassword`, and `session-store.ts` `unlock()` emits no token.

**Fix (small):** push on the full rotation class —
```ts
if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED') && token !== undefined) {
  pushSessionToken(token)
}
```
`SIGNED_IN` at initial sign-in is harmless (no secondaries exist yet). Update `supabase-integration.md` (which faithfully documents the current incomplete behavior). **And flip the test that protects the bug:** test #138 currently pins "SIGNED_IN pushes nothing" as *desired* (test-analyzer's mutation battery confirms it) — that is a false-confidence pin locking in this exact defect; the fix must change #138 to assert `SIGNED_IN`/`USER_UPDATED` **do** push.

### MEDIUM

**M1 — Ended pop-out windows persist and the rail reopen focuses the dead window (the self-flagged finding), with `openViewCases` never cleared on sign-out** _(typescript-reviewer wiring angle: MEDIUM; silent-failure-hunter: LOW/no-data-risk verified; pr-test-analyzer: the revival guard is untested; deduped at MEDIUM)_
`src/features/canvass/services/viewWindows.ts:22,72-75` · `SecondaryRoot.tsx:88,106-127` · `CanvassRoot.tsx:91-99`
After sign-out → re-sign-in, an ended pop-out still shows the terminal screen, and clicking the rail pop-out takes `open_view_window`'s focus-if-open path and focuses the dead window instead of creating fresh. Main's rail flag resets on sign-out, but the module-level `openViewCases` map (and the Rust window registry) do not — they clear only on the Rust `view-window-closed` *destroy* event, which sign-out does not trigger (it drives the `'ended'` terminal screen, not a destroy).

**No data risk (silent-failure-hunter, verified):** the dead window is fully torn down — `teardownSecondaryClient` nulls client/token/holder before its fallible I/O, `resetCanvassStore`/`resetHealthStore`/`removeQueries` purge operator-A's case-data (including the `['cases']` list key), and `endedRef` synchronously blocks any re-pushed token from reviving. It cannot leak or resurrect with stale data — which is why it's MEDIUM, not HIGH.

**Two lanes converge against the PR's preferred fix.** The PR proposes fix (a) "re-push token + re-bootstrap the ended SecondaryRoot" (its "plan-faithful" choice) or fix (b) "close-on-sign-out." **Both silent-failure-hunter and typescript-reviewer independently reject (a) and recommend (b):**
- _(typescript)_ (a) cannot work against the current hook — the ended `SecondaryRoot` sets `endedRef` and never resets it, so a re-pushed token is silently ignored, and its listeners never tear down (cleanup only runs on unmount, which never happens for a still-open window).
- _(silent)_ (a) reintroduces two hazards the fresh-boot handshake eliminates by construction: the `setAuth-before-subscribe` ordering, and — the sharp one — a **stale-case cross-operator seed** (`openViewCases` is never cleared on sign-out, so (a)'s revival re-handshakes against a registry that could seed operator A's `caseId` into operator B's revived context).

**Fix (b):** the secondary self-closes on `session-ended` (call the Rust close command after `teardownSecondaryClient`), paired with a direct registry reset (`resetViewWindows()` clearing `openViewCases` + `poppedViews`) called from `signOut()` — not via `view-window-closed`, because the bridge has already unmounted. Reopen then always builds a fresh, correctly-sequenced window. **Also add the untested `endedRef` arm** (pr-test-analyzer M2): fire `session-ended`, then a `session-token`, assert phase stays `'ended'` + case-dashboard null + `initSecondaryClient` not re-called — MUT11 removed the guard and the suite stayed green, so a regression of the revival-prevention guard would ship uncaught.

### LOW

- **L1 — Redundant `core:event:allow-emit`** _(rust-reviewer)_: `view-windows.json` grants it, but `core:event:default` already includes allow-emit. Harmless, mirrors the quick-pane precedent. No change needed.
- **L2 — `PopOutView` is a hand-maintained duplicate of the generated `ViewWindow`** _(type-design-analyzer)_: byte-exact today (enum closed at two variants), but the Rust→TS `view-window-closed` event is the drift vector — a future third Rust variant would arrive as a typed lie with no tsc error. Optional fix: alias `PopOutView` to the generated `ViewWindow` (surface it through the tauri-bindings barrel first); `poppedViews: Record<ViewWindow, boolean>` then becomes an exhaustiveness error on any variant add.
- **L3 — #117's "teardown before the ended screen" comment overclaims** _(pr-test-analyzer)_: MUT2 (setPhase before teardown) stayed green — no `invocationCallOrder` pins the ordering, though the behaviorally-meaningful parts (purge, teardown-called, board-gone) are all pinned. Add an order assertion or soften the comment. Optional.

## Architecture invariants checked & confirmed

- **The three load-bearing supabase-js claims — all independently re-verified TRUE against installed 2.110.7** (database-reviewer, the milestone's crux): (1) the `accessToken` callback feeds REST + storage + realtime via one shared `fetchWithAuth` — no anon path; (2) `auth.*` is a throwing Proxy when `accessToken` is set (no GoTrue, no ticker, no vault — the proxy is the enforcement, not discipline); (3) the constructor's `realtime.setAuth(token)` sets `_manuallySetToken`, gating off every internal refresh path, so `updateSecondaryToken`'s explicit `setAuth` is genuinely the only rotation channel. The whole milestone's premise holds. (test-analyzer corroborated #114–116 run against real supabase-js with stubbed fetch.)
- **Rust window feature clean** (rust-reviewer): both commands `async fn` (the WebView2 deadlock CRITICAL) with no re-blocking; the double-open race arm destroys only a genuine focus-dead corpse (on Windows `set_focus` Err means a corpse, not transient); the T9 capability is minimal (secondaries inherit none of main's fs/dialog/create-webview); no panic path.
- **Secondary is genuinely vault-free and data-isolated** (database-reviewer + silent): zero runtime vault/keyring/getSession/refreshSession references (only doc comments); the per-context `session-ended` purge removes every case-data family including the DVR-credential-bearing `form_data` rows; per-window QueryClient singleton; operator-A rows cannot survive into an operator-B context.
- **setAuth-before-subscribe honored** (database-reviewer): `initSecondaryClient` runs before the board (and its subscription) mounts; even in the pre-`_manuallySetToken` microtask the callback returns the installed token, so the first join authenticates with the real bearer, never anon.
- **Handshake has no silent-hang path** (silent-failure-hunter): listeners attach first (via `Promise.all`) then `emitSecondaryReady`; a 10 s `SECONDARY_BOOT_TIMEOUT_MS` flips every failure path (lost ready, signed-out main, attach reject, init throw) to a *signalled* `timeout` screen; test-analyzer's MUT10 proves `invocationCallOrder` catches a listener-attach-after-emit regression (the mock does not paper over the unbuffered race).
- **Token can't outlive its session** (silent-failure-hunter): `session-ended` awaits teardown before the terminal screen; `endedRef` + JS single-threading block a `session-token` racing `session-ended`; the swallowed `updateSecondaryToken` setAuth failure surfaces on two independent honest planes (channel `onStatus` → reconnecting + the 35 s reconcile 403 + the 90 s stale floor — the M5/PR#8 stale-floor fix is now load-bearing for secondary honesty).
- **The L3 flyTo fix doesn't regress main** (typescript-reviewer): `cameraPadding` now threads `map.getContainer().clientWidth`; main's full-window container ≈ `window.innerWidth` (the old source), and the `boardWidth > 0 ? … : 1` guard preserves the default. Closes the PR #6 L3 ledger item.
- **No import cycle, correct barrels** (typescript-reviewer): `client.ts` never imports the canvass barrel; `LanguageSync` uses the `@/features/preferences` barrel hook; the view-context half lives in a canvass service to avoid the client→barrel cycle.
- **Lock parity via `setState` not `lock()`** (typescript-reviewer): the secondary seeds its own locked state without re-broadcasting — no cross-window echo loop.
- **Counts reconcile** (test-analyzer): 137 → 140 genuine (+3 R8 #138–140), #135 amended in place per L3; cargo stays 15 correctly (the `ViewWindow` methods are trivial 2-variant mappings, correctly not extracted to a workspace crate). Flake 0/30 on the handshake suite.
- **Type contracts sound** (type-design-analyzer): `ViewWindow` four-derive + total methods; view+caseId pairing constructor-guarded at NavRail; the nullable `accessToken` return is library-accepted (`accessToken?: () => Promise<string | null>` in installed 2.110.7).

## Recommended next steps

1. **H1 (the REVISE gate)** — one small change: push `session-token` on `SIGNED_IN`/`USER_UPDATED` too; flip test #138 to assert they push; update the doc. This is the whole reason for REVISE.
2. **M1** — take **fix (b)** (secondary self-close on `session-ended` + `resetViewWindows()` in `signOut()`), NOT the PR's preferred fix (a) — two lanes independently showed (a) reintroduces the ordering hazard and a cross-operator seed. Add the `endedRef` test arm to #117.
3. **L1/L3** — optional (no change / comment softening). **L2** — optional tightening worth taking as the last-ever type hardening on this project (the `ViewWindow` alias makes the pop-out surface drift-proof).
4. Fix round → mapping comment → `--fix-delta` before merge. H1 and M1 are both on the highest-stakes surface (cross-process auth) — each warrants its own test arm (H1: the unlock-propagation path, currently uncovered; M1: the `endedRef` arm).

## Agent IDs

<!-- Used by /react-tauri-rust-code-review --fix-delta to resume reviewers via SendMessage. Names are session-scoped: resumable by name within the originating session; a new session must fresh-dispatch. -->

- rust-reviewer: `pr10-rust`
- typescript-reviewer: `pr10-ts`
- pr-test-analyzer: `pr10-tests`
- silent-failure-hunter: `pr10-silent`
- type-design-analyzer: `pr10-types`
- database-reviewer: `pr10-db`

## Reviewer pipeline notes

- **The HIGH is a cross-milestone integration seam no single-file read would find** — it lives in the gap between M6's unlock (`signInWithPassword` → `SIGNED_IN`) and M7's propagation (`TOKEN_REFRESHED` only). The database lane found it by tracing the auth-event lifecycle against installed auth-js rather than reviewing the changed lines in isolation, then the test lane independently showed the suite *protects* the bug (#138 pins the buggy behavior as desired) — the single most valuable cross-lane interaction of this review: one lane finds the defect, another shows the tests would keep it. Flip #138 as part of the fix.
- **Two lanes converged against the PR's stated preferred fix (a) for M1** from different angles (endedRef guard blocks revival; stale-registry cross-operator seed) and both recommended fix (b). When a PR routes a fix-mechanism choice to the review, that convergence is the answer — take (b).
- **The three-claim installed-source re-verification is the model for reviewing a design that rests on library behavior** — database + test-analyzer both exercised real supabase-js 2.110.7, so the "populated secondary" smoke evidence is backed by mechanism, not coincidence. This project's supabase-js assumptions were wrong three times earlier; re-verifying paid off (the claims held this time, and the HIGH turned out to be in the app's own lifecycle wiring, not the library).
- **silent + M5 connection:** the secondary's honesty on a dead socket rides entirely on the M5/PR#8 stale-floor health fix (the one that flapped and got hardened). A milestone's fix becoming load-bearing for a later milestone's correctness is worth noting for the final V1 retrospective.
- **Discipline note:** pr-test-analyzer reverted its 13-mutation battery via `git checkout --` rather than inverse edit. No harm this round — type-design-analyzer ran *no* probes (its only finding needed none), so there was no concurrent-mutation overlap, and the orchestrator verified the tree clean at `ca89417` before the gate run. Restate the inverse-edit rule in the fix-delta brief regardless; the rule exists for the rounds where two lanes mutate at once.
- Six of six lanes needed the idle-without-report nudge; recovery-by-name held at 100%.
