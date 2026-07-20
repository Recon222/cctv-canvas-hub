# Plan Fix-Delta Review: PR #5 — Amendment A2

**Reviewed**: 2026-07-20
**Scope**: Fix delta only — re-review of the single fix commit `e2fa070` (+339/−71 across 6 files) landed in response to the A2 review (`pr-5-plan-review.md`).
**Reviewers (resumed via SendMessage, full context, all Opus)**: plan-architect-reviewer · plan-quality-checker · plan-reality-checker · rust-reviewer (proposal) · typescript-reviewer (proposal) · database-reviewer (proposal)
**Decision**: REVISE

> **For the planner:** self-contained. You do not need to reread `pr-5-plan-review.md`.

## Verdict

**REVISE — narrowly, on one finding.**

**32 of 33 findings are closed**, and closed properly: five of six lanes verified their own items against the revised text and, where checkable, against shipped code. Several fixes went past what was asked and caught real defects on their own — the `lastConfirm = max(lastEventAt, lastFetchOkAt)` clause (without which a silent overnight board renders "updated —" beside a green dot), `vault_status` erroring rather than reporting all-false on a locked keychain, the log filename derived from `package_info().name`, the `display:none` → 0×0 `resize()` trap called out explicitly, and pushing `tail_log` into `platform-utils` so it is unit-testable on Windows at all. The count reconciles independently at **129 = 9 Rust + 120 TS**, three ways.

The one open item is a **factual error inside the fix itself**. The commit claims the port's retained surface was "verified against the actual source tree"; the TypeScript lane re-opened that tree and found **9 of 11 retained files still import either a nonexistent `@/features/*` alias or an explicitly-discarded module**. Worse structurally: `RichLane`'s prop contract is `DisplayItem` — a discriminated union living in the *discarded* `displayPayloads` — so the retained renderer set and the newly-pinned `ProcessPanelRow { at, lane, source, text, tone? }` contradict each other. One edit closes it: cut `RichLane` + `rich/*` + `EmptyPanel`.

The five new MEDIUMs are all one-row plan edits, three of them found by multiple lanes independently.

## Fix commit → original finding mapping

| Original finding | Sev | Verdict |
|---|---|---|
| HIGH-1 Port not executable (agent-pipeline contract, 4 dead aliases) | HIGH | **still open — narrowed** (see below) |
| HIGH-2 Ported test suite unaccounted vs 126 | HIGH | closed — retained-surface tests only, excluded from the numbered count, stated in five places; ported tests still run in the gate |
| HIGH-3 `RECONCILE_MS` 300_000 in doc 02 | HIGH | closed — 60_000 in 2.5A and 2.2B with the invariant inline; grep confirms the only surviving "5 min" is history |
| HIGH-4 Catch-up documented as deny-list | HIGH | closed — allow-list in AD11/2.5A/2.5B/4.1B, `CASE_DATA_KEY_FAMILIES` named as the single registry, registration obligation on the build path in three places |
| HIGH-5 Feed relocation half-done | HIGH | closed — dashboard-interim at M5 → panel ACTIVITY lane at 6.3; six documents aligned; #98 amended in place |
| HIGH-6 Brief contradicts A2 + claims precedence | HIGH | closed — §3/§7/§8 corrected, precedence scoped to aesthetics, "defaults are pinned, not yours to choose" |
| HIGH-7 Panel vs spec §4 on the map view | HIGH | closed — per-view posture pinned, overlay-never-reflow, AD9 carries an honest supersession note |
| HIGH-8 `process-panel → canvass` unsanctioned | HIGH | closed for the **data** seam (AD11 extended, 6.3E barrel row); **component** seam residual → new MEDIUM |
| HIGH-9 Shell bindings on leaf files | HIGH | closed for map persistence (3.2D owns the `CanvassRoot` hoist, hide mechanism named); **AD15 owner** residual → new MEDIUM |
| HIGH-10 `read_log_tail` untestable + UTF-8 unpinned | HIGH | closed — `tail_log` in `platform-utils` with #127–129; app crate does I/O only |
| 15 MEDIUM | MEDIUM | **all closed** |
| 8 LOW | LOW | **all closed** |

**32 / 33 closed.**

## Reviewer verdicts at a glance (fix delta)

| Agent | closed | still open | new | verdict |
|---|---|---|---|---|
| plan-quality-checker | 11/11 | 0 | 1 MEDIUM, 1 LOW | **executable** |
| plan-reality-checker | 5/5 | 0 | 1 LOW (grounding 21/22) | **APPROVE** |
| database-reviewer | 10/10 | 0 | 2 LOW | **APPROVE** |
| rust-reviewer | 6/6 | 0 | 1 MEDIUM | **APPROVE with comments** |
| plan-architect-reviewer | 10/10 | 0 | 3 MEDIUM | **APPROVE with comments** |
| typescript-reviewer | 8/9 | **1 HIGH** | 2 MEDIUM, 1 LOW | **REVISE** |

