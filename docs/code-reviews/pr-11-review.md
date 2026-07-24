# PR 11 — Aggregate Code Review

**PR:** [#11](https://github.com/Recon222/cctv-canvas-hub/pull/11) — fix(cloud-session): ensureFreshSession wrongly signs out on a retryable wake error (post-V1 sweep HIGH)
**Branch:** `fix/ensure-fresh-session` → `main`
**Cut / Phase:** Post-V1 remediation (the one HIGH a 16-lane Fable sweep found surviving all ten reviewed PRs)
**Reviewers (fresh fan-out, all forced Opus):** typescript-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, database-reviewer. rust-reviewer not dispatched — zero `.rs` surface.
**Date:** 2026-07-23

## Verdict

**REVISE.**

The PR's core fix — the `ensureFreshSession` defer/fail split that stops signing out an unattended kiosk after a long outage — is **verified sound, correct, and recoverable by all five lanes** (the classification tightens the type story, all four installed-auth-js premises hold including refresh-token preservation, and the gap-closing test is mutation-red). But the PR's *coupled* second change — clearing the persisted lock flag on sign-in — introduces a HIGH: the new fire-and-forget `setLockedFlag(false)` and the pre-existing email-persist block are two concurrent read-modify-writes on the same `CloudConfig` record, and the last-writer-wins interleaving silently re-strands `locked:true`, nondeterministically defeating the PR's own secondary goal. Three lanes independently confirmed it and the orchestrator verified it by direct read; the fix is a one-line structural change (fold both mutations into a single load-modify-save).

## Pre-flight gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 359 passed, 0 failed |
| `npm run rust:test` | 15 passed (no `.rs` changed) |
| `npm run check:all` (orchestrator re-run) | green, exit 0 |
| Pre-existing failures | none |

## Reviewer verdicts at a glance

| Lane | C | H | M | L | Verdict |
| --- | --- | --- | --- | --- | --- |
| typescript-reviewer | 0 | 1 | 0 | 0 | REVISE |
| database-reviewer | 0 | 1 | 0 | 1 | REVISE |
| silent-failure-hunter | 0 | 1 | 0 | 1 | REVISE |
| pr-test-analyzer | 0 | 0 | 0 | 1 | APPROVE w/ comments |
| type-design-analyzer | 0 | 0 | 0 | 0 | APPROVE (clean) |
| **Deduped totals** | **0** | **1** | **0** | **2** | **REVISE** |

(H1 is a three-lane finding — ts found it, db + silent independently concurred, pr-test-analyzer confirmed zero coverage. Raw lane HIGHs 3 → 1 deduped.)

## Findings (deduped, ranked by severity)

### CRITICAL

None.

### HIGH

**H1 — `setLockedFlag(false)` races the email-persist read-modify-write on the same `CloudConfig` record; the lost update re-strands `locked:true`** _(typescript-reviewer found it; database-reviewer + silent-failure-hunter independently concurred; pr-test-analyzer confirmed it is untested; orchestrator-confirmed by direct read)_
`src/features/cloud-session/services/authService.ts:34` (new, fire-and-forget) racing `:39-46` (pre-existing email persist) · `src/features/cloud-session/services/configService.ts:61-67` (the RMW)
`signIn` now dispatches `setLockedFlag(false)` **un-awaited**, then falls straight into its own awaited `loadConfig()` → `saveConfig({...config, signed_in_email})`. `setLockedFlag` is itself `loadConfig()` → `saveConfig({...config, locked:false})`, and `saveConfig` overwrites the **whole** record (no field merge). Both `loadConfig` IPCs are in flight together; last-writer-wins with no serialization.

**Adversarial sequence** (both conditions co-occur precisely in the PR's target scenario): (a) `config.locked === true` — a prior session that died to `signed-out` while locked (the exact state this PR cleans up); (b) `config.signed_in_email !== email` — an account switch or first-ever sign-in, which is what makes the email `saveConfig` fire and compete. Interleave: both blocks read `{locked:true}`; `setLockedFlag` writes `{...,locked:false}`; the email block writes `{...(stale snapshot: locked:true), signed_in_email}` **last** → persists `locked:true`. Both `saveCloudConfig` calls return `ok`, nothing is logged, and the next relaunch's `bootstrap()` re-enters `locked` — silently reintroducing the exact "boots locked" bug this PR (and PR #9 H1) exists to close.

**Why HIGH, not CRITICAL:** fail-secure — it re-strands `locked:true` (boots *locked*, never boots-unlocked-when-it-should-be-locked); no security downgrade, operator unlocks with a password. But it's a silent, intermittent lost-update on the durability-critical config write that nondeterministically defeats the PR's own fix — a real correctness regression the PR *introduces* (before, `signIn` had a single writer).

**Fix (unanimous across lanes):** don't issue two concurrent RMWs to one record. Smallest correct diff — fold both mutations into one load-modify-save:
```ts
const config = await loadConfig()
if (config) {
  await saveConfig({ ...config, locked: false, signed_in_email: email })
}
```
(or `await setLockedFlag(false)` in its own try/catch *before* the email block). The merged save also drops one IPC round-trip. **Add the tests that would have caught it** (pr-test-analyzer): a `signIn` arm with `loadConfig → {locked:true}` asserting the persisted config carries `locked:false`, and a race arm asserting the final record carries **both** `locked:false` and the new `signed_in_email`.

### MEDIUM

None.

### LOW

**L1 — `429` classifies as `deferred` but auth-js has already discarded the refresh token on a fully-expired token** _(database-reviewer found it; silent-failure-hunter concurred)_
`src/lib/supabase/client.ts:189-195` (`isNetworkAuthError` includes `429`)
429 is an `AuthApiError` (not an `AuthRetryableFetchError`), so in `_callRefreshToken` the `!isAuthRetryableFetchError` guard is true and, on an expired access token, `_removeSession()` runs — the refresh token is discarded. But `isNetworkAuthError({status:429})` returns true → `ensureFreshSession` returns `deferred`, so `catchUp` stays put expecting a recovery the vault can no longer provide. **Self-healing:** the next `catchUp` tick (10 s) sees `{session:null, error:null}` → `failed` → honest sign-out. Net effect vs. the old code is a one-tick-delayed sign-out with a stale (but honestly-degraded) board during that tick — not data loss, not a stuck loop. **Accept for V1**, or drop `429` from `isNetworkAuthError` on the getSession path to make the classifier match auth-js's actual 429 behavior exactly.

**L2 — The lock-flag-clear (and its race) is entirely untested** _(pr-test-analyzer)_
`authService.test.ts:86` (#15) is the only test that runs `signIn`, and its `beforeEach` sets `loadCloudConfig → {data:null}` so `setLockedFlag(false)` early-returns as a **no-op** — the meaningful branch (`config.locked === true → saveConfig(locked:false)`) never executes in any test. Deleting the `setLockedFlag` call, inverting it to `true`, or reordering the two writes all pass green. This is the test-side of H1 and should land with the fix: a lock-flag arm + a lost-update race arm (both specified in H1).

**Informational (very low) — `AuthRefreshDiscardedError` (409) → `failed`** _(database-reviewer)_: a concurrent signOut/rotation racing the internal refresh yields status 409, which auth-js documents as a recoverable no-op, but `isNetworkAuthError({status:409})` is false → `failed`. Pre-existing (old code returned `failed` on any error) and effectively unreachable in the single-client main-owns-auth topology. Noted for completeness only.

## Architecture invariants checked & confirmed

- **The core fix is correct — all four installed-auth-js 2.110.7 premises verified** (database-reviewer, independently re-traced): (1) `getSession()` refreshes internally on an expired token (`__loadSession` → `_callRefreshToken`), so the wake-after-outage path never reaches the explicit `refreshSession()` branch M2 guarded; (2) on a retryable network error, `_removeSession()` runs **only** inside `if (!isAuthRetryableFetchError(error))`, so the refresh token is **preserved** — `deferred` is genuinely recoverable, not a lie; (3) a real `invalid_grant`/`session_not_found` yields a definite 4xx → `failed` → honest sign-out (no over-deferral into a stuck loop); (4) `getSession`'s error carries `.status` the same way `refreshSession`'s does — the classifier's input contract holds.
- **The classifier is type-safe and default-safe** (type-design-analyzer): `getSession()`'s declared 3-arm union narrows `error` to `AuthError` (whose `status: number | undefined` is a real field, not a phantom optional); `isNetworkAuthError` is **default-open on absence** (a status-less error → `deferred`, the safe direction), so there is no input where an ambiguous status silently produces `failed`. The getSession union has no `{session, error}` arm, so "error non-null AND session present" is structurally unrepresentable — the reorder is faithful to the contract.
- **`deferred` cannot latch or mask a dead session** (silent-failure-hunter): the full refresh-error taxonomy shows a revoked/expired refresh token always yields a definite 4xx → `failed`; only network-shaped failures (0/5xx/429), where the token may still be valid, defer.
- **A deferred board honestly shows stale** (silent-failure-hunter): the defer path touches no health marks; the health machine degrades on its own time-driven `reevaluate` tick (`stale` at 90 s, `reconnecting` on a non-subscribed channel), so a deferring session cannot leave a green board — the M5/PR#8 stale-floor is load-bearing here again.
- **Recovery auto-fires on an unattended board** (silent-failure-hunter): independent of any wake signal — the reconcile refetches carry an **unconditional** `refetchInterval` (35 s, not `canPoll`-gated), so on WAN restore the next reconcile drives supabase-js's own `autoRefreshToken`, and the realtime resubscribe re-runs `catchUp`. No wall-board-stuck-forever path.
- **The `setLockedFlag` choke point is correct** (database-reviewer): `reauthenticate` (unlock) uses `signInWithPassword` directly, not the `signIn` wrapper, so the clear fires only on a top-level fresh sign-in — which is always unlocked — and never during a lock/unlock cycle. The *intent and location* are right; only the *how* (the racing write) is the defect.
- **No interaction with M7's `client.ts` changes** (ts + db): the new branch is in `ensureFreshSession`, disjoint from M7's `onAuthStateChange` rotation push and H1 fix; a successful internal refresh fires `TOKEN_REFRESHED` → the unchanged M7 listener push, no regression.
- **The gap-closing test is genuine** (pr-test-analyzer): the retryable⇒deferred arm drives the real getSession-error path (`getSession → {session:null, error:{status:0}}`, asserting `refreshSession` is never called), reds when the fix is reverted (`expected 'failed' to be 'deferred'`), and M2's still-valid-token tests (in `health-store.test.ts`, untouched) still pass. It explains why the bug shipped through ten PRs: M2's mock always returned `getSession` with `error:null`, so the getSession-error path was structurally unreachable there.
- Flake 0/20 on `client.test.ts`; branch composes cleanly on current main (all M1–M7 merged).

## Recommended next steps

1. **H1 (the REVISE gate)** — fold the two `CloudConfig` mutations in `signIn` into a single load-modify-save (kills the race, drops an IPC round-trip); add the lock-flag + race test arms (L2).
2. **L1** — decide: accept the one-tick 429 delay for V1, or drop `429` from the getSession-path classifier so `deferred` matches auth-js's actual token-discard behavior. Cheap either way; a ledger row if deferred.
3. The core `ensureFreshSession` fix needs **no change** — it is correct as written; only the coupled lock-flag write is at issue.
4. Fix round → mapping comment → `--fix-delta` before merge (standing rule). The fix and its two new test arms are small and on one file.

## Agent IDs

<!-- Used by /react-tauri-rust-code-review --fix-delta to resume reviewers via SendMessage. Names are session-scoped: resumable by name within the originating session; a new session must fresh-dispatch. -->

- rust-reviewer: not dispatched (no `.rs` surface)
- typescript-reviewer: `pr11-ts`
- pr-test-analyzer: `pr11-tests`
- silent-failure-hunter: `pr11-silent`
- type-design-analyzer: `pr11-types`
- database-reviewer: `pr11-db`

## Reviewer pipeline notes

- **The fix for a HIGH introduced a different HIGH in the same commit** — the classic coupled-change trap. The PR bundled the core `ensureFreshSession` fix (correct) with a "compounding low" lock-flag clear (racy). The review cleanly separated them: the core fix APPROVEs across all five lanes, the coupling is the REVISE. When a PR fixes A and opportunistically also fixes B, B deserves the same scrutiny as A — here B was where the defect lived.
- **Three-lane convergence on the race, one with an honest self-correction.** typescript-reviewer found it; database-reviewer confirmed it from the data-layer lens (same-record RMW, atomic-per-call ≠ serialized); silent-failure-hunter's first pass *missed* it (it framed concurrency as "the only other writer is `lock()`" and overlooked that the email-persist block in the same function is itself a concurrent writer), then re-verified and concurred at HIGH, crediting the ts lane. A lane owning its miss and re-confirming independently is the pipeline working as intended.
- **The test lane explained the ten-PR survival.** The bug wasn't missed by carelessness — M2's test used a still-valid-token mock, so the getSession-internal-refresh error path was *structurally unreachable* by that test. The sweep's value was writing the arm that reaches it. Worth recording for the V1 retrospective: a fix guarded only the path its test could reach.
- **The core fix's correctness rests entirely on installed-source behavior** (refresh-token preservation on a retryable error), and database-reviewer verified it at the decisive line rather than trusting the PR's claim — the discipline that has repeatedly paid off on this project's supabase-js surface.
- Five of five lanes needed the idle-without-report nudge; recovery-by-name held at 100%.
