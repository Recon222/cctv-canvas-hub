# PR 6 — Fix Delta Review

**PR:** [#6](https://github.com/Recon222/cctv-canvas-hub/pull/6) — feat(canvass): M3 — map milestone (design-package pour + phases 3.1-3.4)
**Scope:** Fix delta only — re-review of the 6 commits landed in response to the initial review (`pr-6-review.md`).
**Reviewers (resumed via SendMessage, full transcript context):** rust-reviewer, typescript-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, database-reviewer (all Opus)
**Date:** 2026-07-21

> **For the implementing instance:** This document is self-contained. You do not need to reread `pr-6-review.md`.

## Verdict

**APPROVE.**

The REVISE gate (H1) is closed with re-run proofs, all four MEDIUMs are closed with mutation-verified tests, and all five LOWs are either fixed (L4), deferred with justified triggered ledger rows (L1, L2, L3), or confirmed no-action (L5). The fix round introduced exactly one new finding — a LOW (two lanes converged on the same root cause, a third observed it independently) with a documented one-pattern fix that does not block merge. Ready for merge; the new LOW can ride the next natural touch of `MapCanvas.tsx` or a ledger row.

## Pre-flight gates (re-verified after fixes)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 165 passed, 0 failed (27 files) |
| Rust surface | unchanged in fix round (`git diff --stat 9d68953..HEAD -- src-tauri/` empty); prior 12/12 stands |
| `npm run check:all` (orchestrator re-run, post-mutation-restore) | green, exit 0 |
| Working tree at review end | clean, HEAD `9c63e74` |

## Fix commit → original finding mapping

| Commit | Original finding | Type of fix | Verdict |
| --- | --- | --- | --- |
| `de5a818` | **H1** terminal style-load failure invisible (HIGH — the REVISE gate) | Token-keyed load tracking + 20 s deadline arm + designed `styleError` state ×3 locales + furniture-hide via `CanvassRoot` + precedence pin (rejected > styleError) | **CLOSED** |
| `f43bb73` | **M1** dead same-id re-select · **L4** RTL padding untested | `selectionTick` nonce in the store + test #135 folded in | **CLOSED** (both) |
| `49cbf13` | **M2** preferences load failure masquerades as token-missing | `isError` branch → distinct `preferencesError` state ×3 locales | **CLOSED** |
| `c14832f` | **M3** markers.ts zero tests | `markers.test.ts` #132–134 (click dispatch, dataset idempotence, MARKER-BINDING pin) | **CLOSED** |
| `5279248` | **M4** token-rejection path untested | #136–137 (rejected gate + resolved i18n string, once-per-token toast dedup + re-arm) | **CLOSED** |
| `9c63e74` | **L1, L2, L3** | Ledger rows (L1 → M6 6.1 trigger; L3 → M7 topology trigger; L2 rides D18 with the MediaKind note) | **DEFERRAL-JUSTIFIED** (all three, rubric-checked) |
| — | **L5** useNow throttling | No action, per the original finding's own recommendation | **CONFIRMED** |

## Reviewer verdicts at a glance (fix delta)

| Lane | Own findings closed | New findings | Verdict |
| --- | --- | --- | --- |
| silent-failure-hunter | H1 ✓ M2 ✓ L5 ✓ | 1 LOW (merged, below) | APPROVE |
| typescript-reviewer | M1 ✓ L3 deferral ✓ | 0 (independently observed the merged LOW's trigger) | APPROVE |
| pr-test-analyzer | M3 ✓ M4 ✓ L4 ✓ | 0 | APPROVE |
| rust-reviewer | L1 deferral ✓ | 0 | APPROVE |
| type-design-analyzer | L1/L2 deferrals ✓ | 1 LOW (merged, below) | APPROVE |
| database-reviewer | n/a (was clean) — M2-CRITICAL invariant re-confirmed | 0 | APPROVE |

## Closed findings — verification detail

- **H1 (silent-failure-hunter, re-proven):** all three trigger scenarios (offline at launch / 402-429 / bad style passthrough) miss the 401/403 gate and hit `!styleLoaded` → styleError banner + furniture pulled. Late recovery clears both banner and hide (`handleMapLoad` unconditional). The 20 s deadline only bites truly hung fetches (real errors report immediately); it re-arms on token swap and cleans its timer. Precedence pinned by code and test: 401 returns early, `styleFailed` never sets on auth failure. Post-load exemption is flag-scoped, not time-scoped, and the closure is fresh (react-map-gl `setProps` refresh verified in installed 8.1.1). The orchestrator's initial-round source verification (style document fetched once, no retry) remains the factual basis.
- **M1 (typescript-reviewer):** functional-updater nonce bumps atomically with the id; `useFlyTo` deps include `selectionTick`; `selectLocation(null)` stays flight-free (early return); nothing else bumps the tick (case switch nulls without bumping — no spurious flights); reset zeroes it. Test lane's own mutation (drop `selectionTick` from deps → red) proves the arm.
- **M2 (silent-failure-hunter):** `isError` branches before `token === null`; distinct truthful copy (no "add a token" instruction, no Preferences-path chip — gated to `variant === 'missing'`); keys in en/fr/ar; test pins `MockMap` not called + token-missing string absent. TanStack v5 semantics checked by the TS lane: cached-data background-refetch errors don't flip `isError`, so the branch can't tear down a working map. Skipping the optional app-wide toast leaves the finding closed (its core was the misdiagnosis).
- **M3 / M4 / L4 (pr-test-analyzer, mutations re-run):** 6/6 red-then-restored — #134 binding rule (claimed, re-run), #137 toast dedup (claimed, re-run), H1 red-first spot-check (banner render removed → red), #132 click wiring (lane's own), #135 RTL mirror (lane's own), M1 deps (lane's own). Each mutation reddened only its target test. #136 is a genuine i18n-resolution check (raw key would fail `getByText`).

## Deferral justifications — verification detail

| Row | Rubric check |
| --- | --- |
| L1 (`deferred.md:19`) | Cited by ID (PR #6, rust + type-design converged) · rationale verifies the existing MapPane writer guard · trigger "M6 Phase 6.1 (the idle-lock consumer)" · prescribes the exact clamp `Math.max(1, idle_lock_minutes ?? 15)`. Justified (both originating lanes). |
| L2 (rides `deferred.md:18` D18) | D18 note carries the MediaKind union hardening verbatim; trigger pairing sound — both are media-row typing hardenings picked up at the M4/M5 media surface. Justified (type-design). |
| L3 (`deferred.md:20`) | Cited by ID · "equal while the board is full-window (today)" rationale · trigger "M7 topology change — thread the measured board width into the padding math". Matches the original finding exactly. Justified (typescript). |

## New findings introduced by the fixes

**N1 [LOW] — The H1 fix's load/failure tracking is inconsistently keyed** _(silent-failure-hunter + type-design-analyzer, independent convergence on one root cause; typescript-reviewer observed the trigger independently as a non-filed note)_
`src/features/canvass/components/MapCanvas.tsx:77, :94`
Two facets of one root cause:

1. _(silent)_ `loadedForToken` is keyed by token only, not styleId. A runtime style **switch** fires `style.load` but not map `load`, so `styleLoaded` stays true; if the new style document fails to fetch (no retry — the very fact H1 is built on), it's classified as a post-load tile error → silent blank map. Narrow trigger: switch coinciding with a network drop, from a 3-option select of CDN-cached styles.
2. _(types)_ `styleFailed` is a bare boolean while its siblings (`rejectedToken`, `loadedForToken`) encode the token in their value. A token swap while a style failure is showing leaves a stale wrong-token banner over the new token's loading map until its load/deadline resolves. Probed: the keyed shape compiles clean (tsc exit 0, reverted).

**One remedy closes both facets:** key the load/failure state by (token + styleId) — e.g. `loadedFor`/`failedFor` as `string | null` holding a `${token}|${styleId}` key, derived booleans by comparison, matching the `rejectedToken` pattern. Does not block merge; ride the next `MapCanvas.tsx` touch or add a ledger row with that trigger.

## Architecture invariants — re-verified clean

- **M2-CRITICAL realtime lifecycle intact after de5a818's second pass through CanvassRoot** (database-reviewer): `mapStyleFailed` is plain sibling state — re-render only, no remount/re-subscribe; hook order unchanged; subscription effect still keyed `[queryClient]` alone; teardown untouched.
- H1 deadline effect deps all stable (primitives + stable setState identity) — arms once, no reset-by-render churn (typescript-reviewer).
- `selectionTick` single-writer, atomically coupled, reset-safe, genuinely consumed (type-design + typescript, independent).
- `MapTokenGate` variant union still closed (`'missing' | 'rejected' | 'styleError' | 'preferencesError'`), all four rendered distinctly (type-design).
- Count reconciliation recounted from scratch: **137 = 9 Rust + 128 TS**, doc 02 Appendix C ≡ doc 03 summary ≡ actual rows; 165 − 137 = 28 supporting arms, fully accounted (pr-test-analyzer).
- Supporting-arm numbering (the PR comment's open question): leaving H1/M1/M2 regression arms unnumbered is **consistent with established repo practice** — coverage-gap pins get numbered, bug-fix regression arms stay supporting (precedent: the M2 realtime fix arms). Noted as a conscious gap-vs-fix rule, not severity-based; no change requested.
- All mutation reverts verified by grep; MapCanvas.tsx CRLF normalization side-effect caught and restored to repo-canonical form with zero content diff (pr-test-analyzer, transparent).

## Recommended next steps

**Ready for merge** (owner's specs: `gh pr merge 6 --merge --delete-branch`, then `git checkout main && git pull && git fetch --prune`). N1 is LOW with a narrow trigger — either fold the (token + styleId) keying into a final one-commit polish before merge (it's small and mechanical, but per this project's own rule any new commit would warrant another delta pass) or record it as a ledger row triggered on the next `MapCanvas.tsx` touch / M-final polish. Recommended: the ledger row — the review cycle has converged and the finding does not affect the M3 exit criteria.

## Reviewer pipeline notes

- **The "every fix round introduces a finding" rule held for the fourth consecutive time** — but for the first time at LOW rather than HIGH, and the pipeline caught it from three angles: silent found the silent-failure facet, type-design found the state-shape facet, typescript observed the trigger and correctly judged it non-blocking through its own lens. Dedupe by root cause merged them into N1.
- Resumed lanes quoted their original findings verbatim and re-ran their own proof classes (re-mutation, re-probe, installed-source re-read, rubric checks on deferrals) — resume-for-fix-delta remains the right mechanic within a session.
- The test lane's transparency on its CRLF side-effect (caught, restored, verified zero-diff) is the desired failure-handling posture; recorded as precedent.
- The fix round again exceeded its findings in places (token-keyed load tracking so a token swap can't inherit a stale exemption; late-recovery self-clear) — evidence of understanding the finding rather than pattern-matching it. Ironically, N1 lives in exactly that added sophistication — the keying was the right idea, applied to one axis instead of two.