## Still open

**[HIGH] The retained port surface does not compile in isolation — the "verified against the actual source tree" claim is false**
Source agent: typescript-reviewer (re-opened the external source tree, file by file)
Doc: 02:314-318 (Phase 6.3A preamble + retained/discarded sets)
Issue: The preamble claims "every retained file is re-pointed to a canvas-hub home, or its importer is in the discarded set". Checked against the tree, **9 of 11 retained files** break that: `Footer.tsx` imports `PipelineResult` from the nonexistent `@/features/shared` *and* an unlisted `../services/formatTokenCount`; `RichLane.tsx` imports `DisplayItem` from the **discarded** `displayPayloads` and still `lazy()`-imports the **discarded** `TableCard`; `rich/ArtifactCard` imports a dead alias *and* a discarded module; `rich/FenceCard` imports two dead aliases (`@/features/renderers`, `@/features/shared`); `rich/KvGrid` imports a dead alias; `rich/{LogLine,ProgressBar,SectionMarker,StatusLine}` all import the discarded `displayPayloads`; `Header.tsx` and `EmptyPanel.tsx` import `ProcessTerminalBgMode` from this repo's `ui-store`, which has no such type. Only `TextLane` and the `ansi*`/`vtEngine` services are clean.
The structural half is worse: `DisplayItem` **is** the rich lane's entire prop contract — a discriminated union of payload variants (artifact/fence/kv/log/progress/section/status). Retaining `RichLane` + seven `rich/*` cards while discarding `displayPayloads` means re-authoring that union in canvas-hub *and* producing its variants from health transitions, log lines and activity entries — which the flat `ProcessPanelRow { at, lane, source, text, tone? }` structurally cannot express. **The retained renderer set and the pinned adapter contract contradict each other.**
Fix (one edit): retained set becomes `TextLane.tsx`, `vtEngine.ts`, `ansiParser.tsx`, `ansiSgr.ts`, `parseAnsiToHtml.ts`, `crt.css`, plus `Header.tsx`/`Footer.tsx` with `ProcessTerminalBgMode` either re-homed into this repo's `ui-store` as one exported union or `bgMode` cut, and Footer's `PipelineResult` token-count block cut (which also drops `formatTokenCount`). Discard `RichLane` + all of `rich/*` + `EmptyPanel` (it renders the source repo's changelog/quickstart — no canvas-hub job). That set's only external imports are `@/lib/utils`, `@/components/ui/{button,dropdown-menu}`, `react-i18next`, `lucide-react` — all present here — and it consumes exactly `ProcessPanelRow`. It also makes the `react-data-grid` drop real: nothing would still reference `TableCard`.

## New findings

### MEDIUM

**[MEDIUM] AD15's chrome-only scale cannot be produced from `MainWindow.tsx` — the DOM chain puts the map inside any wrapper that file owns**
Source agent: plan-architect-reviewer
Doc: 02:196 (3.2E), 02:37 (AD15), 02:195 (3.2D)
Issue: 3.2E assigns `transform: scale(vw/1920)` to "the chrome wrapper" in `MainWindow.tsx` with "the Mapbox canvas subtree stays outside the scaled ancestor". But 3.2D hoists `MapCanvas` **inside `CanvassRoot`**, and the shipped chain is `MainWindow → MainWindowContent → CanvassRoot → { NavRail, ProcessPanel, card stack, hoisted map div }`. Every wrapper `MainWindow` can own contains the map, and every chrome element sits in the same subtree — so no `MainWindow`-level transform can scale chrome and exclude the map. At 3.2 the implementer either drags Mapbox inside a CSS-transformed ancestor (the exact pointer-math/tile-crispness pitfall AD15 names as its reason for chrome-only) or invents an unassigned portal. AD15's *other* branch (whole-shell scale) works fine from `MainWindow` — the contradiction bites only on the stated as-built default.
Fix: `CanvassRoot` is the only node whose children split into "map div" and "chrome" — move the 3.2E row there, or state that 3.2E is the whole-shell branch with the chrome-only branch reassigned if the live check rejects it.

**[MEDIUM] The ACTIVITY lane hosts the `ActivityFeed` *component*, but 6.3E only exports a selector**
Source agents: plan-architect-reviewer + typescript-reviewer + plan-quality-checker — merged (three lanes)
Doc: 02:318 (6.3A), 02:321 (6.3C), 02:323 (6.3E), 03:329 (#122)
Issue: Residue of the closed AD11 HIGH. 6.3A/6.3C/#122 all say the lane **hosts `ActivityFeed.tsx`** (component reuse, file staying at `canvass/components/`), while 6.3E and AD11 authorise only "a read-only activity selector/hook (e.g. `useActivityRing()`)". So the panel's actual import has no sanctioned path: `@/features/canvass` doesn't export it, and `@/features/canvass/components/ActivityFeed` matches `barrel-export-enforcement.yml` (severity **error**) → `check:all` red at 6.3C. Redundant in the other direction too: `ActivityFeed` is case-scoped and reads the store itself, so if the panel renders the component, `useActivityRing` has **zero call sites** — the same knip argument the plan itself uses at 5.3A.
Fix: Pick one and make 6.3A, 6.3C, 6.3E, AD11 and #122 agree — either export `ActivityFeed` from the canvass barrel, or have `CanvassRoot` (a canvass file) inject `<ActivityFeed />` as the panel's lane child so nothing crosses the boundary, or keep the selector and have the panel render its own rows.

**[MEDIUM] One boolean, two writers, no precedence — the obvious effect stomps `Cmd/Ctrl+2`**
Source agents: plan-architect-reviewer + typescript-reviewer + database-reviewer — merged (three lanes)
Doc: 02:321 (6.3C), 02:36 (AD14), 03:332 (#125)
Issue: The panel's expanded state **is** `useUIStore.rightSidebarVisible` (good reuse — the shipped shortcut, two palette commands, the menu item and the titlebar button already drive it, verified). But posture is also view-derived: open on `cases`/`case`, auto-collapsed on `map`. Two writers, one boolean, no stated precedence. The obvious implementation — `useEffect(() => setRightSidebarVisible(view !== 'map'), [view])` — stomps every manual toggle: expand on the map view, switch away and back, it re-collapses; collapse on the case view, visit the map, return, it reopens uninvited. The shipped shortcut then reads as flaky. #124/#125 cover fresh mount and the toggle, not the view-switch round trip.
Fix: State the rule in 6.3C — e.g. "the view-derived posture applies on entry to a view; an explicit toggle wins until the next view change" (needs a `userOverride` flag or a `viewsSeen` set alongside the boolean) — and add a test asserting a manual expand on `map` survives `map → case → map`.

**[MEDIUM] `tail_log`'s pinned signature cannot distinguish a mid-file slice from a whole file — #127 and #129 are contradictory**
Source agent: rust-reviewer
Doc: 02:320 (6.3B′), 03:339, 03:341
Issue: 6.3B′ pins `pub fn tail_log(bytes: &[u8], max_lines: usize) -> String` and requires dropping the first partial line "whenever the slice is mid-file" — but given only bytes and a count, the function cannot know whether byte 0 is a real line start; the *caller* holds that fact (it seeked only if the file exceeded the 64 KB window). The test spec makes it explicit: **#127 asserts the drop; #129 asserts the first line is kept** ("the slice is not mid-file — nothing dropped"). Identical inputs from the function's view, opposite expectations. Implement to the headline rule and every log under 64 KB — a fresh install, any dev machine, day one on the kiosk — silently loses its boot line; implement to #129 and mid-file reads render a fragment as their oldest row.
Fix: One parameter the caller already has — `tail_log(bytes: &[u8], max_lines: usize, partial_first_line: bool)`, passed `true` only when 6.3B actually seeked. Both tests then pin a real contract; no other row changes.

**[MEDIUM] ImageViewer's i18n keys are filed two milestones after the component ships**
Source agent: plan-quality-checker
Doc: 02:322 (6.3D) vs 02:252 (4.3A′, Phase 4.3 = M4); Appendix B locales row
Issue: The fix round correctly named the `canvass.imageViewer.*` key but parked it in 6.3D, an M6 row. Phase 4.3 still has no locales row, so the plan tells the M4 implementer that translation keys aren't their phase's job — and `PHOTO n OF N` is user-facing wall copy on a modal that ships in M4. An M4 build renders the raw key for two milestones, in a plan where every milestone ends with a working app.
Fix: Move the clause into a new `4.3C locales/{en,fr,ar}.json MODIFY` row and add 4.3 to the Appendix B locales row; 6.3D keeps `processPanel.*`.

### LOW

**[LOW] "`rightSidebarVisible` default flips open at 6.3C" — it is already `true`**
Source agents: plan-reality-checker + database-reviewer — merged
Doc: 02:321, 02:388, plus four other repeats
Issue: `src/store/ui-store.ts:26` already initialises it `true`, and `ui-store.test.ts:18` pins that default. So 6.3C lists `src/store/ui-store.ts` as a MODIFY file for a change with nothing to do, Appendix B carries the row, and the wording invites "fixing" the existing test. (The store is `devtools`-only with no `persist`, so no stale `false` can survive a restart either.)
Fix: Drop `ui-store.ts` from 6.3C's file list and Appendix B; replace "(default flipped to open here)" with "(the template default is already `true` — no store change)".

**[LOW] "diffs `state` across notifications" is ambiguous, and the wrong reading floods the SYSTEM lane**
Source agent: database-reviewer
Doc: 02:318 (6.3A)
Issue: `state` is ambiguous between the store *field* (`state: HealthState`) and the whole store object — and this repo's own idiom points the wrong way (`useConnectionHealth.ts:57` uses `subscribe((state, previous) =>` where `state` is the store). Since `apply()` writes a fresh `marks` object on every `recordEvent()` — i.e. every broadcast envelope — an implementer diffing the object emits a SYSTEM row per envelope, burying the actual transitions the lane exists to show under a `live → live` firehose on a busy agency.
Fix: One word — "diffs `state.state` across notifications".

## Verification detail on the judgment calls

Three fixes resolved open options rather than defects; all three were checked and hold:

- **#98 amended in place** (rather than retired + renumbered) — plan-quality-checker confirms the exception is sanctioned in four places an implementer can land (the rule at 03:61 naming #98 and its trigger phase, #98's own row carrying *both* states, and both phase rows). It doesn't break the TDD red line (the amended assertion is red until 6.3C lands) or the numbers-never-shift rule, and coverage hand-over is explicit (#122 picks up "feed renders somewhere").
- **Dashboard-interim** — the same `ActivityFeed.tsx` 5.1A builds is hosted by 5.3A at M5 and *relocated* by 6.3C, so one implementation, one move, no throwaway; the knip rationale for why a zero-call-site component would fail M5 is correct. M5 ends with a working app again.
- **Ported-test exclusion** — stated in five places including the two hit first (doc 03 preamble, 6.3A), with both totals qualified "canvas-hub-authored tests only", so the reconcile rule can't be tripped by ported files while those tests still run in the gate.

**Independent recount**: 129 = 9 Rust (6 `secure-vault` + 3 `platform-utils`) + 120 TS, cell-for-cell identical across doc 02 Appendix C, doc 03 Test Count Summary, and a manual row count. The 6 → 9 Rust change propagated to all five places including the `cargo test -p secure-vault -p platform-utils` run command. No surviving "126" or "6 Rust".

**Grounding (reality lane)**: 21 of 22 new/changed repo-facing claims verified — `platform-utils` exists and is Tauri-free with the workspace membership the plan cites; `rightSidebarVisible` and all four of its existing drivers exist ("zero new plumbing" is true); the health-store has no transition log and no `subscribeWithSelector`; 3.2D's premise (a view conditional unmounts its children) holds; D16's re-home targets exist; D18 exists and frames `mediaPlayerIncluded` honestly against a shipped type that really does still say `string`. The one failure is the LOW above.

## Recommended next steps

1. **The one HIGH is a single edit**: redraw the retained/discarded line to cut `RichLane` + `rich/*` + `EmptyPanel`, deal with `ProcessTerminalBgMode` and Footer's token-count block, and the retained set both compiles in isolation and consumes exactly `ProcessPanelRow`.
2. **Three one-row plan edits** where lanes converged: name the panel-posture precedence rule (three lanes), settle the `ActivityFeed` component-vs-selector seam (three lanes), and move the AD15 transform to `CanvassRoot`.
3. **Two small pins**: `tail_log`'s third parameter (which also makes #127/#129 consistent), and the `canvass.imageViewer.*` key move to a new 4.3C row.
4. **Two one-word/one-line corrections**: `state.state` in 6.3A, and dropping the no-op `ui-store.ts` row.
5. No further review round needed after those — five of six lanes are already at APPROVE/executable, and the remaining HIGH has a named, bounded fix.

## Reviewer pipeline notes

- **The lane that found the original defect is the lane that caught the incomplete fix.** The TypeScript reviewer opened the external port tree in both rounds; the fix commit asserted that tree had been verified, and only re-opening it could show otherwise. A fix-delta that only re-reads the diff would have closed this HIGH.
- **Three-lane convergence twice over.** The `rightSidebarVisible` precedence gap was found independently by architect, typescript and database; the `ActivityFeed` seam by architect, typescript and quality. Both are one-row edits that no single lane's brief pointed at — they emerged from three different readings of the same new text.
- **Several fixes exceeded their findings**, which is worth noting because it's the opposite of the usual failure mode: `vault_status` erroring on a locked keychain rather than reporting all-false, the `lastConfirm` timestamp clause, the `display:none` → 0×0 trap, and the `package_info().name`-derived log path were all volunteered, not requested.
- **The reality lane's narrower remit again produced the milder verdict** (APPROVE at 21/22 grounding) while the proposal lanes found design gaps — a reminder that "are the claims true?" and "is this buildable?" stay different questions even when the same text is under review.
