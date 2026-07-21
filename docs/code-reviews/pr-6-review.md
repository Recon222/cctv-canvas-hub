# PR 6 — Aggregate Code Review

**PR:** [#6](https://github.com/Recon222/cctv-canvas-hub/pull/6) — feat(canvass): M3 — map milestone (design-package pour + phases 3.1-3.4)
**Branch:** `feature/canvas-hub-m3` → `main`
**Cut / Phase:** M3 of 7 (design-package pour + phases 3.1–3.4 + one live-smoke fix commit)
**Reviewers (fresh fan-out, all forced Opus):** rust-reviewer, typescript-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, database-reviewer
**Date:** 2026-07-21

## Verdict

**REVISE.**

One HIGH, narrowly: a terminal Mapbox style-load failure (offline at launch, 402/429, bad `map_style` passthrough) leaves a permanently blank map with live-looking furniture and only a log line — the exact Honest-Liveness failure class, verified against installed mapbox-gl 3.26 (style document is fetched once, no retry; only tiles retry) and independently re-confirmed by the orchestrator at the cited source offset. The fix is one surfaced state on one component. Everything else across six lanes is MEDIUM/LOW; five of six lanes returned APPROVE.

## Pre-flight gates

| Gate | Result |
| --- | --- |
| `npm run rust:test` | 12 passed, 0 failed (11 unit + 1 doc, workspace crates) |
| `npx vitest run` | 154 passed, 0 failed (26 files) |
| `npx tsc --noEmit` | clean |
| `npm run check:all` (orchestrator re-run, post-mutation-restore) | green, exit 0 |
| Pre-existing failures | none |

## Reviewer verdicts at a glance

| Lane | C | H | M | L | Verdict |
| --- | --- | --- | --- | --- | --- |
| rust-reviewer | 0 | 0 | 0 | 1 | APPROVE |
| typescript-reviewer | 0 | 0 | 1 | 1 | APPROVE w/ comments |
| pr-test-analyzer | 0 | 0 | 2 | 1 | APPROVE w/ comments |
| silent-failure-hunter | 0 | 1 | 1 | 1 | REVISE |
| type-design-analyzer | 0 | 0 | 0 | 2 | APPROVE |
| database-reviewer | 0 | 0 | 0 | 0 | APPROVE (clean) |
| **Deduped totals** | **0** | **1** | **4** | **5** | **REVISE** |

(Raw 11 findings → 10 deduped: the two `idle_lock_minutes` LOWs from rust + types share one root cause.)

## Findings (deduped, ranked by severity)

### CRITICAL

None.

### HIGH

**H1 — Terminal map style-load failure renders a permanently blank map with no on-screen signal** _(silent-failure-hunter; library claim re-verified by orchestrator)_
`src/features/canvass/components/MapCanvas.tsx:123-137` (`handleMapError`), `:157` (`MAP_STYLE_URLS[styleId] ?? styleId`)
Non-401/403 errors fall through to `logger.error` under the comment "mapbox retries on its own." Installed mapbox-gl 3.26: TRUE for tiles (`reloadTile`), FALSE for the style document — `Style.loadURL`'s request catch does `this._request = null; this.fire(new ErrorEvent(...))`, one fetch, no retry. Triggers: offline at launch, 402 (payment) / 429 (rate limit), or a malformed stored `map_style` passed through to a 404. The `<Map>` is mounted (token valid) so the token gate never shows, `MapFurniture` renders live-looking legend + zoom controls (`CanvassRoot.tsx:221` only nulls when the Map object is absent), `onLoad` never fires, and there is no timeout fallback. On the wall TV the coordinator cannot distinguish "no locations yet" from "map is dead."
**Fix:** track whether `onLoad`/`style.load` has fired; on a non-401/403 error while the style is still unloaded (or after a load deadline), render a persistent designed state (reuse the `MapTokenGate` rejected-banner posture with a distinct `canvass.map.styleError` message in en/fr/ar). Tile errors after a successful style load stay silent — that transient exemption is correct.

### MEDIUM

**M1 — Re-selecting the already-selected location is a dead interaction** _(typescript-reviewer; pr-test-analyzer independently flagged the same path as untested)_
`src/features/canvass/hooks/useFlyTo.ts:25-44` + `src/features/canvass/store/canvass-store.ts:55-56`
`selectLocation` sets the same primitive id → Zustand no-op → the fly-to effect never re-runs. Concrete: click marker A (flies to A) → pan far away → click A again → nothing. **Fix:** add a selection nonce/tick so same-id re-selects still change state — or explicitly pin "selection-change-only" as the spec §4 contract and document it. Either resolution closes it.

**M2 — Preferences load failure is mis-rendered as the "token missing" gate** _(silent-failure-hunter)_
`src/features/canvass/components/MapCanvas.tsx:50, 139-149`
The Rust command and TS service are honest (corrupt JSON throws; no silent reset — verified), but `MapCanvas` branches only on `isPending`, so an errored preferences query (`retry: 1`, settles `isError`) falls through to `token === null` → `MapTokenGate variant="missing"`: "Add a token in Preferences." That's a lie — the token IS set; the file couldn't be read. Following the instruction lands in MapPane where `disabled = !preferences` greys out an empty field. Dead end. **Fix:** read `isError` from `usePreferences` and render a distinct "preferences unreadable" state; optionally a QueryCache `onError` toast to surface preferences load failures app-wide.

**M3 — Marker DOM factories ship with zero tests (pure, jsdom-testable)** _(pr-test-analyzer)_
`src/features/canvass/components/map/markers.ts:39-110` — no test imports it. The marker-click → `selectLocation` half of spec #74 is unproven (the #74 test calls `selectLocation` directly, honestly disclaimed in a comment); the `selected`/`attention` dataset toggles and the MARKER-BINDING rule (root never carries transform/transition) are unpinned. **Fix:** add `markers.test.ts` — click-dispatch → spy called; dataset flips; `expect(root.style.transform).toBe('')`.

**M4 — MapCanvas token-rejection path entirely untested** _(pr-test-analyzer)_
`src/features/canvass/components/MapCanvas.tsx:123-137, 179` — the mock already captures `onError` as a prop, so the 401/403 → rejected-gate + once-per-token toast dedup is cheaply testable but has zero coverage; a toast-per-render storm or a never-showing gate would ship green. `canvass.map.tokenRejected` is the one i18n key in the file with no test asserting it resolves. **Fix:** invoke the captured `onError({error:{status:401}})` in `MapCanvas.test.tsx`; assert gate + single toast on double-fire. (Production correctness of this path was separately verified working by typescript-reviewer — this is a coverage gap, not a behavior bug.)

### LOW

**L1 — `idle_lock_minutes` admits 0; the None→15 default lives only in prose** _(rust-reviewer + type-design-analyzer, independent convergence)_
`src-tauri/src/features/preferences/types/mod.rs:23` → `number | null`. MapPane's writer already guards `parsed < 1 ? null`, so exposure is seeded/hand-edited JSON or a future writer. **Fix at the M6 consumer, one place:** `Math.max(1, idle_lock_minutes ?? 15)`. Recorded so M6 doesn't inherit the surprise — no change in this PR.

**L2 — Media-kind consumer literals are still drift-open (D18 sibling)** _(type-design-analyzer; probed)_
`src/lib/supabase/database-types.ts:150` → `DashboardView.tsx:65`. Probe: `'image'`→`'photo'` compiles clean (tsc exit 0; reverted, tree verified). The wire field staying `string` is the correct forward-tolerance posture and the gap is consciously documented in-code — flagged only because the cheap hardening exists: a `MediaKind = 'image' | 'video' | 'audio'` union constant for consumer comparisons. Optional; natural pickup with D18 at M4/M5.

**L3 — `cameraPadding` scale source diverges from the chrome scale source** _(typescript-reviewer)_
`useFlyTo.ts:55-66` uses `window.innerWidth / 1920`; the chrome scale uses board `clientWidth / 1920`. Equal while the board is full-window (today); diverges under M7 docked/secondary layouts. Thread the measured board width in when M7 changes the topology. No change this cut.

**L4 — `cameraPadding` RTL flip untested** _(pr-test-analyzer)_
Same function, distinct gap: no test pins the `rtl ? stackSide : railSide` swap; an RTL regression frames the camera behind the stack. Cosmetic framing; constants are explicitly live-tuned. Optional two-case test.

**L5 — Background-throttled `useNow` can hold attention pings past TTL** _(silent-failure-hunter)_
`useNow.ts:11-17` — OS interval throttling in a backgrounded window lets attention rings linger; self-corrects on focus. Wall-TV usage stays foregrounded. No change required; noted.

## Architecture invariants checked & confirmed

- **M2 CRITICAL surface untouched:** `useCaseRealtime` still keyed `[queryClient]` only — one subscription per mount, case read through a ref, teardown via `removeChannel`; M3's attention interval and reset effect touch disjoint resources; `MapProvider` does not remount `CanvassRoot` (database-reviewer).
- **D17 arms library-faithful:** `cancelRefetch: false` semantics traced through installed query-core 5.90.12 (`queryClient.js:180`, `query.js:185`) — the shipped code is *more* correct than its comment claims (cancel-thrash gated on existing data; prefix-match invalidation covers the parameterized key). #130's `updated_at` guard is defense-in-depth — the pinned contract declares the column NOT NULL; deliberate posture, keep it (database-reviewer).
- **Contract edges inherited, not re-queried:** `coord: null` never reaches GeoJSON; soft-delete filtering absorbed at the mapper choke point, M3 surfaces strictly downstream (database-reviewer).
- **CSP complete against installed sources:** every supabase wire (REST/auth/realtime/storage-for-M4) and every mapbox-gl load path (fetch→connect-src; the single `new Image()` uses `data:`; blob worker) fits the directives; img-src narrowing verified safe — zero remote-image references outside supabase (rust-reviewer + database-reviewer, independent angles).
- **Preferences back-compat:** M2-era JSON deserializes cleanly (serde `Option` missing→None); atomic tmp+rename save with orphan cleanup; corrupt files throw rather than silently resetting (rust-reviewer + silent-failure-hunter).
- **Marker lifecycle leak-free:** three teardown paths verified (per-location removal, unmount effect removes all markers + incident, all map events unsubscribed); no cross-case marker bleed (typescript-reviewer + silent-failure-hunter, independent).
- **MARKER-BINDING rule holds:** roots carry only cursor/pointer-events; every transform/position/transition on inner elements; `visibility` is the only root-style write (typescript-reviewer).
- **Design-pour wiring byte-intact:** SignInScreen/SetupScreen/CasesView diffs are presentation-only — same handlers, same service calls, same arguments (typescript-reviewer + database-reviewer, independent). `media.type === 'image'` matches the wire value.
- **Rejected-token status read is real:** mapbox-gl's `AJAXError` carries `.status`; the structural cast is the honest minimum (the class isn't exported) (typescript-reviewer + type-design-analyzer).
- **Mutation table 6/6 red:** #130, #131, furniture regression, #70, #73, and the "—" arm all verified red-then-restored by pr-test-analyzer's own runs; the PR body's mutation claims are honest (the `media.type` item correctly belongs to the deliberately-unwired M5 surface, not a fabricated verification).
- **Flake:** realtime.test.ts and cardStack.test.tsx measured 0/30 each — measured, not inferred.
- **i18n:** `tokenRejected`/`tokenMissing.*` present in en/fr/ar; the 8 extra `ar` keys are required CLDR plural forms, not drift.
- **Zustand discipline:** selector syntax throughout, `getState()` in callbacks, no destructuring (typescript-reviewer).
- **bindings.ts faithful:** three new fields, correct types (`string | null` ×2, `number | null`), generated not hand-edited (orchestrator + type-design-analyzer).
- **AD15 scale math:** zero jsdom coverage is the accepted posture (no ResizeObserver in jsdom; geometry explicitly live-tuned); the layering defect class that actually bit is pinned by the mutation-verified furniture regression test (pr-test-analyzer).

