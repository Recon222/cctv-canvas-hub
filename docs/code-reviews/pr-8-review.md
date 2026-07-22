# PR 8 — Aggregate Code Review

**PR:** [#8](https://github.com/Recon222/cctv-canvas-hub/pull/8) — feat(canvass): M5 — attention & dashboard (connection indicator first: D15)
**Branch:** `feature/canvas-hub-m5` → `main`
**Cut / Phase:** M5 of 7 (phases 5.1–5.3, D15 entry criterion honored — indicator shipped first)
**Reviewers (fresh fan-out, all forced Opus):** typescript-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, database-reviewer. rust-reviewer not dispatched — zero `.rs` surface.
**Date:** 2026-07-21

## Verdict

**REVISE.**

One HIGH, and it is squarely in the surface this milestone exists to ship: on the no-case-selected views the sole liveness floor is the 60 s reconcile against the 90 s stale threshold — a 30 s margin that TanStack's settle-then-restart drift, a single failed/slow cycle, or interval focus-gating erases. A healthy idle board can flap a red "STALE · do not trust as live" banner, which is cry-wolf erosion of the exact instrument M5 mounts. The fix is constants + a margin tripwire, not architecture. Everything else across five lanes is exceptionally clean — this is otherwise the strongest milestone review to date (three fully clean lanes, an eight-for-eight mutation table, and a first-ever zero-defect live smoke).

## Pre-flight gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 229 passed, 0 failed (36 files) |
| Rust surface | none in this PR |
| `npm run check:all` (orchestrator re-run, post-mutation-restore) | green, exit 0 |
| Pre-existing failures | none |

## Reviewer verdicts at a glance

| Lane | C | H | M | L | Verdict |
| --- | --- | --- | --- | --- | --- |
| typescript-reviewer | 0 | 0 | 0 | 0 | APPROVE (clean) |
| pr-test-analyzer | 0 | 0 | 0 | 1 | APPROVE |
| silent-failure-hunter | 0 | 0 | 0 | 0 | APPROVE (clean) |
| type-design-analyzer | 0 | 0 | 0 | 1 | APPROVE |
| database-reviewer | 0 | 1 | 0 | 0 | REVISE |
| **Deduped totals** | **0** | **1** | **0** | **2** | **REVISE** |

## Findings (deduped, ranked by severity)

### CRITICAL

None.

### HIGH

**H1 — No margin between the reconcile floor and the stale threshold: false-STALE flapping on no-case-selected views** _(database-reviewer; test-side concurrence from pr-test-analyzer; constants independently verified by the orchestrator)_
`src/store/health-store.ts:26,36` (`STALE_AFTER_MS = 90_000`, `RECONCILE_MS = 60_000`) · gating at `useCaseLocations.ts:26`, `useMediaPolling.ts:31`
On a case dashboard the 20 s media poll gives huge margin — no issue. On the **landing/no-case views**, the only confirmations are `useCases` + `useLocationCounts` at the 60 s reconcile. The 30 s slack to the stale threshold has zero budget for:

1. settle-based restart — TanStack schedules the next fetch `RECONCILE_MS` *after the previous one settles*, so real periods are 60 s + RTT, compounding;
2. one failed reconcile — a transient error stamps `recordFetchError` but not `lastFetchOkAt`; the next confirmation lands ~120 s out, a guaranteed breach;
3. focus-gated intervals while the window is hidden.

`evaluate()` degrades on the confirmation gap alone (independent of a healthy socket), and the 10 s reevaluate tick then paints the red "STALE — do not trust as live" banner across a healthy agency for ~10–20 s until the next reconcile lands. A false red on the trust instrument M5 ships is the cry-wolf failure mode §5.4 exists to prevent. This is a **pre-existing constants defect that M5 makes user-visible for the first time** (the machine computed it since M2; this PR mounts the display).

**Test-side (pr-test-analyzer, concurring):** the existing tripwire `RECONCILE_MS < STALE_AFTER_MS` (health-store.test.ts:37) encodes zero jitter margin — it passes while the invariant it appears to protect is breakable; and the reconcile tests (queries.test.ts:331-391) model only the clean nominal cadence with instant fake-timer fetches, so they prove convergence, not margin.

**Fix (small, no architecture):** enforce the two-cycle invariant `2 × RECONCILE_MS + fetch budget ≤ STALE_AFTER_MS`. Either **lower `RECONCILE_MS` to ≤ 40 s** (preserves the plan's ~90 s degradation promise; negligible extra traffic on two small queries) or **raise `STALE_AFTER_MS` to ≥ ~150 s** (slower honest-degradation detection — check whether doc 01 §5.4's ~90 s is a pinned promise before choosing this arm). Plus: replace the tripwire with the two-cycle constant assertion (it fails against today's constants — that's the point), optionally a missed-cycle scenario arm. **Note on the smoke evidence:** the driving agent's chip readings (~100 s and ~80 s apart) were point-in-time samples, not continuous observation — they are *consistent with* a flap but don't prove one was observed; the finding stands on the code arithmetic alone.

### MEDIUM

None.

### LOW

**L1 — Vacuous class assertion in #91** _(pr-test-analyzer)_
`LocationCard.test.tsx:167` — `toHaveClass('hub-attention-flash')` asserts a class that is unconditionally present in the static base string; it can never fail and reads as a second pin on the pulse. The real pin (the `data-attention` attribute, next line) is mutation-confirmed red in both directions. Fix: drop the line or comment that the attribute is the pin.

**L2 — ConnectionIndicator takes state + timestamp as unpaired parallel props** _(type-design-analyzer; explicitly no-change-recommended)_
`ConnectionIndicator.tsx:63` — the type permits a host to source `state` and `lastConfirm` from different snapshots (the A2-drift shape). Assessed in depth: the sole host wires both from the store correctly via atomic primitive selectors; a combined prop object would NOT enforce same-source (the host still constructs it); true enforcement would break the presentational split; and an object-returning selector would violate the project's Zustand rule. Recorded for visibility — the invariant lives in the A2 binding + the single-source `lastConfirmAt` export, which is the right home.

## Architecture invariants checked & confirmed

- **One source of truth for the displayed timestamp:** the chip's `lastConfirm` and `evaluate()`'s stale test consume the identical exported `lastConfirmAt(marks)` — no re-derivation anywhere; primitive selectors, no render-cascade trap (typescript; mutation A reds 8 tests if the max collapses to event-only — the "green dot beside 'updated —'" bug is unwritable).
- **The chip cannot render a lying combination:** state and timestamp come from one atomic store snapshot; `live` is unreachable without a fresh non-null confirm; the stale check precedes the live arm; the LiveClock is visually and semantically distinct from the confirm chip (silent-failure-hunter).
- **Recorder inventory honest:** `lastEventAt` stamps only well-formed envelopes, agency-wide, before the case filter (heartbeats/malformed frames never stamp); `lastFetchOkAt` stamps only real round-trips (no cache-hit or optimistic path exists); all four case-data planes report Ok/Error symmetrically; signed-URL fetches deliberately excluded from the health plane (database-reviewer).
- **Sign-out parity, singleton preserved:** palette command and SignOutButton share the one `signOut()` service (channel teardown → cloud sign-out → vault clear), client singleton explicitly kept — the PR #2 HIGH does not resurface; failures surface via toast at both entry points, and a partial failure additionally self-escalates via health (typescript + silent).
- **A reconcile failure cannot blank a live board:** v5 retains data on background-refetch error; the error branch fires only on first-fetch failure or stale selection; an empty case (`[]`) renders the board, never the error (typescript + silent).
- **Banner coverage complete per §5.4:** self-nulls only for non-degraded states; `reconnecting` is amber-chip-only by design; broadcast-dead-with-fetches-confirming resolves honestly and escalates to the banner if reconciles also fail (silent).
- **Host-owned case scoping (#90):** the host filters, the component doesn't — pinned by mutation F (drop the filter → red on the case-B entry).
- **Negative pins genuine:** #96 (`fetchLocationCounts` UNCALLED — mutation D red through the same-module spy seam) and #99 (`session-lock-now` ABSENT — mutation E red) (tests).
- **OIC null-degradation airtight:** missing/null/'' all collapse to null at the mapper; no `'Name · '` or `' · 1147'` constructible; designed absence, never "undefined" text (types + silent + ts, three angles).
- **Exhaustiveness by construction:** all three `Record<HealthState>` sites and both `Record<status>` sites verified in sync; `deriveCounts`' widening is protected by the Record type even against careless cleanup; % done uses the true denominator (types + ts).
- **MediaStrip reuse is cache-shared** (same query key, zero extra fetches); sparse-row rule's widened boolean correct (ts).
- **Green-on-arrival discipline held:** #91/#92 proven red-capable by hardcoding `data-attention` both directions; #89 pins order through the real store (tests, mutations B/C1/C2).
- **i18n parity:** all 13 new keys + the newly-referenced pre-existing chrome keys verified 1:1:1 across en/fr/ar; chip copy asserts resolved strings through real i18n — key drift is red (silent + tests, mutation H).
- **M2-CRITICAL lifecycle untouched:** `useCaseRealtime` unconditional, above every early return, hook order stable (database-reviewer).
- **Counts reconcile:** 229 = 137 numbered (unchanged) + 92 supporting; the 22 new arms itemized per file (tests). Flake 0/30 × 2 files.

## Recommended next steps

1. **H1** — one small fix commit: move a constant to satisfy `2 × RECONCILE_MS + budget ≤ STALE_AFTER_MS` (lean: `RECONCILE_MS` → 40 s, which preserves the ~90 s degradation promise — but verify doc 01 §5.4's pinned value first), replace the tripwire with the two-cycle assertion, optionally add the missed-cycle arm. This is the REVISE gate.
2. **L1** — delete one vacuous assertion line (or comment it); rides with the H1 commit.
3. **L2** — no action (recorded observation).
4. Fix round → mapping comment → `--fix-delta` before merge (standing rule).
5. Housekeeping note for the fix round: `casesView`/`DashboardView` tests emit cosmetic React `act()` warnings from LiveClock/useNow real intervals — zero failures across 30 runs; optional cleanup, not a finding.

## Agent IDs

<!-- Used by /react-tauri-rust-code-review --fix-delta to resume reviewers via SendMessage. Names are session-scoped: resumable by name within the originating session; a new session must fresh-dispatch. -->

- rust-reviewer: not dispatched (no `.rs` surface)
- typescript-reviewer: `pr8-ts`
- pr-test-analyzer: `pr8-tests`
- silent-failure-hunter: `pr8-silent`
- type-design-analyzer: `pr8-types`
- database-reviewer: `pr8-db`

## Reviewer pipeline notes

- **The H1 came from adversarial arithmetic, not code reading.** Silent-failure verified the machine's *mechanics* honest under nominal cadence; database did the margin math under failure/drift and found the breach. Not a conflict — two layers of the same question, and the deciding one was the one the orchestrator seeded ("do the arithmetic honestly"). Test-analyzer then independently indicted the tripwire that had been protecting the wrong invariant — a two-lane convergence on the fix shape (constant + two-cycle tripwire) before any fix exists.
- **The orchestrator's smoke-reading was corrected in-flight:** the ~100 s chip-timestamp gap was initially framed as an observed near-miss/flap; the samples were point-in-time, so the claim was downgraded to "consistent with" — the finding was made to stand on constants alone. Evidence discipline cuts both ways.
- **Three fully clean lanes plus an 8/8 mutation table** is the strongest lane result to date; combined with the first zero-defect live smoke, M5's build quality is the project's high-water mark — the one HIGH is inherited constants, not new code.
- Five of five lanes needed the idle-without-report nudge; recovery-by-name held at 100%.
