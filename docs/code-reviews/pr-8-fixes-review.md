# PR 8 — Fix Delta Review

**PR:** [#8](https://github.com/Recon222/cctv-canvas-hub/pull/8) — feat(canvass): M5 — attention & dashboard (connection indicator first: D15)
**Scope:** Fix delta only — re-review of the 2 commits landed in response to the initial review (`pr-8-review.md`).
**Reviewers (resumed via SendMessage, full transcript context):** database-reviewer, pr-test-analyzer, silent-failure-hunter (all Opus). typescript-reviewer and type-design-analyzer sat out — zero findings of theirs to close and the ~22 changed production lines received three lanes' eyes.
**Date:** 2026-07-22

> **For the implementing instance:** This document is self-contained. You do not need to reread `pr-8-review.md`.

## Verdict

**APPROVE — unanimous, zero new findings.**

H1 (the REVISE gate) is closed with adversarial arithmetic re-done by the lane that found it: the boundary-equal invariant is an explicit named budget paired with the code's strict `>`, not a second hidden zero-margin. L1 is closed; L2 was no-action by the review's own recommendation. Third consecutive clean fix round. PR #8 is ready for merge.

## Pre-flight gates (re-verified after fixes)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 230 passed, 0 failed (36 files; net +1: two cadence tests replace the old tripwire) |
| Rust surface | none in fix round |
| `npm run check:all` (orchestrator re-run, post-mutation-restore) | green, exit 0 |
| Working tree at review end | clean, HEAD `38b835e` |

## Fix commit → original finding mapping

| Commit | Original finding | Type of fix | Verdict |
| --- | --- | --- | --- |
| `ce0c20f` | **H1** reconcile floor had no margin under the stale threshold → false-STALE flap on no-case views (HIGH — the REVISE gate) | `RECONCILE_MS` 60 s → **35 s** + named `FETCH_BUDGET_MS = 20_000`; `STALE_AFTER_MS` untouched (§5.4 promise preserved); two-cycle tripwire + missed-cycle scenario arm (both red-first verified); all four doc mirrors + a stray comment updated same-commit with provenance | **CLOSED** |
| `38b835e` | **L1** vacuous `toHaveClass` assertion in #91 | Deleted; retained comment names the `data-attention` attribute as the pin | **CLOSED** |
| — | **L2** unpaired chip props (observation) | No action, per the review's own no-change recommendation | **CONFIRMED** |
| — | Housekeeping (act() warnings) | Skipped with stated justification; ruled justified by the test lane (fake-timer plumbing = hang risk for cosmetic noise, 0 failures/30 runs) | **ACCEPTED** |

## Closed findings — verification detail

**H1 (database-reviewer, arithmetic re-done adversarially):**

- The boundary question — `2×35 000 + 20 000 = exactly 90 000` — resolved SAFE: the invariant's `≤` pairs with `evaluate()`'s strict `>` (`now - lastConfirm > STALE_AFTER_MS`), so at a gap of exactly 90 s the board reads not-stale, and the new scenario arm pins precisely that instant. The named budget is explicit margin, not dressed-up zero-margin.
- Worst-case sequence enumerated: confirm at t0 → cycle fails at t0+35 (amber `reconnecting` immediately — error newer than confirm, socket subscribed) → recovery lands by t0+90 → back to live. No red across one missed cycle. Healthy-board margins: ~18 s headroom at fast RTT, ~10 s degraded-but-recovering. The 10 s reevaluate tick can only *delay* a stale flip, never advance it — the tick reservation in the budget is conservative.
- The only residual stale-touching case is a hung fetch pushing genuine silence past 90 s — which is *honest* G4 stale, not the false alarm H1 named. Not a regression.
- The implementer's 35/20 split conceded strictly better than the lane's own 40/10 sketch (a 10 s budget is consumed by the tick alone) — the fix improved on both the review's lean and the finder's sketch.
- Volume at 35 s: ~1.7×/min on two small queries, visible-landing-views only, stops when a case is selected. Trivial.
- All doc mirrors verified carrying the new cadence with "was 60 s" provenance: doc 01 §5.4 constants + Flow E4, doc 02 rows 2.2B + 2.5A, the MapCanvas comment de-hardcoded; grep confirms only history/provenance mentions of 60 s survive. Mirror-drift trap avoided.

**H1 (pr-test-analyzer, mutations):** revert to 60 000 → BOTH new pins red (constant assertion + scenario arm — two independent pins); bump to 36 000 → red (zero slack; any loosening trips); the OLD one-cycle form proven GREEN at the breaking constant — the false-confidence gap is demonstrably shut. The scenario arm verified as a genuine missed-cycle model (failed fetch, evaluation at the latest recovery moment), not an instant-fetch walk.

**H1 (silent-failure-hunter, honesty walk):** no new dishonest state at the faster cadence — green is now backed by data at most ~35 s old (tighter than before), amber on a transient appears sooner AND dwells shorter (not flicker — a real fetch failed), two consecutive failures go red only when data genuinely exceeds 90 s. `evaluate()` byte-identical; the change is pure constants. MapCanvas change confirmed comment-only.

**L1 (pr-test-analyzer):** assertion gone, comment correct, and #91 re-mutation-verified still red-capable on the attribute alone.

## Deferral justifications — verification detail

None deferred this round (L2 no-action was the review's own disposition; the housekeeping skip was assessed and accepted as not-debt).

## New findings introduced by the fixes

None — three lanes, independently. Third consecutive clean fix round; the pattern holds (fully-specified remedy, single root cause, no scope creep — plus, this round, the implementer improving on the reviewers' own numbers with an argument both accepted).

## Architecture invariants — re-verified clean

- `evaluate()` untouched; the fix is constants + tests + docs only.
- The tripwire pair (constant invariant + scenario arm) are independent pins — either alone reds the breaking constant.
- Focus-gating scope honest: hidden boards pause by design and catch up instantly on visibility; the margin fix correctly targets the visible quiet board.
- Counts: 230 = 137 numbered (unchanged) + 93 supporting; net +1 accounted (−1 old tripwire, +2 cadence tests).
- Tree clean at HEAD after all mutations; reverts by backup-copy throughout.

## Recommended next steps

**Ready for merge** — owner's specs: `gh pr merge 8 --merge --delete-branch`, then `git checkout main && git pull && git fetch --prune`. Zero open findings across the initial review and this delta. This artifact is the last uncommitted review record — commit it with or before the merge. Next per the plan: **M6** (idle lock 6.1 + the 6.3 ProcessPanel port — the retained/discarded cut is pinned in the PR #5 fix-delta; read it before briefing; 6.3C also relocates the feed and amends #98 in place). D18 still open, fires at first `exportInformation` consumption.

## Reviewer pipeline notes

- **The finder conceding the implementer's constants were better than its own sketch** (35/20 > 40/10, because the tick eats a 10 s budget) is the healthiest possible closure shape — the fix round argued back with arithmetic and won on the merits. Recorded as precedent alongside the PR #4-era "verify findings, refute with evidence" rule: it cuts both ways.
- The boundary-equality question (planted by the orchestrator) got three independent treatments — predicate pairing (db), mechanical boundary mutation (tests), and honesty walk (silent) — converging on SAFE. A boundary-equal invariant with a strict-inequality predicate and a named budget is a defensible pattern; the artifact records it so a future reader doesn't re-litigate.
- Same-commit doc-mirror updates with provenance (four mirrors + a stray comment caught by grep) is exactly the anti-mirror-drift discipline the planning reviews kept catching violations of — first time it shipped pre-empted rather than post-caught.
