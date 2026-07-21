# PR 6 — Fix Delta Review, Round 2

**PR:** [#6](https://github.com/Recon222/cctv-canvas-hub/pull/6) — feat(canvass): M3 — map milestone (design-package pour + phases 3.1-3.4)
**Scope:** Round-2 delta only — the single commit `1ed25d4` closing N1 (the LOW the round-1 fix delta introduced; owner opted to fix before merge rather than defer).
**Reviewers (resumed via SendMessage):** silent-failure-hunter, type-design-analyzer, pr-test-analyzer, typescript-reviewer (all Opus). rust-reviewer and database-reviewer sat out — zero surface in the commit (no `.rs`, no CanvassRoot/data-layer change).
**Date:** 2026-07-21

> **For the implementing instance:** Self-contained; no need to reread the prior artifacts.

## Verdict

**APPROVE — unanimous, zero findings.**

N1 is closed at the root: style load/failure verdicts are now keyed by the `${token}|${styleId}` composite with derived booleans (the `rejectedToken` pattern, zero reset effects). Both facets are pinned by orthogonal mutation-proven regression arms. For the first time in five rounds on this project, a fix round introduced **no new finding**. PR #6 is ready for merge.

## Pre-flight gates (re-verified)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 167 passed, 0 failed (27 files) |
| `npm run check:all` (orchestrator re-run, post-mutation-restore) | green, exit 0 |
| Working tree at review end | clean, HEAD `1ed25d4` |

## Fix commit → finding mapping

| Commit | Finding | Verdict |
| --- | --- | --- |
| `1ed25d4` | **N1** (LOW, from round 1): H1-fix keying inconsistent — facet 1: style-switch failure silent (loaded flag lacked styleId); facet 2: stale wrong-token banner (failed flag lacked token) | **CLOSED** (both facets, all four lanes) |

## Verification detail

- **Facet 1 closed at the root** (silent-failure-hunter): the adversarial sequence (map loaded → style switched → new style document fails, no retry) now derives `styleLoaded` false for the new composite → styleError banner + furniture pulled. The switch-success stamp is correctly wired: `handleStyleLoad` (registered once) stamps `styleKeyRef.current`, and the ref updates in a commit-phase effect — synchronously, before the async `style.load` event can fire. Verified against installed react-map-gl 8.1.1 (`_updateStyle` fires `setStyle` only on `mapStyle` change).
- **Facet 2 closed by derivation** (type-design-analyzer): all write sites stamp the composite consistently; a token OR style change moves `styleKey` and both verdicts self-clear immediately. Loaded/failed mutual exclusion is guard-enforced at every write site (`!styleLoaded` gate + deadline cleanup).
- **Both arms mutation-proven orthogonal** (pr-test-analyzer): dropping styleId from the key reds arm 1 only; reverting to a bare-boolean flag reds arm 2 only. Each arm fails under exactly its facet's regression and could not pass under the old keying — traced, not pattern-matched. Tree restored, LF-canonical, clean.
- **React correctness clean** (typescript-reviewer): deadline re-arms on `[styleKey, styleLoaded]` with cleanup-before-re-arm (no orphan timers, no set-state-after-unmount); furniture-hide split into its own effect syncing the derived value; composite keys on the raw styleId while the URL moves 1:1 with it — no mismatch; no premature arming in isPending/isError/no-token states.

## Assessed and accepted (no action)

- **`style.load` success-stamp jsdom-unreachable** (PR comment's concession): accurate — the mock doesn't forward a ref, so the listener never registers; reaching it needs the heavy native-API mock the file deliberately avoids, the same precedent as the night-preset path. The untested direction is the benign one (false-positive banner after a successful switch, visible and self-correcting); the dangerous direction (silent blank) IS covered by arm 1. Live-check territory, correctly labeled.
- **Composite delimiter** (`|`): safe for the actual value space — Mapbox `pk.` tokens are base62 + `._-`, style ids are slugs/URLs; no pipe in either (type-design + silent, independent).
- **`rejectedToken` stays token-only keyed**: principled asymmetry — auth rejection is style-independent; composite-keying it would wrongly clear a rejection banner on a style switch (type-design).
- **Observation, pre-existing, not this commit** (silent): entering a good token after a 401 doesn't hot-reload the style (react-map-gl only re-styles on `mapStyle` change) — loud not silent (the deadline banner surfaces), honest, and unchanged by this commit. Possible future nicety: token change → force style reload. No ledger row required; recorded here.
- **Counts**: unchanged and correct — 167 = 137 numbered + 30 supporting (28 + 2 new unnumbered arms per the ratified regression-arm practice); no doc edits needed, none made (pr-test-analyzer recount).

## Recommended next steps

**Ready for merge** — owner's specs: `gh pr merge 6 --merge --delete-branch`, then `git checkout main && git pull && git fetch --prune`. Zero open findings across the initial review and both fix deltas. (This artifact is the last uncommitted review record — commit it with or before the merge per the review-artifacts rule.)

## Reviewer pipeline notes

- **The finding-per-fix-round streak ended at four.** The difference this round: the fix was a single-root-cause, single-file change executed against a fully-specified remedy from the previous delta — the pattern to repeat when it's available.
- The round-1 "one step past the letter" pattern repeated and this time landed clean (furniture-hide re-synced from the derived value — closing the same staleness class one level up, verified by two lanes).
- The test lane's orthogonality matrix (each mutation reds exactly one arm) is the strongest false-coverage disproof this pipeline has produced; worth citing as the standard for future paired-facet fixes.