## Recommended next steps

1. **H1** — one fix commit: surfaced style-failure state on `MapCanvas` (+ `canvass.map.styleError` keys ×3 locales). This is the REVISE gate.
2. **M1** — decide: selection nonce, or pin selection-change-only as the contract (a one-line doc amendment also closes it).
3. **M2** — `isError` branch in `MapCanvas` (distinct unreadable-preferences state).
4. **M3 + M4** — two cheap pure-jsdom test files/extensions; natural companions to the H1 commit's test.
5. **L1/L2/L3/L4** — defer with triggers (M6 clamp, D18 pickup, M7 topology, optional RTL test); add rows to `docs/code-reviews/deferred.md` for L1 (M6 trigger) and L3 (M7 trigger) if not fixed now. **L5** — no action.
6. Fix round → mapping comment on the PR → `--fix-delta` re-review before merge (standing rule; every fix round on this project has introduced at least one new finding).

## Agent IDs

<!-- Used by /react-tauri-rust-code-review --fix-delta to resume reviewers via SendMessage. Names are session-scoped: resumable by name within the originating session; a new session must fresh-dispatch (agents do not survive across sessions). -->

- rust-reviewer: `pr6-rust`
- typescript-reviewer: `pr6-ts`
- pr-test-analyzer: `pr6-tests`
- silent-failure-hunter: `pr6-silent`
- type-design-analyzer: `pr6-types`
- database-reviewer: `pr6-db`

## Reviewer pipeline notes

- **Three lanes converged on `handleMapError` from different angles, no conflict:** typescript-reviewer proved the 401/403 status read works (installed `AJAXError` shape), silent-failure-hunter proved the non-401 arm is dishonest for the style document (H1), pr-test-analyzer proved the 401 arm is untested (M4). Complementary lenses on one function — the strongest coverage pattern this pipeline produces.
- **Two independent convergences:** L1 (rust + types, same root cause, deduped) and M1 (ts found the production defect; tests independently flagged the identical path as the coverage gap).
- **The test lane's re-attribution of the `media.type` mutation claim** (deliberately-unwired M5 surface, not an overclaim) is the pipeline correcting its own brief — recorded per the fix-delta discipline of not letting claims pass unexamined in either direction.
- **Five of six lanes required the idle-without-report nudge** (SendMessage by name → full text delivered immediately every time). Consistent with prior cycles; naming lanes remains load-bearing for this recovery pattern.
- **Orchestrator independently re-verified:** the H1 library claim at the cited source offset, bindings.ts structure, and the full gate (`check:all` green, post-mutation-restore, exit 0).
