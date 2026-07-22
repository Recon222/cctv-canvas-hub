# PR 9 — Fix Delta Review, Round 2

**PR:** [#9](https://github.com/Recon222/cctv-canvas-hub/pull/9) — feat(canvass): M6 — kiosk hardening (idle lock, wake catch-up, ProcessPanel port)
**Scope:** Round-2 delta only — the single commit `fbabdcc` closing N2 (the Preferences/palette portal gap) from the first fix delta (`pr-9-fixes-review.md`).
**Reviewers (resumed via SendMessage):** silent-failure-hunter, pr-test-analyzer, typescript-reviewer. rust/database/type-design sat out — no surface in a one-effect layout change.
**Date:** 2026-07-22

> **For the implementing instance:** Self-contained; no need to reread the prior artifacts.

## Verdict

**APPROVE with comments — but close N3 before merge (do not defer).**

N2 is genuinely closed with fully-jsdom-pinned coverage. But the portal sweep the fix leaned on was **incomplete on a false premise**: the commit's exclusion note claims ImageViewer/VideoPlayer are "in-tree absolute overlays … so inert already covers them" — they are `createPortal(..., document.body)` (orchestrator-verified), so they escape `inert` exactly like the two dialogs N2 just closed. A media viewer/player left open when the lock fires stays interactive over the lock. That's **N3 [MEDIUM]** — the same portal-escape class this round was closing, still open for case media. By the strict severity rubric a MEDIUM-only round is APPROVE-with-comments; but the author's own stated bar for this extra round ("a surface editable behind the lock is the wrong thing for the hardening milestone to defer") applies *more* strongly to media + an external-open action than it did to app settings. One more one-effect fix closes it.

## Pre-flight gates (re-verified)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 333 passed, 0 failed (41 files; +1 arm) |
| `npm run rust:test` | 15 passed (unchanged) |
| `npm run check:all` (orchestrator re-run) | green, exit 0 |
| Working tree | clean, HEAD `fbabdcc` |

## Fix commit → finding mapping

| Commit | Finding | Verdict |
| --- | --- | --- |
| `fbabdcc` | **N2** (LOW) Preferences dialog / command palette portal-escape over the lock | **CLOSED** — mutation-verified, fully jsdom-pinned |
| `fbabdcc` | **N1** (LOW) persist-write-failure edge | **LEDGERED** (D20, accepted tradeoff) — verified present |

## Closed findings — verification detail

- **N2 (silent + test-analyzer + typescript):** the MainWindow effect fires `setPreferencesOpen(false)` + `setCommandPaletteOpen(false)` on the false→true `locked` transition; the `if (locked)` guard makes unlock a no-op (no resurrection); `getState()` reads live state; both store actions are real. **Mid-save safety confirmed** (silent): `setPreferencesOpen(false)` unmounts the dialog UI but does not abort an in-flight TanStack mutation — a Save already dispatched completes and the Rust write is atomic (whole-object temp+rename); a user mid-*edit* correctly loses unsaved edits. No half-written config either way. **Mutation-verified** (test-analyzer): removing either `setX(false)` reds that flag's independent assertion (N2a/N2b), so a single-dismiss regression can't slip; the "unlock doesn't resurrect" half is incidental-but-harmless (N2c stays green), as expected. Fully jsdom-pinned — no live-smoke leg needed (a plain state effect, unlike M1's `inert`). Effect correctness clean (typescript): dep array correct, no ordering hazard with M1's `inert` prop, canonical imports.
- **N1 ledger (verified):** D20 carries the persist-write-failure edge as an accepted tradeoff (fire-and-forget is correct — the wall must go up instantly; `atomic_write` rules out flag corruption).

## New finding introduced by / surfaced during the fix

**N3 [MEDIUM] — Media viewer/player stays interactive over the lock (portal escapes `inert`)** _(silent-failure-hunter; orchestrator-confirmed by direct read)_
`src/features/canvass/components/LocationCard.tsx:253-294`

The N2 commit's exclusion rationale is factually wrong. Both the photo viewer and the DVR player are `createPortal(<…Host … />, document.body)` (viewer at :255-280, player at :283-293 — both end in `document.body`; orchestrator-verified), **not** in-tree overlays. Portalled to body, they are siblings of `#root` painting above the `SessionLockOverlay` (which is `absolute inset-0 z-50` inside MainWindow's stacking context), so they escape the `inert` shell exactly like the two dialogs N2 closed.

**Adversarial sequence:** an investigator opens a location photo or DVR video from a card, then is called away; the idle timer (a open viewer does not reset it) counts down and `lock()` fires. The card is inert — but its viewer/player is portalled to `document.body` and stays fully interactive. A person who has not authenticated can page through the location's *entire* media array (`onNavigate` walks beyond what was on screen at lock), play/scrub the DVR video, and hit **open-externally** — which launches an external application with the case media.

**Severity MEDIUM, not LOW:** N2 leaked app *settings*; N3 leaks case *media* plus an external-open action that reaches outside the app sandbox. Mitigating context (the review weighed it): the locked board already displays media by owner directive (AD6 — lock alters no content), so the *viewing* delta is bounded; the genuinely-new capabilities behind the lock are (a) paging to media not on-screen at lock and (b) open-externally. The secured-room V1 posture could argue LOW, but the fix's exclusion note asserting these are covered when they are not means the gap is currently **undefended on a false premise** — it reads as closed in the tree and isn't.

**Fix (same one-effect pattern, at the state owner):** the open state is `LocationCard`-local (`setOpen`), which is why MainWindow's effect can't reach it. Close it where it lives:
```tsx
const locked = useSessionStore(s => s.state === 'locked')
useEffect(() => { if (locked) setOpen(null) }, [locked])
```
(Or gate the two `createPortal` calls on `!locked`. **Do not** inline them back into the tree — they portal deliberately to escape the AD15 board transform + stacking; inlining risks the M3 furniture-obscured bug.) Add a red-first arm mirroring N2's (viewer/player open → lock → `setOpen` null; unlock doesn't resurrect).

