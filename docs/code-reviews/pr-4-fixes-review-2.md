# PR 4 — Fix Delta Review (Round 2)

**PR:** [#4](https://github.com/Recon222/cctv-canvas-hub/pull/4) — feat(canvass): M2 — live data plane (three-view board, realtime, health)
**Scope:** Fix delta round 2 — re-review of the 6 commits landed in response to the round-1 fix-delta REVISE (`pr-4-fixes-review.md`).
**Reviewers (resumed via SendMessage, full transcript context, all Opus):** typescript-reviewer · pr-test-analyzer · silent-failure-hunter · type-design-analyzer · database-reviewer
**Date:** 2026-07-20

> **For the implementing instance:** This document is self-contained. You do not need to reread the earlier reviews.

## Verdict

**APPROVE (with comments).**

Every open item from round 1 is closed, including the disputed residual HIGH. **No CRITICAL, no HIGH, and no MEDIUM carried forward** — all five lanes voted APPROVE. The cadence dispute is settled the way the database lane recommended and adjudicated: `RECONCILE_MS` 300 s → 60 s, and that lane recomputed the arithmetic on the fixed constants to confirm the quiet-agency false-STALE window is closed *structurally* (~30 s of headroom), not narrowly.

Two new MEDIUMs surfaced, both about **test protection of the fixes rather than the fixes themselves** — and both were found by mutation rather than inspection:

1. `RECONCILE_MS` can be reverted to 300 s and the full suite stays **135/135 green** — the ordering invariant that the entire cadence fix depends on is enforced only by a doc comment. (Found independently by two lanes.)
2. The *new* session-boundary test is itself flaky at 3/90 scoped runs, with a failure signature identical to the deliberate mutation — most likely test pollution (the file's `beforeEach` never resets the health store), but it needs the one-line fix and a re-measure to confirm.

Both are one-liners. Neither indicates a defect in the shipped behavior; they indicate the new behavior isn't yet pinned against regression.

## Pre-flight gates (re-verified independently)

| Gate | Result |
|---|---|
| `vitest run` (full suite) | **135/135 pass**, 21 files (132 → 135; arithmetic confirmed honest — 3 net-new tests, rest are expansions) |
| `tsc --noEmit` | clean (exit 0) |
| ESLint + `ast-grep scan` on changed surface | clean (re-verified by typescript-reviewer) |
| `cargo test` | n/a — no Rust across all 14 commits of this PR |

## Fix commit → round-1 item mapping

| Commit | Round-1 item | Verdict |
|---|---|---|
| `e38d98f` | **Disputed residual HIGH** — cadence (quiet-agency false STALE) | **closed** — `RECONCILE_MS` 300 s → 60 s; arithmetic recomputed by the lane that raised it |
| `4c9042a` | MEDIUM — flaky `casesView` stale-visible test | **closed** — re-measured 0/90 scoped, 0/25 file-alone |
| `35c4cc7` | MEDIUM — catch-up allow-list bare-string agreement | **closed** — probe-verified real type linkage; 6 sites (review counted 5) |
| `2a07afa` | MEDIUM — session boundary (health marks + query cache survive sign-out) | **closed** — closed at the root; both orderings traced; mutation re-verified by the raising lane |
| `6780f93` | Deferral ledger D14 (M4 dormant exports) + D15 (M5 entry criterion) | **recorded** |
| `2d51650` | 10 LOWs (tombstone strictness, drift catch-all, live case list, invalidation coalescing, V2 comment, `aria-pressed`, `updatedAt` guard, `ZERO_COUNTS`, `act()`, sorted-key test) | **all closed** |

**Round 1 carried 1 HIGH (disputed) + 3 MEDIUM + 10 LOW into this round. All 14 closed.**

## Reviewer verdicts at a glance (fix delta 2)

| Agent | carried in | closed | new | verdict |
|---|---|---|---|---|
| database-reviewer | 1 HIGH + 3 LOW | 4 | 1 LOW | **APPROVE (unconditional)** |
| type-design-analyzer | 1 MEDIUM + 3 LOW | 4 | 1 LOW | APPROVE |
| silent-failure-hunter | 1 MEDIUM + 1 LOW | 2 | 1 LOW | APPROVE |
| typescript-reviewer | 3 LOW | 3 | 2 LOW | APPROVE |
| pr-test-analyzer | 1 MEDIUM + 2 LOW | 3 | 2 MEDIUM, 2 LOW | APPROVE with comments |

## The disputed HIGH — resolved

Round 1 recorded a genuine conflict: silent-failure-hunter marked the 90 s/300 s cadence **closed** (pre-filter confirmation measures the right thing), while database-reviewer marked it a **residual HIGH** (on a genuinely quiet agency there are zero broadcasts, so pre-filter never fires and the arithmetic still yields 210 stale seconds of every 300). I adjudicated in the database lane's favour: the residual was real but invisible in M2.

The implementer took that lane's recommended option — the constant, **not** the `onHeartbeat` alternative that lane explicitly argued against (a heartbeat proves the socket is alive but not that the `broadcast_agency_activity` trigger fires, which would be the same G4 inversion in the other direction).

**database-reviewer's recomputation on the fixed constants:**
- Confirm-to-confirm gap peaks at **~60.3 s** (TanStack re-arms `refetchInterval` after each fetch settles, so the true peak includes one RTT) against a 90 s threshold ⇒ **~30 s headroom**. The 10 s evaluate tick's phase is irrelevant — no tick can sample a value that never occurs.
- Verified `refetchInterval` calls `#executeFetch()` directly and bypasses the 5-minute global `staleTime` (queryObserver.js:214-218), so confirmations genuinely land every 60 s.
- A *failed* reconcile now surfaces `reconnecting` on evidence (via the fetch-error clause) **before** the board goes red at t=90 s — honest stale, not the false-alarm failure.
- Request volume bounded and nothing over-inherited the constant: 2 queries/min on the landing (`['cases']` ≤50 rows + a two-column counts query, ~125 KB/min worst case), 1/min on the case view (CasesView unmounts and its intervals stop), `useCaseMedia` still has no interval (M4 owns the 20 s media poll).

**silent-failure-hunter concurs** from its own lane: 60 s < 90 s means an idle overnight board gets a positive confirmation every cycle, so `stale` now means stale — and it shrinks that lane's own round-1 residual (a realtime patch that throws now leaves a stale card for ≤60 s instead of ≤5 min).

## Closed items — verification detail

**The key-family tuple (35c4cc7) — real type linkage, not a rename.** type-design-analyzer probed it: the four literals exist exactly once (health-store.ts:47-50) and all six/eight sites *build their keys from them*, so the "rename in a hook" scenario it originally described **can no longer be expressed** — the hook has nothing of its own to rename. `isCaseDataKey` narrows `unknown` → the exact union (the `as string` cast is gone), and `CASE_DATA_KEY_FAMILIES[0] = 'oops'` is TS2540. Both consuming lanes independently confirmed zero bare key strings remain.

**The session boundary (2a07afa) — closed at the root.** silent-failure-hunter verified the specific hole it named: `resetHealthStore()` sets `channel: null` **unconditionally**, so it no longer matters whether the CLOSED ack ever landed — a dead-socket `'subscribed'` carcass can't survive to skip the resubscribe catch-up. It traced both orderings I asked about: (i) an in-flight fetch resolving after `removeQueries` lands in a detached Query with no observers and cannot re-populate the cache; (ii) all four families' observers live inside CanvassRoot's subtree and React destroys child observers before the parent cleanup runs. It then re-ran the mutation itself (canvass-only reset ⇒ `expected 'live' to be 'connecting'`) and noted the test **also pins that `['preferences']` survives**, so it catches an over-broad purge too.

**Flake fixes — re-measured, not accepted.** pr-test-analyzer re-ran its own original scoped command: the `casesView` stale-visible test went **0 failures in 90 pristine runs** (was 6/48) plus 0/25 file-alone; the CRITICAL regression test went **0/90** (was 1/48).

**The "honestly re-pinned" sorted-key test — mutation-verified meaningful.** Dropping `.sort()` in `useLocationCounts` goes RED (`expected [...] to be called with [ 'case_id', [ 'c1', 'c2' ] ]`). Not a wrong-reason pass, and the implementer was right that the no-second-fetch form is unprovable under `staleTime: 0`.

**The LOW batch (2d51650)** — all verified at their lines: `deleted_at != null` at all four sites *including* `visibleRows` with a partial-row test that strips the key by destructuring (so a revert to `!==` goes red on every arm); the V2 comment rewritten to be accurate *and* prescriptive (names agency-wide consumption as load-bearing and tells a V2 implementer to keep an agency-wide signal before narrowing the topic — better than what was asked); closed status unions **kept** plus a catch-all group whose badge prints the raw wire value via `defaultValue` rather than a raw i18n key; `ZERO_COUNTS` frozen; `cancelRefetch: false` with correct v5 signature; `aria-pressed` dropped as the right half of the trade.

## New findings

### MEDIUM

**[MEDIUM] The cadence invariant `RECONCILE_MS < STALE_AFTER_MS` has no test — reverting it leaves the suite green**
Source agents: pr-test-analyzer (mutation-verified) + type-design-analyzer (independently, same conclusion)
Files: src/store/health-store.ts:26, 29-36
Issue: The entire point of `e38d98f` is that the reconcile fetch is the only positive liveness confirmation on a silent agency, so it must fire faster than the stale threshold. Two independent exported constants now carry that ordering invariant **in prose**. Nothing enforces it: `queries.test.ts:333,382` use `RECONCILE_MS` symbolically so they pass at any value, and `health-store.test.ts` pins `STALE_AFTER_MS === 90_000` but never relates the two. **Mutation-verified: setting `RECONCILE_MS` back to `300_000` leaves the full suite 135/135 green** — silently reintroducing "healthy quiet board reads stale ~70% of every cycle," the exact bug this round fixed, for anyone later tuning polling cost down.
Fix: one line in health-store.test.ts — `expect(RECONCILE_MS).toBeLessThan(STALE_AFTER_MS)`. (The behavioural form — mount `useCases` with fake timers, no broadcasts, advance two cycles, assert never `stale` — is better but not required.)

**[MEDIUM] The new session-boundary test is itself flaky (3/90 scoped), with the mutation's exact failure signature**
Source agent: pr-test-analyzer (measured)
Files: src/features/canvass/__tests__/casesView.test.tsx:157-196 (test) · src/features/canvass/components/CanvassRoot.tsx:32-41 (production)
Issue: 3 failures in 90 pristine scoped runs (all clustered in one batch of 30; 0 in the other two batches; 0/25 file-alone), always the same assertion — `expected 'live' to be 'connecting'`. That signature is **identical** to the one the deliberate canvass-only-reset mutation produces, meaning in those runs the health half of the boundary reset did not take effect while the canvass half did (the four assertions above it pass). Either the cleanup aborts between the two resets, something re-establishes `live` afterwards, or the test isn't reliably observing it. This is the second flaky test in this file in two rounds, and a test that reds 3% of the time gets muted.
Most likely cause (and the first thing to try): the file's `beforeEach` never resets the health store, so this test starts from whatever the previous test left behind. Note silent-failure-hunter independently traced the production ordering as safe (child observers destroyed before the parent cleanup; `channel: null` set unconditionally), which supports test pollution over a production defect — but the measurement stands until it's re-run clean.
Fix: add `resetHealthStore()` to `casesView.test.tsx`'s `beforeEach`, then **re-measure** (≥90 scoped runs). If it persists, instrument the cleanup to assert the cache emptiness and the marks in one message so the next failure says which half ran.

### LOW

- **[LOW] The drift posture stops at the landing counts — an unmodeled status is uncounted and seeds a `NaN`** (canvassService.ts:99-106) — `perCase[row.status] += 1` on a status outside the union is `undefined += 1` → `NaN`. Two consequences: a case whose locations are all in an unmodeled status shows "0 · 0 · 0" from a **successful** fetch (the same fabricated-zero shape as the original HIGH, arriving through the drift door), and a `NaN`-valued key sits in the counts object for M5 to propagate silently. Round 2 hardened `LocationCardStack` and `LocationCard` against exactly this drift; the counting loop didn't get the same treatment. Fix: `if (!(row.status in perCase)) continue`, or an `other` bucket matching the card stack. *(silent-failure-hunter)*
- **[LOW] `onCaseTraffic` and `cancelStaleFetch` fight over `['cases']`** (realtimeService.ts:134 + useCaseRealtime.ts:165) — `onCaseTraffic` fires *pre-filter*, so an update to the **selected** case invalidates `['cases']` (starting a refetch when the landing is mounted) and `handleEvent` then immediately cancels that same fetch: one started-and-discarded request per event, partly undoing the coalescing the same commit added. Fix: fire `onCaseTraffic` only when the row is *not* the selected case. *(typescript-reviewer)*
- **[LOW] Selection is no longer perceivable to assistive tech — re-gate at M3** (LocationCard.tsx:57-70) — with `aria-pressed` dropped, the selected card is distinguished only by a visual ring. Correct for M2 (selection drives nothing else); at M3, fly-to makes selection a functional state. Fix (M3): the accurate model is single-select — `role="option"` + `aria-selected` with `role="listbox"` on the stack — not a re-added toggle. *(typescript-reviewer)*
- **[LOW] Flow E3's `visibilitychange→visible` catch-up trigger is not wired** (useConnectionHealth.ts:46-50) — the doc pins three catch-up triggers; the visible branch only calls `reevaluate()` without invalidating. Because `refetchInterval` is focus-gated and `refetchOnWindowFocus` is false, a minimized-then-restored board shows stale for up to 60 s. **Honest** stale (data really wasn't refreshed while hidden), hence LOW; one line — call `invalidateCaseData(queryClient)` alongside `reevaluate()`. Disclosed as **pre-existing from the original 2.5B commit, missed in round 1**. *(database-reviewer)*
- **[LOW] The `updated_at` null guard is untested** (mappers.ts:96) — mutation-verified: reverting `wireString(row.updated_at)` to the bare field leaves the suite green. The throw it prevents happens inside the realtime dispatch, where the try/catch now swallows it to a log line, so a regression would present as "some case updates silently don't apply." Fix: one arm in the cloud_cases realtime test with `updated_at: null`. *(pr-test-analyzer)*
- **[LOW] `cancelRefetch: false` is unasserted** (useCaseRealtime.ts:63-79) — the option exists so a bulk re-sync burst can't starve the in-flight counts fetch; dropping it degrades a burst into a stall. Cheap honest test is a spy on the options object. *(pr-test-analyzer)*

## Architecture invariants — re-verified clean

- **Cadence**: positive confirmation inside every staleness window with ~30 s margin; the only remaining paths to red are genuinely degraded ones.
- **Session boundary**: one choke point at CanvassRoot unmount resets canvass store + health marks + case-data cache; `locked` keeps the board mounted so the purge fires only on true session exit; cleanups ordered safely; `['preferences']` deliberately survives (pinned by test).
- **Key families**: single source of truth driving both the catch-up allow-list and the session purge; zero bare key strings remain across `src/features/canvass` and `src/hooks`.
- **Mapper choke point**: still the only cache boundary; tombstone polarity now correct for partial rows (a row *without* `deleted_at` is alive) — which, as silent-failure-hunter notes, also closes the secondary trigger of its original HIGH that survived round 1: a broadcast omitting `deleted_at` used to make a live location silently vanish.
- **Drift posture**: unmodeled statuses now render in a visible "Other" group with the raw wire value on the badge, and no raw i18n key leaks (asserted). *(Counts loop excepted — see the new LOW.)*
- **Honest Liveness (silent-failure-hunter's one-line re-answer)**: effectively **no** — the only remaining path is a realtime patch that throws, which is caught, logged at `error` to the on-disk log, and bounded by a 60 s reconcile. Standing caveat: degradation is computed correctly and rendered nowhere until M5 (ledger D15).
- **Conventions**: ast-grep + ESLint clean, selector discipline intact, barrel seams unchanged, i18n parity re-verified with the new `canvass.status.other` key across en/fr/ar. Cross-language fidelity N/A — no Rust or bindings touched across all 14 commits.

## Recommended next steps

**Two one-liners before merge** (both protect fixes that are already correct):
1. `expect(RECONCILE_MS).toBeLessThan(STALE_AFTER_MS)` in health-store.test.ts — the cadence fix is currently revertible with a green suite.
2. `resetHealthStore()` in `casesView.test.tsx`'s `beforeEach`, then **re-measure the boundary-reset test** (≥90 scoped runs). If the 3/90 persists, instrument the cleanup before merging — the failure signature means the health half didn't run, and that deserves certainty rather than inference.

**Ledger** (`docs/code-reviews/deferred.md`): the counts-loop drift LOW (M5 trigger — it's the one that seeds a `NaN` into something M5 will sum), the `visibilitychange` catch-up LOW (M5 trigger — one line whenever that file opens), and the a11y single-select LOW (**M3 trigger** — fly-to makes selection functional).

**Cheap while the files are open:** the `onCaseTraffic` placement (one wasted request per selected-case event) and the two untested-guard LOWs.

## Reviewer pipeline notes

- **Measurement closed what inspection couldn't.** The test lane re-ran its own scoped command 90 times per fix rather than accepting "24 runs, 0 failures" — confirming both old flakes dead *and* finding a new one at 3/90 that 24 runs would likely have missed.
- **Mutation found the round's most important finding.** No one could have read `RECONCILE_MS` and seen that reverting it keeps the suite green; two lanes arrived at it independently (one by mutation, one by reasoning about the invariant's enforcement), which is the strongest form of agreement in this pipeline.
- **The adjudicated dispute produced the right fix.** Round 1's conflict wasn't noise — the database lane's specific arithmetic won, the implementer took that lane's recommended option and explicitly *not* the alternative it argued against, and the same lane then recomputed and discharged its own condition unconditionally.
- **Lanes kept disclosing against themselves**: the database lane volunteered that its new LOW was pre-existing and it had missed it in round 1; the type lane noted its own frozen-`ZERO_COUNTS` question resolved against its instinct and said to leave it.
- **A tension worth watching, not a conflict**: silent-failure traced the session-boundary ordering as provably safe while the test lane measured a 3% flake with the mutation's exact signature. Both are probably right — test pollution explains it — but the re-measure is what turns "probably" into "known."
