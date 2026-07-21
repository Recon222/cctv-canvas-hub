# PR 7 — Aggregate Code Review

**PR:** [#7](https://github.com/Recon222/cctv-canvas-hub/pull/7) — feat(canvass): M4 — media milestone (signed URLs, 20 s poll, viewers, fallbacks)
**Branch:** `feature/canvas-hub-m4` → `main`
**Cut / Phase:** M4 of 7 (phases 4.1–4.3 + two smoke-fix commits F1/F2)
**Reviewers (fresh fan-out, all forced Opus):** typescript-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, database-reviewer. rust-reviewer not dispatched — zero `.rs` surface (correct coverage, not a gap).
**Date:** 2026-07-21

## Verdict

**REVISE.**

One HIGH, one root cause, two surfaces: both modal hosts consume the sign query's `data` but never its `isError`, so a failed signing call strands the video player on "Preparing video…" (with the open-externally escape hatch unreachable) and the photo viewer on "Loading photo…" — an error downgraded to a perpetual loading state at exactly the flaky-network moment honesty matters most. One MEDIUM rides along: the `MediaKind` hardening pinned by PR #6's L2 came due at M4 (8 new bare-literal `media.type` sites) and the trigger passed without a decision. Everything else across five lanes is LOW; four of five lanes returned APPROVE.

## Pre-flight gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 197 passed, 0 failed (33 files) |
| Rust surface | none in this PR (no cargo delta) |
| `npm run check:all` (orchestrator re-run, post-mutation-restore) | green, exit 0 |
| Pre-existing failures | none |

## Reviewer verdicts at a glance

| Lane | C | H | M | L | Verdict |
| --- | --- | --- | --- | --- | --- |
| typescript-reviewer | 0 | 0 | 0 | 1 | APPROVE |
| pr-test-analyzer | 0 | 0 | 0 | 1 | APPROVE |
| silent-failure-hunter | 0 | 1 | 1 | 1 | REVISE |
| type-design-analyzer | 0 | 0 | 1 | 0 | APPROVE |
| database-reviewer | 0 | 0 | 0 | 1 | APPROVE |
| **Deduped totals** | **0** | **1** | **1** | **3** | **REVISE** |

(Raw 7 findings → 5 deduped: silent's HIGH + MEDIUM share one root cause and merge; db's and tests' LOWs share the hidden-window scenario and merge.)

## Findings (deduped, ranked by severity)

### CRITICAL

None.

### HIGH

**H1 — Sign-query errors are discarded by both modal hosts → perpetual "loading" lie, escape hatch hidden** _(silent-failure-hunter; one root cause, two surfaces — the video case is the HIGH, the photo case rides with it)_
`src/features/canvass/components/LocationCard.tsx:343` (PlayerHost) + `:314` (PhotoViewerHost) → `VideoPlayer.tsx:92`, `ImageViewer.tsx:108`
Both hosts do `const { data: signedUrl } = useSignedUrl(...)` — `query.isError` is never read. When `createSignedUrl` fails on modal open (transient storage 5xx, network blip, outage — note `canPoll` gates the poll but not `useSignedUrl`), the query exhausts retries and `data` stays `undefined`:

- **Video:** `signedUrl === null` renders `canvass.player.loading` ("Preparing video…") forever. The `unplayable` fallback — which carries the open-externally escape hatch — is gated on `failed`, which can only be set by `<video onError>`, and the `<video>` never mounts. The coordinator sees an in-progress loader; nothing is loading, and the recovery affordance is structurally unreachable.
- **Photo:** same shape — eternal `canvass.viewer.loading`. Less severe (viewer closable, paging may recover) but the copy is a lie once the query has errored.

**Fix (one pattern closes both):** hosts pass `signFailed={query.isError}`; `VideoPlayer` renders the `unplayable` panel (with open-externally) on `failed || signFailed`; `ImageViewer` renders an honest failed state. Reserve "loading" for the genuine pending state.

### MEDIUM

**M1 — The L2/`MediaKind` trigger fired at M4 and passed with no decision** _(type-design-analyzer; probed)_
`src/features/canvass/types/index.ts:64` (`CanvassMedia.type` = open `string`), `services/mappers.ts:132` (pass-through, no normalization), 8 new bare-literal comparison sites (`MediaThumb.tsx:77,197`; `LocationCard.tsx:180-182,196`; `DashboardView.tsx:65-66`)
PR #6's L2 pinned the consumer-side `MediaKind = 'image' | 'video' | 'audio'` union as the cheap hardening, riding ledger D18's trigger. M4 is squarely that consumption — filters, strips, viewer/player routing, and the signing gate all branch on `media.type` — yet no union was adopted and no conscious re-deferral was recorded (the PR's deliberate-choices list covers only the RAW row staying open, which is correct and unflagged). Sharpest drift path: `wantsUrl = renderable && media.type === 'image'` — a drifted value on a renderable image silently never signs, permanent placeholder, green gate. **Probe result:** narrowing `CanvassMedia.type` to the union produces exactly ONE tsc error, at the mapper — the boundary where normalization belongs. **Fix:** adopt the union at the view-model with an explicit unknown-value bucket in `toCanvassMedia` (wire row stays open `string`), OR consciously re-defer with a fresh ledger row + trigger. The finding is the absent decision, not a today-reachable bug.

### LOW

**L1 — Viewer index can shift if an earlier photo is soft-deleted mid-view** _(typescript-reviewer)_
`LocationCard.tsx:208-209` — `viewerPhotos[open.index]` indexes a list the 20 s poll can mutate; removal of an *earlier* photo while viewing shifts the open viewer to a neighbouring photo (out-of-range is already guarded — clean close). Rare, no crash. Keying the open row by id removes the shift if ever wanted. Note-only.

**L2 — `ImageViewer`'s `<img>` is the only media element with no `onError`** _(silent-failure-hunter)_
`ImageViewer.tsx:109-113` — a transient byte-fetch failure renders the browser's raw broken-image glyph in the modal, breaking the "never a broken img" posture the thumb (self-heal) and player (fallback panel) uphold. Fix: an `onError` fallback or invalidate-once mirroring `SignedMediaThumb`. Natural companion to the H1 commit.

**L3 — Hidden-window (>60 min) URL expiry + the test comment that overclaims focus-independence** _(database-reviewer + pr-test-analyzer, same scenario from two lenses)_
`useSignedUrl.ts:29` — with the window genuinely *hidden* (minimized/covered; NOT mere focus loss) past the 50-min tick, a mounted thumb can briefly hold an expired URL once visible; backstopped by the `onError` re-sign and cannot arise on the always-visible wall deployment. Companion facet: `mediaService.test.ts:134-143`'s comment claims "no focus, no reconnect — re-signs on its own," but jsdom is always visible so the test cannot distinguish focus-independent from pauses-when-hidden. Fix: soften the comment to what jsdom proves (or add a `focusManager.setFocused(false)` arm if backgrounded boards ever enter scope). No production change for V1.

## Architecture invariants checked & confirmed

- **The focus-gating scare is conclusively refuted — three lanes, independently, from installed query-core 5.90.12:** `refetchInterval` gates on `document.visibilityState` (visibilitychange only — no blur/OS-focus listener in v5). Focus loss to another app/quick pane does NOT pause the 50-min re-sign or the 20-s poll; only true hidden/minimized does, and health's plain `setInterval` survives the pause and degrades honestly within ~90 s — a stalled poll is never silently green (ts + silent + db).
- **The canPoll self-silencing flap loop is disproven:** `canPoll` gates only on browser online/offline events; fetch errors degrade health to stale/reconnecting but never to offline, so failures keep retrying while the indicator honestly degrades (silent).
- **storage-js error contract verified from installed 2.110.7:** `{ data, error }` for storage errors (the `error !== null` check is the real contract), raw throw for network errors → query error state; the signed token is only assembled after a successful POST, so no thrown error can carry it — T5 holds on both branches. `createSignedUrls` batch exists for D8 (note recorded: per-path partial failures) (database-reviewer).
- **AD11 verified by construction:** `signed-url` is outside the `CASE_DATA_KEY_FAMILIES` allow-list and the catch-up predicate matches only that list — wifi-blip mass-re-sign is structurally impossible (database-reviewer).
- **TTL ladder coherent under v5 semantics** (refresh 50 < TTL 60; stale 40 forces refetch-on-mount before risk; gc 55 evicts before a resurrectable URL could expire), and the REFRESH < TTL invariant is test-pinned as a tripwire (database-reviewer + type-design).
- **Soft-delete + partitioning:** `.from('cloud_media_files')` (not an RPC — the RPC trap doesn't apply), server-side `deleted_at` filter AND the mapper choke point (belt-and-braces); storage path read from the row, never derived; shared `[MEDIA_KEY, caseId]` key dedupes N cards to one fetch — no N+1 (database-reviewer).
- **D14 genuinely closed:** `canPoll` consumed by the poll gate, `'media-new'` consumed by `mediaEntry`; ledger row removed (database-reviewer). `KIND_DOT` Record keeps ActivityKind exhaustive — no default-swallow (type-design).
- **The baseline ref cannot cross-contaminate cases** — keyed cache means `data` is never the old case's list on the switch render; first load is baseline, not news; both behaviors test-pinned (typescript + tests).
- **F1/F2 mutation-verified red-first:** video-first ordering (exact 4-photos+1-video fixture), both modals' capture-Esc, and the cleanup-only mutation isolating the scoped-teardown arm (tests).
- **One-shot self-heal "exactly once" genuinely pinned** (second `onError` asserts no re-invalidation), and the spent state auto-recovers at the next 50-min re-sign — bounded, visible, honest (tests + silent).
- **Modality and the portal wall:** viewer XOR player by construction (single `OpenMedia | null` union); the wall stops bubble-phase clicks/keys; F2's capture listener bypasses without weakening it; media clicks never trigger card select/fly-to (typescript + tests).
- **Thumb→viewer mapping is by id** — immune to F1's video-first reorder (typescript).
- **T5 bearer discipline clean:** no signed URL reaches any log, error message, or toast (silent grep + db source trace).
- **i18n complete:** all new keys in en/fr/ar; `audioCount` carries the full ar plural set; real-i18n tests make key renames detectable (silent + tests).
- **Counts reconcile three ways:** 197 = 137 numbered (unchanged, all pre-numbered rows) + 60 supporting; the 30 new arms itemized per file; #88's file-table move reconciled in docs 02+03 (tests).
- **Flake:** 0/30 on both timer-heavy files (fake timers throughout).

## Recommended next steps

1. **H1** — one fix commit: thread `query.isError` from both hosts into their modals (`signFailed` prop → honest failed state; video's carries open-externally). This is the REVISE gate.
2. **L2** — viewer `<img> onError` fallback; natural companion in the same commit or its neighbor.
3. **M1** — make the decision: adopt `MediaKind` at the view-model (probe says one mapper-boundary error — small) or re-defer with an explicit ledger row. Either closes it; silence doesn't.
4. **L1** — optional id-keyed viewer paging; or note-only.
5. **L3** — soften the test comment (one line); no production change for V1.
6. Fix round → mapping comment on the PR → `--fix-delta` before merge (standing rule).

## Agent IDs

<!-- Used by /react-tauri-rust-code-review --fix-delta to resume reviewers via SendMessage. Names are session-scoped: resumable by name within the originating session; a new session must fresh-dispatch. -->

- rust-reviewer: not dispatched (no `.rs` surface)
- typescript-reviewer: `pr7-ts`
- pr-test-analyzer: `pr7-tests`
- silent-failure-hunter: `pr7-silent`
- type-design-analyzer: `pr7-types`
- database-reviewer: `pr7-db`

## Reviewer pipeline notes

- **Three-lane convergence on a NON-finding is as valuable as one on a finding:** ts, silent, and db independently opened installed query-core and refuted the orchestrator's seeded focus-gating scare with the same line-level evidence (visibility-gated, not focus-gated). The seed was worth planting — the refutation is now load-bearing documentation, and silent's addendum (health's own interval survives the pause) completes the honesty argument.
- **Same line, two lenses, no conflict:** `wantsUrl = renderable && media.type === 'image'` was verified correct under T5 (db) and simultaneously flagged as M1's sharpest drift path (types). Both are right — the line is correct for today's values and is the best argument for the union.
- **H1 is the classic silent-failure shape this lane exists for** — every individual piece (query retries, null-as-loading, error-gated fallback) is locally reasonable; the composition strands the user. It was not on the orchestrator's seed list; the lane found it by walking the "what does the user SEE" question through the on-demand path.
- **Discipline slip, contained:** type-design reverted its probe via `git checkout` instead of inverse edit, against the standing rule, while the test lane had concurrent mutations in flight. No contamination occurred (disjoint file sets — verified by the test lane's requested cross-check, tree clean at HEAD), but the rule exists precisely for this overlap window. Future briefs will restate it in the probe instruction.
- Five of five lanes required the idle-without-report nudge this round; recovery-by-name worked every time.
