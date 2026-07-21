# PR 7 — Fix Delta Review

**PR:** [#7](https://github.com/Recon222/cctv-canvas-hub/pull/7) — feat(canvass): M4 — media milestone (signed URLs, 20 s poll, viewers, fallbacks)
**Scope:** Fix delta only — re-review of the 5 commits landed in response to the initial review (`pr-7-review.md`).
**Reviewers (resumed via SendMessage, full transcript context):** typescript-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, database-reviewer (all Opus)
**Date:** 2026-07-21

> **For the implementing instance:** This document is self-contained. You do not need to reread `pr-7-review.md`.

## Verdict

**APPROVE — unanimous, zero new findings.**

All five findings are closed — including the optional L1 (taken) and M1's decision, which went to **adopt** with an `unknown` bucket that kills the exact drift path the review named. Every claimed red-first arm was independently mutation-verified. The finding-per-fix-round pattern did not recur (second clean fix round in a row). PR #7 is ready for merge.

## Pre-flight gates (re-verified after fixes)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 207 passed, 0 failed (33 files) |
| Rust surface | none in fix round |
| `npm run check:all` (orchestrator re-run, post-mutation-restore) | green, exit 0 |
| Working tree at review end | clean, HEAD `6dfd7a7` |

## Fix commit → original finding mapping

| Commit | Original finding | Type of fix | Verdict |
| --- | --- | --- | --- |
| `169c698` | **H1** sign-error → eternal loading, escape hatch unreachable (HIGH — the REVISE gate; photo sibling included) | `signFailed={isError}` threaded into both modals; failed panel carries open-externally (which mints its own fresh URL); honest copy split (pending vs failed); 4 red-first arms; keys ×3 locales | **CLOSED** |
| `d69783c` | **L2** viewer `<img>` no onError | Self-heal ladder extracted into shared `useSelfHealingSignedUrl` (thumb + viewer host); per-photo-id ladder reset; 2 red-first arms | **CLOSED** |
| `fd396e6` | **M1** MediaKind trigger passed with no decision (MEDIUM) | **Decision: adopt.** `MediaKind = 'image'\|'video'\|'audio'\|'unknown'` at the view-model; total normalizer at the mapper choke point; unknown = visible fallback tile + sign-on-demand; raw wire type stays open; D18 rider trimmed; 3 red-first arms | **CLOSED** |
| `95690c6` | **L1** viewer index shifts on mid-view soft-delete (optional) | Paging keyed by photo id, index derived for wrap math; 1 red-first arm | **CLOSED** |
| `6dfd7a7` | **L3** test comment overclaims focus-independence | Comment softened to what jsdom proves; no production change (per the three-lane query-core verification) | **CLOSED** |

## Reviewer verdicts at a glance (fix delta)

| Lane | Own findings closed | New findings | Verdict |
| --- | --- | --- | --- |
| silent-failure-hunter | H1 ✓ (+ photo sibling) L2 ✓ | 0 | APPROVE |
| type-design-analyzer | M1 ✓ | 0 | APPROVE |
| typescript-reviewer | L1 ✓ | 0 | APPROVE |
| pr-test-analyzer | L3 ✓ | 0 | APPROVE |
| database-reviewer | n/a (narrow lifecycle re-check) | 0 | APPROVE |

## Closed findings — verification detail

- **H1 (silent, re-walked):** sign failure on player open now renders the failed panel with the escape hatch; open-externally calls `openMediaExternally` → a DIRECT `createSignedUrl` — it never touches the dead standing query, so recovery genuinely works; the retry-cycle branching is exact (TanStack `isError` stays false during backoff → loading shows only while genuinely pending; latches true on exhaustion → failed panel; no lying state in either direction); ImageViewer's failed state is distinct with truthful copy; all new keys 1:1:1 in en/fr/ar. Test lane's mutation (remove the `signFailed` threading) reproduced the exact original stranding red.
- **L2 (silent + ts + db, three angles):** the extraction preserved the one-shot policy verbatim (spent state still auto-recovers at the next 50-min re-sign); state is per-component-instance — no cross-consumer bleed between the always-mounted thumb and the id-keyed modal host; paging remounts reset the ladder; the query options are byte-identical (db: pure wrapper refactor); the viewer `<img>` mutation (remove `onError`) went red.
- **M1 (types, probed):** normalizer total (every string maps, no throw), single call site; a typo'd literal now fails compile (`TS2367` — probed and reverted by inverse edit, discipline restored); the sharpest drift path is dead — a drifted-kind mime-renderable row now takes the visible fallback tile with sign-on-demand instead of a silent never-signing placeholder; unknown rows stay visible in the strip; the mutation (unknown→'image' in the normalizer) went red on two arms.
- **L1 (ts, four sub-checks):** neighbour soft-delete → same photo re-located; own deletion → clean close; wrap math correct with the derived index; F1 reorder immunity intact. Mutation (revert to index keying) reproduced the viewer collapse red.
- **L3 (tests):** the comment now states exactly what jsdom can prove and why the hidden-past-TTL edge is backstopped — honest closure, correctly production-free.

## New findings introduced by the fixes

None — all five lanes, independently. Second consecutive clean fix round (both followed the same shape: fully-specified remedies from the prior review, executed without scope creep).

## Observations recorded (no action)

- **Playback can end ~10 min early on a rare transient** (silent): if a background re-sign errors while a video plays, `isError` flips the player to the failed panel even though the retained URL may have ~10 min of TTL left. Loud, honest over-eagerness — never hides anything; open-externally is present. Awareness only.
- **`MediaSummary` doesn't tally unknown rows** (types): an unknown-kind row shows a visible tile but isn't counted in the summary text. The load-bearing property (never vanishes from the wall) holds; the count omission is a display choice.
- **D8 note for later** (db, from the initial round, restated): `createSignedUrls` batch returns per-path errors inside `data[]` — the D8 upgrade must handle partial failure.

## Architecture invariants — re-verified clean

- Signed-URL lifecycle constants and query options byte-identical through the extraction; signing volume unchanged or lower (viewer-on-signed-thumb is a cache hit; paged-off queries go inactive, zero network, GC'd before TTL); AD11 exclusion and T5 (`failedUrl` never logged/rendered/messaged) intact (database-reviewer).
- Rules of hooks satisfied in the shared hook (unconditional calls, no effects); reset-by-key-remount is the idiomatic pattern — no misuse-prone `resetKey` param (ts + types).
- `OpenMedia` union still well-formed under id-keying; missing id resolves to a clean close, never an invalid render (types).
- Counts: 207 = 137 numbered (unchanged) + 70 supporting; the 10 new arms itemized per file and per commit (H1 ×4, L2 ×2, M1 ×3, L1 ×1); doc 03 correctly untouched (tests).
- Flake: 0/20 on the heaviest new async file. Tree clean at HEAD after all mutations, no `git checkout` used (tests).

## Recommended next steps

**Ready for merge** — owner's specs: `gh pr merge 7 --merge --delete-branch`, then `git checkout main && git pull && git fetch --prune`. Zero open findings across the initial review and this delta. This artifact is the last uncommitted review record — commit it with or before the merge per the review-artifacts rule. Next up per the plan: M5 — remember the **D15 entry criterion** (health indicator lands before anything else) and D18 now fires at first `exportInformation` consumption.

## Reviewer pipeline notes

- **The M1 fix exceeded its finding in the right direction again:** the review asked for a decision; the fix made one, added the `unknown` bucket (matching the location-status catch-all precedent), and re-surfaced previously-dropped unknown rows in the strip. Third instance of understand-don't-pattern-match on this project.
- **The escape-hatch trace mattered:** H1's fix would have been hollow if open-externally reused the errored query — silent's explicit trace that it mints a fresh token directly is what makes the closure real, not cosmetic.
- **Probe discipline restored:** type-design reverted by inverse edit this round after last round's `git checkout` slip; the brief restated the rule and it held.
- Resume-for-fix-delta continues to perform: every lane quoted its original wording and re-ran its own proof class without re-derivation.
