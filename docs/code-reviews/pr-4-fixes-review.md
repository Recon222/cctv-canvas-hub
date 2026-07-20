# PR 4 — Fix Delta Review

**PR:** [#4](https://github.com/Recon222/cctv-canvas-hub/pull/4) — feat(canvass): M2 — live data plane (three-view board, realtime, health)
**Scope:** Fix delta only — re-review of the 8 commits landed in response to the initial BLOCK review (`pr-4-review.md`).
**Reviewers (resumed via SendMessage, full transcript context, all Opus):** typescript-reviewer · pr-test-analyzer · silent-failure-hunter · type-design-analyzer · database-reviewer
**Date:** 2026-07-20

> **For the implementing instance:** This document is self-contained. You do not need to reread `pr-4-review.md`.

## Verdict

**REVISE — narrowly, and not for the reasons the BLOCK was issued.**

The CRITICAL is closed *structurally* and proven so: the database lane temporarily re-keyed the effect to reproduce the old bug, ran the new regression test, and watched it fail on the delivery assertion — then restored the file. All 6 HIGHs, 13 MEDIUMs and 9 of 11 LOWs from the initial review are closed; 2 LOWs are deferred with a named M4 consumer. Every lane verified its own findings rather than accepting the fix table, and three lanes caught places where the fix commit message *overstated* what landed.

Two things keep this from being a clean APPROVE, both small:

1. **A disputed residual HIGH** — the 90 s/300 s cadence. Silent-failure marks it closed (pre-filter confirmation is the right thing to measure); database marks it a residual HIGH (on a genuinely quiet agency there are *zero* broadcasts, so pre-filter never fires and the arithmetic still yields 210 stale seconds out of every 300). Adjudicated below: the residual is real but invisible in M2.
2. **A measured flaky test** — 6 failures in 48 scoped runs (~13%), invisible to `check:all` but surfaced by the test spec's own scoped command. One `await` fixes it.

Per strict mode either one alone forces REVISE (any HIGH; any agent conflict). Both resolutions are one-liners. Every lane's own verdict was APPROVE or APPROVE-with-comments.

## Pre-flight gates (re-verified after fixes, independently)

| Gate | Result |
|---|---|
| `vitest run` (full suite) | **132/132 pass**, 21 files (105 → 132, +27 — arithmetic confirmed honest by pr-test-analyzer) |
| `tsc --noEmit` | clean (exit 0) |
| ESLint + `ast-grep scan` on changed surface | clean (re-verified by typescript-reviewer) |
| `cargo test` | n/a — no Rust in this PR |

## Fix commit → original finding mapping

| Commit | Original findings | Verdict |
|---|---|---|
| `3eee46d` | **CRITICAL** (case switch kills realtime) · HIGH 5 (cadence) · HIGH 1 pts 1–2 · MEDIUM non-live landing · MEDIUM debug→warn · MEDIUM subscribe-err · LOW unsubscribe rejection | **closed** (cadence partially — see Disputed) |
| `93b0b31` | HIGH 2 (fabricated zeros) · HIGH 4 (N+1) · test-gap M6 · blank-board product call | **closed** |
| `6537e1d` | HIGH 3 (GC resurrection) · LOW cases-patch predicates/sort · LOW cancelQueries · LOW DELETE-activity · test-gaps M1, M3 | **closed** |
| `cfb0fce` | HIGH 1 pt 3 (`investigatorLabel`) · MEDIUM `form_data` nullability · MEDIUM Database relation names · LOW incident coords · LOW media unions | **closed** (see new LOW on drift posture) |
| `11be9fc` | MEDIUM `lastFetchErrorAt` inert · HIGH 6 (guard negatives) · test-gap M2 · LOW allow-list | **closed** |
| `6b71e85` | MEDIUM ORDER BY · MEDIUM `deleted_at` predicates · test-gap M4 | **closed** |
| `724d8d2` | MEDIUM keyboard a11y | **closed** |
| `0c27375` | MEDIUM cross-session store carry · test-gap M5 · LOW #54 | **closed** (see new MEDIUM — one store short) |

**31 findings: 29 closed · 2 deferral-justified · 1 residual (disputed).**

## Reviewer verdicts at a glance (fix delta)

| Agent | closed | residual | new | verdict |
|---|---|---|---|---|
| database-reviewer | 11/12 | 1 HIGH (disputed) | 3 LOW | APPROVE (conditional) |
| typescript-reviewer | 4/4 | 0 | 3 LOW | APPROVE |
| silent-failure-hunter | 8/8 | 0 | 1 MEDIUM, 1 LOW | APPROVE with comments |
| pr-test-analyzer | 9/9 | 0 | 1 MEDIUM, 2 LOW | APPROVE with comments |
| type-design-analyzer | 6/7 (+2 deferrals) | 1 partial → LOW | 1 MEDIUM, 3 LOW | APPROVE |

## Disputed finding (agent conflict)

**The 90 s/300 s cadence — closed, or residual HIGH?**

- **silent-failure-hunter: CLOSED.** Pre-filter confirmation measures the one thing the machine can actually verify — transport health. Post-filter confirmation conflates "this case is quiet" with "the transport is broken," and since a canvass location takes 20+ minutes, that would read stale ~70% of the time on a healthy board. The trade is right.
- **database-reviewer: PARTIALLY CLOSED, residual HIGH.** The pre-filter fix closes the *busy multi-case* scenario, but it does not touch the arithmetic. On a genuinely quiet agency (03:00, wall board, no phones active) there are **zero** envelopes, so nothing confirms except the 300 s reconcile: `t=0` live → `t=90 s` stale → holds until `t=300 s`. Unchanged: **210 s of every 300 s**. That is the plan's own dominant case (Flow D1: "a wall display is idle most of its life").

**Adjudication:** They answer different questions — silent-failure asked whether pre-filter introduces *new dishonesty* (it doesn't), database re-computed the *false-alarm arithmetic* for zero traffic (it still bites). The residual is real. It is also **invisible in M2**: no M2 surface renders health state; the indicator ships in M5. So the correct disposition is not "block the milestone" but "settle the constant before M5 renders it."

Resolution options (database-reviewer recommends the first, and argues against the third):
1. **Lower `RECONCILE_MS` below `STALE_AFTER_MS`** — one constant. At 60 s the cost is one two-column counts query and one ≤50-row cases query per minute.
2. **Consciously accept it** — ledger entry + an M5 entry criterion. Converts this REVISE to APPROVE.
3. ~~`realtime.onHeartbeat` → `recordEvent`~~ — **rejected**: a heartbeat proves the socket is alive but *not* that the `broadcast_agency_activity` trigger fires, so heartbeat-only confirmation could mask a broken trigger as `live` — the same G4 inversion in the other direction.

## Closed findings — verification detail

**The CRITICAL — proven, not asserted.** `useCaseRealtime.ts:45-60` now runs one effect with deps `[queryClient]`; the case is read via `caseIdRef` at delivery time. The channel is created exactly once per mount, so realtime-js's topic reuse and the `isClosed()` gate are structurally unreachable. Both the database and TypeScript lanes independently traced the new mock against installed realtime-js 2.110.7 and confirmed it is faithful on all four load-bearing behaviors (topic reuse, the `isClosed()` no-op, deferred leave ack, non-joined delivery). Then two lanes went further and *ran* the mutation:
- database-reviewer re-keyed the effect to `[queryClient, caseId]` → `FAIL … expected 'started' to be 'working'` — it fails on **delivery**, not on a call count.
- pr-test-analyzer independently reproduced the same red, and verified each modelled behavior is load-bearing (remove any one and the mutation survives).

**All four mutation claims independently re-verified** by pr-test-analyzer (mutate → red → revert):
| Claim | Result |
|---|---|
| CRITICAL regression test fails against old keying | RED (1 failed/15 passed, behavioural assertion) |
| Both catch-up guards → `true` | RED ×3 (incl. the leaked-subscription arm) |
| Hard-DELETE `removed` flag dropped | RED ×2 |
| GC-resurrection guards → `previous ?? []` | RED, and the test genuinely exercises the empty-cache path |

**Three lanes corrected the fix commit's own claims** — worth noting because it's what makes this verification real rather than ceremonial:
- **silent-failure-hunter:** `recordEvent()` did *not* move after the patch as the fix table said — it moved *pre-filter, still pre-mapper*. That is the only coherent choice (pre-filter confirmation and confirm-after-patch are mutually exclusive), it's deliberately pinned by a test, and it supersedes part of that lane's own original HIGH. What actually closes the HIGH is containment (try/catch → `logger.error`, which reaches the on-disk log in production) plus the mappers becoming total.
- **type-design-analyzer:** disputes "the mappers are total" — they are null-safe on the two fields flagged, not total. See the new LOW on `deleted_at`.
- **typescript-reviewer:** retracted its own original a11y advice — `<button>`'s content model is phrasing content, so it legally cannot wrap the card's `<h3>`/`<dl>`. The implementer's `role="button"` choice was right; the sibling `CaseCard` is now the one with technically invalid nesting (tolerated by browsers and AT — not worth a commit).

**Other verification highlights:** the N+1 is genuinely gone (one `select('case_id,status')` folded client-side, stable sorted key, prefix-matching invalidation, G6 intact); `form_data: LocationFormData | null` propagates to readers (probe: `row.form_data.cameras` → TS18047); the `Record<never, never>` fix landed correctly (probe: typo'd relation → real relation union, `.rpc()` uncallable, writes still `never`); `cancelStaleFetch` does not lose the patch (TanStack re-captures `#revertState` on manual updates, and `CancelledError` never reaches the hooks' catch, so no false error marks); `evaluate`'s new clause degrades only when the error is newer than the last confirm and cannot mask `stale`.

## Deferral justifications — verification detail

| Item | Rubric check | Verdict |
|---|---|---|
| `canPoll` (health-store) | LOW; named M4 consumer (polling gate); re-adding costs the same as deleting | **justified** — but type-design notes it will surface in the next `/cleanup` knip pass as an unused export; **add a ledger line so it isn't "fixed" by deletion a milestone before its consumer arrives** |
| `'media-new'` ActivityKind | LOW; named M4 consumer (media attention) | **justified** |

## New findings introduced by the fixes

### MEDIUM

**[MEDIUM] `casesView` stale-visible test is flaky — measured 13% failure in scoped runs, invisible to `check:all`**
Source: pr-test-analyzer (measured: 6 failures / 48 runs scoped; 0/14 full-suite; 0/3 file-alone)
File: src/features/canvass/__tests__/casesView.test.tsx:126-138
Issue: The test awaits only the *cases* query before swapping both mocks to `mockRejectedValue`. `useLocationCounts` is `enabled` only once cases resolve, so its first fetch is created in the same render the await unblocks on — a race. Lose it and the counts query's first fetch uses the rejecting mock, the card renders "—", and `getByText('2 Started')` throws. Worse: in the failing runs the test proves nothing about stale-visibility, because counts were never loaded. The combination is the bad one — `npm run check:all` hides it while the test spec's own scoped command surfaces it.
Fix: `expect(await screen.findByText('2 Started')).toBeInTheDocument()` immediately after the case-number await, before swapping the mocks.

**[MEDIUM] Health marks and the case-data query cache survive the session boundary — only the canvass store resets**
Source: silent-failure-hunter
Files: src/features/canvass/components/CanvassRoot.tsx:26 · src/store/health-store.ts:163 (`resetHealthStore` — tests only)
Issue: At a shift change, `resetCanvassStore` clears selection/view/activity, but `useHealthStore.marks` keeps `lastEventAt`/`lastFetchOkAt`/`channel` and the query cache keeps `['cases']`/`['location-counts']` (gcTime 10 min, staleTime 5 min). Operator B signs in a minute later, `useCases` finds cached data inside staleTime and does **not** refetch, and `evaluate` returns `live` from operator A's marks. Normally the resubscribe catch-up saves it — but if the CLOSED ack never lands (socket already dead, app killed mid-teardown), `channel` stays `'subscribed'`, the `previous.marks.channel !== 'subscribed'` guard fails, and catch-up is skipped entirely. Agency-wide RLS makes this staleness, not disclosure — but it is the "green light on another session's data" shape at a realistic moment.
Fix: the implementer's own effect, one store short — also call `resetHealthStore()` and `queryClient.removeQueries({ predicate: … CASE_DATA_KEY_FAMILIES … })`. **Land before M3**, which adds another cache family to the same boundary.

**[MEDIUM] Catch-up allow-list duplicates query-key literals across five files with no type linkage**
Source: type-design-analyzer
File: src/hooks/useConnectionHealth.ts:21-26
Issue: The allow-list holds bare strings (`'cases'`, `'locations'`, `'location-counts'`, `'media'`) while the keys are built independently in four hooks. Five sites, one shared assumption, zero coupling — and `query.queryKey[0] as string` casts `unknown`, so a non-match falls through silently. Rename a family in a hook and it drops out of Flow E catch-up: a reconnect stops refreshing it and the board shows stale data with a green channel — precisely what the allow-list exists to prevent. No test catches it either (health-store.test.ts sets the literals itself rather than exercising the hooks; `'media'` isn't even asserted). The deny→allow swap was still the right call — it traded silent over-invalidation for the safer silent under-invalidation — but it's now load-bearing on string agreement.
Fix: export the literals once (an `as const` tuple next to `SIGNED_URL_KEY_PREFIX`, which already lives in health-store for exactly this reason) and have the four hooks build keys from it.

### LOW

- **[LOW] A missing `deleted_at` still reads as tombstoned** (mappers.ts:78, 98, 119 + visibleRows:24) — `undefined !== null` is true, so a partial row *without* the field is treated as soft-deleted → mapper returns null → `upsertById` removes it → the card vanishes. The absence of a tombstone marker means the row is *alive*; the code has it backwards for partial rows. Not covered by tests. Fix: `!= null` at all four sites. *(type-design-analyzer — this is the residual of the "mappers are total" claim)*
- **[LOW] `updatedAt` unguarded deref in the new cases sort** (useCaseRealtime.ts:150) — a `cloud_cases` broadcast with null `updated_at` throws inside the updater; now contained and logged, but `recordEvent` already fired and the list keeps its old entry. Fix: `(a.updatedAt ?? '')` or `wireString` in `toCanvassCase`. *(silent-failure-hunter)*
- **[LOW] The V2 migration claim in the code comment is now false** (realtimeService.ts:11-12) — "V2 migrates by swapping the topic string to `case:{id}:activity`; this API does not change" is contradicted 55 lines below by `onLocationTraffic`, whose whole purpose is consuming *other* cases' traffic to keep landing counts live. A per-case topic cannot deliver that, so the V2 swap would silently kill landing liveness *and* the pre-filter confirmation. **This is the one doc-ish item that is load-bearing now** — it sits at the top of the file a V2 implementer reads. Fix in this PR; the plan doc can wait for A2. *(database-reviewer)*
- **[LOW] `aria-pressed` promises a toggle the card can't perform** (LocationCard.tsx:59) — `select()` only ever sets, so re-activating a selected card is a no-op while AT announces "pressed". Fix: make select toggle, or drop `aria-pressed`. *(typescript-reviewer)*
- **[LOW] Counts invalidation is uncoalesced and cancel-restarts the in-flight fetch** (useCaseRealtime.ts:57) — `invalidateQueries` → `refetchQueries` defaults to `cancelRefetch: true`, so a phone's bulk re-sync (20 queued locations in a few hundred ms) cancels and restarts `['location-counts']` per event; it never resolves until the burst ends. Self-limiting, only while CasesView is mounted. Fix: `{ cancelRefetch: false }`. *(database-reviewer + typescript-reviewer — merged)*
- **[LOW] The landing's case *list* is still not live** (realtimeService.ts:119-123) — `cloud_cases` envelopes are dropped unless they match the selected case, so with no case selected every case event is discarded: a new canvass, rename, or status change reaches the landing only on reconcile, while the counts beneath it are live. Mixed freshness on one card is arguably more misleading than uniform staleness. Fix: invalidate `['cases']` pre-filter on any `cloud_cases` envelope. *(database-reviewer)*
- **[LOW] Drift posture applied inconsistently** — `MediaRow.type`/`storage_bucket` widened to `string` while `LocationRow.status`/`CaseRow.status` stay closed unions, and the status fields are the ones with consumers that silently drop unknowns: `LocationCardStack`'s fixed `STATUS_ORDER` renders an unmodeled status **nowhere** (a card silently missing from the board). Meanwhile widening costs M4 its exhaustiveness on the media switch. Fix: pick one posture; cheapest is keeping the unions and giving `LocationCardStack` a catch-all group. *(type-design-analyzer + typescript-reviewer — merged)*
- **[LOW] `ZERO_COUNTS` is a shared mutable singleton** (CasesView.tsx:79-83) — module-scoped, handed to every card; any mutation corrupts the fallback for the session. Fix: `as const satisfies` or `Object.freeze`. *(type-design-analyzer)*
- **[LOW] CRITICAL regression test flaked once in ~48 scoped runs** (realtime.test.ts:380-462) — `rerender` is called outside `act()`, so the ref-update effect may not have flushed before the first `fire`; observed once with the same message the deliberate mutation produces. Mechanism plausible, frequency low. Fix: wrap both `rerender` calls in `act()`. *(pr-test-analyzer)*
- **[LOW] `useLocationCounts`' sorted key is untested** — exercised with a single id, so sorted and unsorted are indistinguishable; drop the sort and every case-list reorder churns the key. Fix: one assertion with two ids in both orders. *(pr-test-analyzer)*

## Architecture invariants — re-verified clean

- **CRITICAL closed structurally**, not patched around: one channel per mount, delivery-time case read, no cleanup→setup pair on the topic. **D12 still holds** — `authService` untouched, unmount is now the single teardown path, asserted `removeChannel` called exactly once.
- **Mapper choke point** intact and stronger (`wireString`, honest `form_data | null`, range-checked incident coords) — with the `deleted_at` residual noted above.
- **`['cases']` predicates** now mirrored in the patch path (archived/deleted leave the list, `updated_at desc` re-sorted). **Tombstones excluded server-side *and* at the mapper**, with stable `created_at` ordering.
- **`Database` generic strictly stronger** — `Record<never, never>` restores the relation-name union (typo'd table is now a compile error, not a runtime 404); `Insert`/`Update: never` unchanged.
- **Health machine**: staleness still evaluated first; no optimistic `live`; fetch errors now degrade, correctly gated; `evaluate` still pure and total.
- **Logging levels survive production** — contract breaks at `warn`, channel errors and dispatch failures at `error` (all reach the Tauri log plugin); the forward-compat unknown-table no-op correctly stays `debug`.
- **Conventions** — ast-grep clean, selector discipline intact (the new `caseIdRef` is a plain ref, not store state), AD11 one-way barrel seam intact, i18n untouched and still at parity.
- **Live proof** (implementer-run, recorded in the PR): landing live with no case selected; case A flip arrives; **switch to case B → flip arrives < 5 s on the post-switch subscription** (silently dead before the fix); back to A → arrives. Negative control ran first.

## Recommended next steps

**Three one-liners before merge:**
1. The flaky test's missing `await` (casesView.test.tsx) — currently invisible to `check:all`.
2. The false V2 migration claim in `realtimeService.ts:11-12` — it misleads the next implementer at the top of the file.
3. The cadence: either lower `RECONCILE_MS` below `STALE_AFTER_MS`, or consciously accept it with a ledger entry **and an M5 entry criterion** ("settle health cadence before rendering the indicator"). Either resolves the dispute; the second converts this to APPROVE.

**Land before M3** (the boundary gets harder once M3 adds another cache family): the session-boundary MEDIUM — `resetHealthStore()` + `removeQueries` alongside the existing `resetCanvassStore`.

**Ledger** (`docs/code-reviews/deferred.md`): `canPoll` + `'media-new'` with their M4 consumers and a "do not delete in `/cleanup`" note; the allow-list string-duplication MEDIUM with an M3 trigger; the drift-posture LOW with an M4 trigger.

**Carry into M5's entry criteria** (raised by silent-failure-hunter): "stale-visible beats blank" was the right product call, but it means M2 ships with degradation computed correctly and **rendered nowhere** — a persistent fetch failure leaves the old board on the wall with no on-screen signal until M5's indicator lands. M5's indicator is now load-bearing for M2's product promise.

## Reviewer pipeline notes

- **Verification beat assertion, repeatedly.** Two lanes independently *ran* the CRITICAL mutation (re-key the effect, watch the test fail on the delivery assertion, revert); the test lane re-ran all four claimed mutations plus its own original one; the type lane re-probed its `Record<never, never>` fix on the fixed tree. Not one closure in this delta rests on the fix table's word.
- **Three lanes corrected the fix commit's own claims** — `recordEvent` moved pre-filter (not post-patch), the mappers are null-safe rather than total, and the reviewer's own a11y advice was wrong about `<button>`'s content model. A fix-delta where reviewers only confirm is a fix-delta that isn't reading.
- **The dispute was productive, not noise.** Silent-failure and database reached opposite verdicts on the cadence because they asked different questions (new dishonesty vs. false-alarm arithmetic). Surfacing it produced a sharper disposition than either alone: real residual, invisible in M2, settle before M5 renders it.
- **The flaky test is the kind only measurement finds** — 13% in scoped runs, 0% in full-suite and file-alone runs. A reviewer reading the test would call it fine; the lane ran it 48 times.
- **One fix uncovered a latent bug the original review under-rated**: the initial pass called the same-topic duplicate join "worth a live check rather than a finding." It deserved to be a finding — it was the CRITICAL.
