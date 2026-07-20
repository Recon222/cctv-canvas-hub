# PR 4 — Aggregate Code Review

**PR:** [#4](https://github.com/Recon222/cctv-canvas-hub/pull/4) — feat(canvass): M2 — live data plane (three-view board, realtime, health)
**Branch:** feature/canvas-hub-m2 → main
**Cut / Phase:** Milestone M2 of 7 (plan phases 2.1–2.5 + A1's three-view IA)
**Reviewers (fresh fan-out, all Opus):** typescript-reviewer · pr-test-analyzer · silent-failure-hunter · type-design-analyzer · database-reviewer
**Lanes skipped:** rust-reviewer — no `.rs` files changed (correct coverage, not a gap)
**Date:** 2026-07-20

## Verdict

**BLOCK.**

One CRITICAL and six HIGH findings, on a milestone whose entire purpose is the live data plane. The CRITICAL is disqualifying and was found independently by three lanes: **selecting a second case permanently kills realtime for the session** — the subscription effect is keyed on `caseId`, and React's synchronous cleanup-then-setup means `supabase.channel()` hands back the *same mid-leave channel*, whose `subscribe()` silently no-ops. The board then degrades to 5-minute polling while the health indicator blames the network. Traced step-by-step through installed realtime-js 2.110.7 and phoenix by both the database and TypeScript lanes.

The six HIGHs cluster into two themes. **Honest Liveness is breached on three paths** — health is stamped `live` *before* the mapper runs (a throw dies in phoenix's catch-less dispatch loop, leaving a green light on stale data), a failed locations fetch renders as fabricated "0 · 0 · 0" counts indistinguishable from a genuinely untouched case, and the cadence arithmetic (`RECONCILE_MS` 300 s vs `STALE_AFTER_MS` 90 s) shows red STALE ~70% of the time on a *healthy* board. **Cache correctness has two more** — `previous ?? []` resurrects a garbage-collected query as a one-row list stamped fresh, and the Cases landing view fires up to 50 unbounded `select('*')` queries to compute three integers. Plus a mutation-confirmed test gap where removing both catch-up guards leaves the suite green while creating an unbounded refetch loop.

None of this is architectural: the contracts the plan pinned are largely **implemented correctly** (AD2 WKB parsing, the mapper choke point, `['cases']` predicates, G6 partitioning, D12 teardown all PASS). These are integration seams that were each specified correctly in isolation and never multiplied out against real numbers or real library behavior.

## Pre-flight gates

| Gate | Result |
|---|---|
| `vitest run` (full suite) | 105/105 pass, 21 files (64 → 105, +41 tests) |
| `tsc --noEmit` | clean (exit 0) |
| `cargo test` | n/a — no Rust changes in this PR |
| ESLint / ast-grep on changed surface | clean (verified by typescript-reviewer) |

## Reviewer verdicts at a glance

| Agent | C | H | M | L | Verdict |
|---|---|---|---|---|---|
| database-reviewer | 1 | 2 | 4 | 5 | BLOCK |
| typescript-reviewer | 0 | 2 | 2 | 0 | REVISE |
| silent-failure-hunter | 0 | 2 | 5 | 1 | REVISE |
| pr-test-analyzer | 0 | 1 | 6 | 2 | REVISE |
| type-design-analyzer | 0 | 0 | 4 | 3 | APPROVE with comments |
| **Total (after dedupe)** | **1** | **6** | **13** | **11** | **BLOCK** |

40 raw scored findings → 31 after dedupe. Conflicts: **0 disputed**.

## Findings (deduped, ranked by severity)

### CRITICAL

**[CRITICAL] Selecting a second case permanently kills the realtime subscription for the session**
Source agents: database-reviewer (CRITICAL) + typescript-reviewer (HIGH) + silent-failure-hunter (MEDIUM, channel-identity race) — merged, three-lane independent identification
Files: src/features/canvass/hooks/useCaseRealtime.ts:32-45 · src/features/canvass/services/realtimeService.ts:113-123
Issue: The effect is keyed on `caseId`, which changes while `CanvassRoot` stays mounted (CasesView.tsx:68-72). React runs cleanup and setup back-to-back in one synchronous commit, and against installed realtime-js 2.110.7 that sequence is broken at every step:
1. `removeChannel` → `await channel.unsubscribe()` → phoenix `leave()` sets `state = 'leaving'` and waits for the server's leave ack (phoenix channel.js:238-253). On a healthy socket the synchronous `trigger("ok")` shortcut does **not** apply — removal is a network round trip away.
2. `supabase.channel('agency:activity', …)` → `RealtimeClient.channel` finds the existing topic and **returns the dying channel, discarding params** (RealtimeClient.js:328-340).
3. Three `channel.on('broadcast', …)` bindings are stapled onto it.
4. `channel.subscribe(cb)` — the whole join body sits behind `if (this.channelAdapter.isClosed())` (RealtimeChannel.js:134). State is `leaving`, not `closed` ⇒ **silent no-op**; the status callback is never even registered.
5. The leave ack lands → the *old* subscribe's `_onClose` fires `onStatus('closed')` and `_remove` empties `channels`.
Result: after the coordinator opens a second case, **zero channels remain**. Health reads `reconnecting` → `stale` at +90 s, the board silently drops to 5-minute reconcile refresh for the rest of the session, and the indicator misattributes it to the network. Nothing recovers short of a session change that unmounts `CanvassRoot`.
Why no test catches it: realtime.test.ts:79-83 mocks `channel: vi.fn(() => channel)` with an instantly-resolving `removeChannel` — modelling neither topic reuse nor the `isClosed()` gate — and no test re-renders the hook with a second `caseId`.
Fix: The wire topic is agency-wide, so the channel needn't be keyed on the case at all. Subscribe **once per mount** (`useEffect(…, [queryClient])`), read the current case id from a ref inside the handler — which is what the file's own comment ("the subscription lives and dies with the mount") already claims. G6 filtering stays client-side and unchanged. Land it with a regression test that re-renders with a second `caseId` against a mock reproducing both library behaviors.

### HIGH

**[HIGH] Health is stamped `live` before the mapper runs, and mapper throws die in a catch-less dispatch loop**
Source agents: silent-failure-hunter (HIGH) + database-reviewer (MEDIUM, `investigatorLabel`) + type-design-analyzer (MEDIUM, no shape validation) — merged, three-lane convergence
Files: src/features/canvass/hooks/useCaseRealtime.ts:74-103 · src/features/canvass/services/mappers.ts:28-31 · src/features/canvass/services/realtimeService.ts:59-119
Issue: `handleEvent` calls `recordEvent()` **first**, then maps. `investigatorLabel` does `row.requester_name.trim()` with no guard — while the same file three lines earlier defends `form_data` with *"The wire can carry null despite the contract; degrade to empty."* A null/absent `requester_name` throws a TypeError that escapes into phoenix's `bind.callback` loop (channel.js:311-314 — a bare `for` loop, **no try/catch**), reaching the WebSocket `onmessage` handler where the React ErrorBoundary cannot see it and no `window.onerror` hook exists. A second trigger needs no throw at all: an absent `deleted_at` reads as `undefined !== null` → `toCanvassLocation` returns null → `upsertById` treats it as a removal and the card **silently vanishes from the board**.
Result: health reads `live`, the card keeps its old status, the activity ring never records it, nothing logs. The literal spec §6 defect — a silently-stale board with a green light — recurring on every update from the affected row until the 5-minute reconcile.
Fix: (1) Move `recordEvent()` to the **end** of `handleEvent`, after the cache patch succeeds — a broadcast you couldn't apply is not a liveness confirmation. (2) Wrap the `handle` body in try/catch → `logger.error('realtime: event dispatch failed', { cause })`. (3) Harden `investigatorLabel` with `?? ''` on both fields, matching the defence already applied to `form_data`. Optionally add a narrow runtime guard at the seam for the fields the mappers dereference unguarded.

**[HIGH] A failed locations fetch renders as fabricated "0 Started · 0 Working · 0 Complete"**
Source agent: silent-failure-hunter
File: src/features/canvass/components/CasesView.tsx:62,92
Issue: `const { data: locations } = useCaseLocations(...)` then `{(locations ?? []).filter(...).length}`. Any one card's query failing (PostgREST 500, timeout, wifi blip, RLS letting the case row through but not its locations) leaves `data` undefined after `retry: 1` — and the card renders zeros **byte-identical to a real case with no canvass activity**. On a wall display an operator reads "nobody has worked this case" when the truth is 9 locations, 3 complete. `recordFetchError()` is called but that mark is inert (MEDIUM below), the health indicator UI is M5, and `logger` is never touched — zero signal anywhere.
Fix: Read status from the hook and refuse to render a number you don't have — `const { data, isPending, isError }`, render `—` or a warn chip instead of a count. The parent already has the right instinct at CasesView.tsx:20-26 (`role="alert"`); the card just needs to inherit it.

**[HIGH] `previous ?? []` resurrects a garbage-collected query as a one-row list, stamped fresh**
Source agent: typescript-reviewer
File: src/features/canvass/hooks/useCaseRealtime.ts:84-88, :106-108
Issue: `setQueryData` **builds** the query when it doesn't exist (query-core queryClient.js:103) and stamps `dataUpdatedAt = Date.now()` (query.js:402). `['cases']` is observed only by CasesView; with `gcTime: 10 min` / `staleTime: 5 min`, parking on the case view for 10+ minutes evicts it. The next `cloud_cases` UPDATE recreates `['cases']` as a **one-element array marked fresh** — so returning to Cases mounts `useCases`, sees non-stale data, does **not** refetch, and the wall display shows one case card instead of the whole active list for up to 5 minutes. Same shape for `['locations', caseId]` (evicted while in the M3 map placeholder → case view then renders 1 of 9 locations).
Fix: Bail instead of inventing a list — a functional updater returning `undefined` is a clean no-op: `previous => (previous === undefined ? undefined : upsertById(previous, …))`. Both call sites.

**[HIGH] Cases landing view is an N+1: up to 50 unbounded `select('*')` queries to compute three integers**
Source agents: database-reviewer (HIGH) + typescript-reviewer (MEDIUM) — merged
Files: src/features/canvass/components/CasesView.tsx:60-62 · src/features/canvass/services/canvassService.ts:51-62
Issue: One `CaseCard` per case (bounded at 50) each mounts its own `['locations', caseId]` query → 50 distinct keys → 50 PostgREST round trips, each `select('*')` with no `limit` and no `deleted_at` predicate, dragging full `form_data` jsonb (scopes, per-camera GPS, DVR block, exportInformation) for every location including tombstones. ~30 locations × ~4 KB ≈ 120 KB per case ⇒ **~6 MB per landing render**. It repeats: `refetchInterval: RECONCILE_MS` re-fires all 50 every 5 minutes, and `invalidateCaseData` refetches all 50 at once on every `online` event — a thundering herd triggered precisely by a flaky link. Plus 50 `recordFetchOk()` store writes per cycle.
Fix: The counts need `case_id` and `status` only. One query under `['location-counts']` — `.select('case_id,status').in('case_id', ids).is('deleted_at', null)` — replaces all 50 and cuts payload by three orders of magnitude. (casesView.test.tsx seeds one case, so the suite can't see it.)

**[HIGH] Cadence arithmetic guarantees a false STALE banner ~70% of the time on a healthy board**
Source agents: database-reviewer (HIGH) + silent-failure-hunter (MEDIUM) — merged
Files: src/store/health-store.ts:26,32,58-75 · src/features/canvass/hooks/useCases.ts:23 · src/features/canvass/services/realtimeService.ts:85-87
Issue: `STALE_AFTER_MS = 90_000` but `RECONCILE_MS = 300_000` — 3.3× larger. `lastConfirm` has exactly two sources: a delivered broadcast and a successful fetch. Investigators spend 20+ minutes per location, so 90 s with no event on the *selected* case is the normal state — and broadcasts for the agency's **other** cases are filtered out *before* `recordEvent()` runs, so they confirm nothing despite proving the channel is alive. One quiet cycle: `t=0` reconcile OK → `live`; `t=90 s` → **`stale`**; stays there until `t=300 s`. That is 210 of every 300 seconds red on a perfectly healthy connection with a SUBSCRIBED channel. G4 is inverted into the failure it exists to prevent: an indicator that cries wolf 70% of the time is one operators stop reading.
Fix: Pick one — call `recordEvent()` on any delivered envelope *before* the case filter (the channel is demonstrably alive; one line and truest), or set `RECONCILE_MS < STALE_AFTER_MS`, or feed `RealtimeClient.onHeartbeat` (~25 s ticks, documented for exactly this) into `recordEvent`. Test #62 pins the threshold in isolation; nobody multiplied it against `RECONCILE_MS`.

**[HIGH] Catch-up guard's negative conditions are untested — mutation-confirmed invalidation storm**
Source agent: pr-test-analyzer (mutation-tested: mutated, ran, saw green, reverted)
Files: src/hooks/useConnectionHealth.ts:51-59 (production) · src/store/health-store.test.ts:130-164 (#63)
Issue: #63 covers only the positive `error → subscribed` transition. Two load-bearing negative conditions are unpinned: the initial `null → subscribed` must NOT invalidate, and any health mark written while already `subscribed` must NOT invalidate. **Replacing both guard conditions with `true` leaves the suite green (40/40).** With that regression: `recordFetchOk` → invalidate all case-data → observed queries refetch → `recordFetchOk` → … an unbounded refetch loop against Supabase, invisible to the suite. The initial-mount case alone causes a duplicate full fetch on every board mount.
Fix: Assert `queryClient.getQueryState(['cases'])?.isInvalidated === false` immediately after the FIRST `channelStatus('subscribed')`; add a case where, with the channel already subscribed, `recordFetchOk()` on a fresh `['cases']` entry leaves `isInvalidated` false.

### MEDIUM

**[MEDIUM] `lastFetchErrorAt` is a write-only mark — `evaluate()` never reads it**
Source agents: silent-failure-hunter + type-design-analyzer — merged
File: src/store/health-store.ts:52, 58-75, 131-132
Issue: Three hooks faithfully report failures into a machine that discards them. Its doc-comment promises "evidence for degradation"; the only reader in the repo is the test asserting it was written. Sequence: broadcast at T=0 → `live`; PostgREST then 500s continuously while the websocket keeps delivering — health stays `live` indefinitely. Bounded in practice (90 s silence still forces stale; the view components render their own alerts), hence MEDIUM.
Fix: Consume it in `evaluate` (e.g. `lastFetchErrorAt > lastConfirm && online ⇒ 'reconnecting'`), or delete the field and the three call sites. Keeping an inert mark with a promising comment is the worst option.

**[MEDIUM] Channel subscribe errors lose their cause entirely**
Source agent: silent-failure-hunter
File: src/features/canvass/services/realtimeService.ts:39-49, 117-119
Issue: `channel.subscribe(status => …)` drops the second `err` parameter, and `default: return 'error'` collapses CHANNEL_ERROR with everything else. The single most likely M2 field failure — private channel + a `realtime.messages` RLS denial — produces **not one line** in the Tauri log. Health degrades honestly, but the operator has the symptom and no cause.
Fix: `channel.subscribe((status, err) => { if (err) logger.error('realtime: channel error', { status, cause: err }); onStatus(mapChannelStatus(status)) })`.

**[MEDIUM] Envelope-contract violations log at `debug` — invisible in production**
Source agent: silent-failure-hunter
File: src/features/canvass/services/realtimeService.ts:62, 80
Issue: `logger.debug` is a no-op outside DEV (logger.ts:74-83). If Supabase changes the broadcast envelope or the trigger's payload shape drifts, **100% of real events** fall into a silent no-op branch: `recordEvent()` never runs, health flaps live→stale on the 90/300 s cycle, and the board drops to 5-minute latency with nothing in the log explaining it. The file's own comment concedes this is an unversioned live-captured contract.
Fix: `logger.warn` at both sites — these mean the contract broke. (Line 110, unknown table, is correctly `debug` — that one is the deliberate V2 forward-compat no-op.)

**[MEDIUM] `Database` generic constrains columns and writes but not relation names**
Source agent: type-design-analyzer (typecheck-probed, then reverted)
File: src/lib/supabase/database-types.ts:181-192
Issue: `Views: Record<string, never>` carries a string index signature, so postgrest-js's relation-name union widens to `string`: `from('cloud_locatoins')` (typo) compiles, Row is `never`, `.eq()` accepts any column, and `never[]` is assignable to `mapVisible`'s `Row[]` — so a drifted table name compiles end-to-end and surfaces only as a runtime 404. That is exactly the drift the file header says this contract exists to catch.
Fix: `Views: Record<never, never>` / `Functions: Record<never, never>`. Probe-confirmed: `from('cloud_locatoins')` then errors with the real relation union, and tsc stays clean on the rest of the tree.

**[MEDIUM] `LocationRow.form_data` declared non-null while its only consumer knows it's nullable**
Source agents: type-design-analyzer + database-reviewer — merged
Files: src/lib/supabase/database-types.ts:132 · src/features/canvass/services/mappers.ts:91-92
Issue: The row type promises `form_data` is always present; the mapper disagrees in code with a widening cast and the comment *"The wire can carry null despite the contract."* One of the two is a lie. Today only the mapper reads it and compensates — the next reader that goes straight to the row (the M5 dashboard reading `row.form_data.cameras`) gets a green tsc and a runtime TypeError.
Fix: `form_data: LocationFormData | null` (the cast then becomes redundant), or confirm the column is NOT NULL and delete the cast.

**[MEDIUM] view/selection coupling is comment-only, and nothing resets it across sessions**
Source agent: type-design-analyzer
File: src/features/canvass/store/canvass-store.ts:22-37
Issue: `{ view: 'case', selectedCaseId: null }` is representable; `setView` doesn't consult selection and `selectCase(null)` doesn't reset view. The UI guards it (NavRail disables, LocationCardStack renders an EmptyState defensively), but the reachable path is the **session boundary**: `resetCanvassStore` is test-only (grep confirms no production caller), and the module-scoped Zustand store survives sign-out. Signing in as a different investigator remounts with the previous operator's `view: 'case'` and their `selectedCaseId` — the board lands on the prior session's case and subscribes/fetches it. No RLS bypass (agency-wide reads), but stale cross-session state carry.
Fix: Call the existing reset on the active→signed-out transition.

**[MEDIUM] No `ORDER BY` on locations or media — cards reshuffle on every reconcile**
Source agent: database-reviewer
File: src/features/canvass/services/canvassService.ts:51-73
Issue: PostgREST without an order clause returns plan order; on a seq scan that's heap order, and an UPDATE relocates the tuple to the end of the heap — so the location an investigator just edited jumps to the bottom of its status group on the next refetch. Also inconsistent with the realtime path, which patches in place: the same data renders in two different orders depending on arrival route.
Fix: `.order('created_at')` on each. (`['cases']` correctly orders by `updated_at desc`.)

**[MEDIUM] `deleted_at is null` is a server predicate for cases but not locations or media**
Source agent: database-reviewer
File: src/features/canvass/services/canvassService.ts:41, 57, 68
Issue: Correctness holds (the mapper choke point drops tombstones client-side), but tombstones cross the wire with full `form_data` on every fetch, multiplying against the N+1. The asymmetry is unexplained.
Fix: Two one-line additions.

**[MEDIUM] The Cases landing view presents a non-live "live" surface**
Source agent: database-reviewer
Files: src/features/canvass/hooks/useCaseRealtime.ts:33-35 · src/features/canvass/services/realtimeService.ts:83-99
Issue: No channel exists at all until a case is selected, and once one is, every event for a non-selected case is dropped. So the per-case status counts — the surface a coordinator reads to see which canvass is moving — update only on the 5-minute reconcile, and non-selected cases never update live. May be a deliberate G6 consequence, but nothing in code or doc acknowledges the trade and the counts carry no freshness affordance.
Fix: Acknowledge it in the doc, or fold the counts into a single query the broadcast handler patches regardless of selection.

**[MEDIUM] Location cards are mouse-only — clickable `<article>` with no role, tabindex, or key handler**
Source agent: typescript-reviewer
File: src/features/canvass/components/LocationCard.tsx:48-57
Issue: Selecting a location is the primary interaction of the case view (and the M3 fly-to trigger), and it's unreachable by keyboard and invisible to assistive tech. ESLint won't catch it (no jsx-a11y plugin). The sibling case card does it correctly with `<button type="button">` (CasesView.tsx:66), as does NavRail.
Fix: Make it a `<button type="button">`, or add `role="button" tabIndex={0}` + Enter/Space `onKeyDown` + `aria-pressed={selected}`.

**[MEDIUM ×6 — test coverage] Untested production paths in the M2 surface**
Source agent: pr-test-analyzer (each mutation-checked where noted)
1. **Hard-DELETE removal path unexercised** (useCaseRealtime.ts:53-55, realtimeService.ts:78) — #50's "delete" is a soft-delete arriving as UPDATE, removing via `mapped === null`, never via the `removed` flag. Mutation-confirmed: changing `if (removed || mapped === null)` to `if (mapped === null)` keeps realtime.test.ts 6/6 green; a hard DELETE would then re-insert the row as a phantom location.
2. **evaluate tick / visibility listener / effect teardown untested** (useConnectionHealth.ts:36-46, 61-67) — `stale` is only ever reached by a hand-call to `reevaluate`. The interval is the *only* mechanism making the stale badge reachable in a silent app; a leaked listener multiplies invalidations per remount.
3. **`cloud_cases` branch of `handleEvent` has no hook-level coverage** (useCaseRealtime.ts:105-115) — #48 fires a cloud_cases event but through the service with `onEvent: vi.fn()`, never reaching the hook. A wrong query key means live case-row edits never reach the landing view. The `display_name ?? case_number` fallback is also unpinned (a null display name would render "null").
4. **#107 proves the reconcile net for `useCases` only** though the spec row names locations too — locations are the board's actual content and the likelier victim of a dropped broadcast.
5. **`signOut`'s continue-on-teardown-failure contract has no adversarial test** (authService.ts:36-42) — if the try/catch were tightened away, sign-out throws and the credential clear never happens; a security-adjacent failure today's happy-path test cannot see.
6. **CasesView empty and error states untested** (CasesView.tsx:20-38) — both branches are one `mockRejectedValue`/`mockResolvedValue([])` away in a file that already mocks the service; an agency with no cases and an offline agency both land on the app's first screen.

### LOW

- **[LOW] Catch-up invalidation is a deny-list, not an allow-list** (useConnectionHealth.ts:20-22) — the predicate matches every query in the app, today including preferences, and will silently capture every family added in M3/M5. Fix: `['cases','locations','media'].includes(query.queryKey[0])`. *(database-reviewer)*
- **[LOW] Realtime `['cases']` patch doesn't mirror the fetch's server predicates** — an archived case arrives as an UPDATE and is written back into a list `fetchCases` deliberately excludes, lingering up to 5 min; new rows append rather than sort by `updated_at desc`. *(database-reviewer)*
- **[LOW] `setQueryData` without `cancelQueries`** — a reconcile issued before a patch but resolving after it overwrites with the older snapshot. Upsert-by-id prevents duplication but not this lost update; self-heals in one cycle. *(database-reviewer)*
- **[LOW] Incident coordinates aren't range-validated while WKB ones are** (mappers.ts:60-68 vs geo.ts:45) — a mis-keyed manual incident coord yields an off-planet marker in M3. *(database-reviewer)*
- **[LOW] `MediaRow.type`/`storage_bucket` narrowed to literal unions** under a `select('*')` + schema-gate drift strategy — an unmodeled value produces a type the compiler calls impossible. *(database-reviewer)*
- **[LOW] Unsubscribe rejection discarded** (realtimeService.ts:121-123) — `void supabase.removeChannel(channel)` with no `.catch`; authService already models the right pattern. *(silent-failure-hunter)*
- **[LOW] `ActivityEvent` models op/row/old as parallel fields** — a DELETE carries `row === old`, so `locationKind` sees unchanged status and labels it `'location-updated'`, pushing an activity entry and attention stamp for a card just removed. Fix: discriminate on `op`. *(type-design-analyzer)*
- **[LOW] Speculative surface with no consumer** — `canPoll` (health-store.ts:42, only test callers) and the `'media-new'` ActivityKind member (never constructed). knip will surface these. *(type-design-analyzer)*
- **[LOW] #54 asserts a filter the test performs, not one production performs** — the spec row's "other-case entries not shown" half has no consumer until the M5 feed; don't count it as the G6 partition proof. *(pr-test-analyzer)*
- **[LOW] `locationKind` covers only the location-status arm** — `'location-new'` and unchanged-status `'location-updated'` are never asserted. *(pr-test-analyzer)*
- **[LOW] One availability note, loud not silent** — a failed 5-min reconcile flips `status` to `'error'` with data still cached, and both CasesView and LocationCardStack check `isError` before rendering rows, so one transient failure blanks an otherwise-working wall board. Product call, flagged not filed. *(silent-failure-hunter)*

## Architecture invariants checked & confirmed

The pinned plan contracts are, with one exception, **implemented correctly** — verified against installed library sources:

- **AD2 (client-side WKB, RPCs unused) — PASS.** `geo.ts` decodes little-endian EWKB correctly: endianness byte, `type & 0xff === 1` for Point, SRID flag `0x20000000` → coords at offset 9. Traced `0101000020E6100000…` end-to-end. Bounds-checked at every offset, `Number.isFinite` guards, `(0,0)` and out-of-range → `null`, never throws. `Functions: Record<string, never>` makes `.rpc()` uncallable — the decision is type-enforced, not discipline.
- **Mapper at every cache boundary — PASS** (with the M3 caveat that the mapper itself can throw). Fetch, both realtime patch paths, and media all route through `toCanvass*`; test #49 asserts the patched row carries no `location`/`form_data`. Type-enforced: `CanvassLocation.coord` is `Coordinate | null` and `parseWkbPoint` is its only producer, so **raw WKB hex cannot leak into a view-model**. Soft-deleted rows cannot reach a view-model on *either* path — the M1 plan-review HIGH is genuinely closed.
- **`['cases']` predicates — PASS.** `deleted_at is null`, status not archived, `order updated_at desc`, `limit 50` all present and asserted by #41.
- **G6 case-partitioned query keys — PASS.** Exactly as pinned; the only consumer API is `subscribeToCaseActivity(caseId, …)`.
- **D12 (channel teardown on sign-out) — GENUINELY RESOLVED.** `removeAllChannels()` runs *before* `auth.signOut()`, tearing down every channel and disconnecting the socket before the token is revoked. (The CRITICAL doesn't reopen D12 — it leaves *no* channel rather than a live one.)
- **setAuth timing — PASS.** The explicit `realtime.setAuth()` is belt-and-braces; supabase-js already wires `accessToken` as a callback and calls `setAuth` on INITIAL_SESSION/SIGNED_IN/TOKEN_REFRESHED, and `_setupConnectionHandlers` awaits the in-flight auth promise on socket open.
- **`evaluate()` purity and no-optimistic-live — PASS.** `(marks, now) => HealthState`, no `Date.now()`, no store reads, total over the union. Staleness is checked *first*, so `channel === 'subscribed'` can never mask an aged-out confirm; `SUBSCRIBED` alone returns `connecting`, and `live` requires a real confirm. `offline` wins over everything.
- **Read-only guarantee — PASS.** `Insert: never` / `Update: never` makes a V1 cloud write path a **compile error** (G5/T8), properly retiring M1's D5 deferral.
- **No schema changes** in the diff — correct for a consumer of a pinned contract. No `user_id` filtering (agency-wide reads left to RLS), no secret-key usage.
- **Conventions — clean.** Zustand selector-only with `getState()` in callbacks (no destructuring anywhere), AD11's one-way canvass→cloud-session barrel seam respected, services own every cloud call, zero manual memoization, effect cleanups complete, **i18n en/fr/ar key sets byte-identical** with genuine translations and logical properties throughout.
- **`fixtures.ts` does not create false coverage** — override-based factories, not shared frozen objects; edge shapes (null location, soft-deleted, older-shape/empty form_data, whitespace requester_name) match the documented seed.

## Recommended next steps

1. **Fix the CRITICAL first** — unkey the subscription from `caseId` (subscribe once per mount, current case from a ref), and land the regression test that re-renders with a second `caseId` against a mock reproducing topic-reuse and the `isClosed()` gate. Everything else is downstream of a working data plane.
2. **One pass closes four HIGHs in the same seam**: move `recordEvent()` after the cache patch + try/catch the handler + `?? ''` in `investigatorLabel` (HIGH 1); `previous === undefined ? undefined : …` at both `setQueryData` sites (HIGH 3); the `['location-counts']` single query replacing the N+1 (HIGH 4); and the cadence fix — `recordEvent()` before the case filter is the one-line truest option (HIGH 5).
3. **CaseCard status plumbing** (HIGH 2) is independent and small: render `—` when `isPending || isError`.
4. **Test debt**: the mutation-confirmed guard test (HIGH 6) plus the six MEDIUM gaps — the hard-DELETE path and the evaluate tick are the two that pin real regressions.
5. Re-run with `--fix-delta` afterward: `/react-tauri-rust-code-review 4 --fix-delta` — all five reviewers resume with context intact.

## Agent IDs
<!-- Used by /react-tauri-rust-code-review --fix-delta to resume reviewers via SendMessage (address by name). -->
- rust-reviewer: not dispatched (no `.rs` changes)
- typescript-reviewer: ts-m2
- pr-test-analyzer: test-m2
- silent-failure-hunter: silent-m2
- type-design-analyzer: type-m2
- database-reviewer: db-m2

## Reviewer pipeline notes

- **Three-lane independent identification of the CRITICAL.** database-reviewer (protocol trace), typescript-reviewer (React commit semantics), and silent-failure-hunter (status-callback race) each arrived at the case-switch resubscribe path from a different angle. The database and TypeScript lanes independently produced the same five-step library trace through realtime-js and phoenix. That convergence is the single strongest signal in this review.
- **Library-source verification carried the review again.** Four of the six HIGH/CRITICAL findings rest on reading installed `node_modules` (realtime-js `channel()` topic reuse, `isClosed()` gating, phoenix's catch-less `bind.callback` loop, TanStack's build-on-setQueryData behavior) rather than on documented behavior. None would have been caught by reading the app code alone.
- **Mutation testing earned its place.** pr-test-analyzer mutated production lines, re-ran, confirmed green, and reverted — proving two coverage gaps (the catch-up guards, the hard-DELETE flag) are real rather than theoretical.
- **Typecheck probing likewise** — type-design-analyzer applied candidate fixes, verified tsc, and reverted, so the `Views: Record<never, never>` fix is confirmed working rather than proposed.
- **Zero disputes across five lanes**, and the one apparent tension is compatible: silent-failure-hunter verified the catch-up guard's logic is *correct* while pr-test-analyzer proved it is *untested* — both true, and together they're the argument for the test.
- The plan-contract conformance is notably high (7 of 8 pinned contracts PASS). This PR's failures are integration seams — real numbers and real library semantics — not design drift.