## Portal sweep — the rest verified complete (silent, this round)

The other exclusions hold: sonner toasts carry no `action` (non-actionable); the export dropdown is dead (earlier cut); Mapbox markers/popups render into the map container (in-tree, under `inert`, and are fly-to triggers not privileged actions); the native context menu is unused by board surfaces and `inert` blocks the `contextmenu` event anyway; no Radix DropdownMenu/Popover/Tooltip/Select on the board carries a privileged action. `createPortal(..., document.body)` is the only body-portal mechanism, and the three actionable surfaces are Preferences + palette (now dismissed) + the viewer/player (N3).

## Recommended next steps

**One more one-effect fix (N3), then merge.** This is the third instance of the same root class (`inert` doesn't cross portals) and the sweep is now provably complete — closing the viewer/player is the last portal surface. After that: mapping comment → a final scoped `--fix-delta` on the N3 commit (or, given it's a single guarded state effect with a red-first pin identical in shape to N2's, merge at the owner's judgment). **Do not merge `fbabdcc` as-is** while its own exclusion note claims the viewer/player are inert-covered — that leaves a MEDIUM undefended behind a false "covered" comment.

## Reviewer pipeline notes

- **This is the fix-delta earning its keep for the second consecutive round on the same root cause.** Round 1's delta found N2 (portal gap `inert` can't reach); the fix closed N2 but *asserted* the media viewers were covered; round 2's delta re-ran the sweep against that assertion and found the assertion false. The lesson: when a fix's correctness rests on an *exclusion rationale* ("these others are already covered"), the delta must verify the rationale, not just the code that changed — silent re-ran the whole portal sweep rather than only checking the two lines that moved.
- **Orchestrator verified the deciding claim by direct read** rather than accepting either the commit's "in-tree" assertion or the lane's "body portal" rebuttal — the code settles it (`createPortal(..., document.body)` at two sites), and it settles it against the commit.
- N2's own coverage is genuinely complete and the effect is correct — this round is not a regression of N2, it's an adjacent surface the N2 sweep mis-catalogued.
- Three-lane scoped resume, all needed the idle nudge; recovery-by-name held.
