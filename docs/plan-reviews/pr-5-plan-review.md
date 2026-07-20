# Plan Review: PR #5 — docs(plan): Amendment A2 — process panel, M2 as-built corrections, design bindings

**Reviewed**: 2026-07-20
**Branch**: plan/canvas-hub-a2 → main
**Scope**: **A2 delta only** (single commit `eb3fef2`, +385/−40). The base plan (PR #1), Amendment A1 (PR #3), and the merged M1/M2 code are reviewed baseline — read for context, not re-reviewed. The "M2 as-built corrections" are docs catching up to shipped, already-code-reviewed code; the code itself was explicitly out of scope.
**Docs reviewed**: 7 files (3 plan docs + the new design brief + the ledger + 2 committed review artifacts)
**Lanes (fresh dispatch, all Opus)**: plan-architect-reviewer · plan-quality-checker · plan-reality-checker · rust-reviewer (proposal) · typescript-reviewer (proposal) · database-reviewer (proposal)
**Decision**: REVISE
**Conflicts surfaced**: 0
**Plan grounding (delta)**: 20/23 repo-facing claims verified

## Summary

**REVISE** — zero CRITICAL, ten HIGH after dedupe, and a striking cross-lane consensus on the diagnosis: **the A2 decisions are sound; the propagation is not.** Every lane that judged the product decisions endorsed them — the in-main panel is strictly cheaper than the window it replaces (no secondary auth topology, no second JS context, no capability file, no token handshake; it genuinely shrinks M7), AD15 is a properly-written hardware-contingent decision rather than a deferral in disguise, and the moved Rust commands strand nothing. The failure mode is uniform: **A2 amended one document and left its mirrors behind.**

Three defects stand out as the ones that would actually stop work. First, **the port is not executable as specified** — the TypeScript lane opened the source feature and found its render boundary typed to an agent SDK's message stream, with four `@/features/*` aliases that don't exist in this repo, so "port as shipped + one adapter" fails `tsc` on the first file. Second, **doc 02 still specifies `RECONCILE_MS = 300_000`** in the very phase row that defines the constant, while doc 01 now pins 60 s with a reconcile<stale invariant — an implementer reconciling code to plan reverts the exact fix the PR #4 cadence dispute produced. Third, **the new design brief contradicts the amendment it ships with on three points and claims precedence over it** ("where they conflict on design matters, this brief wins"), so a prototype gets approved with a collapsed panel, a dashboard-hosted feed, and banned timestamp formats — then binds M3–M6.

The as-built half of A2 is in good shape: the reality and database lanes independently verified every §5.1/§5.2/§5.4 correction against shipped code line-for-line, **including the `RECONCILE_MS < STALE_AFTER_MS` tripwire that a prior review flagged as missing** — it now exists at `src/store/health-store.test.ts:35`, so the plan's "test-pinned" claim is honest. Counts reconcile perfectly: 126 verified three ways with #120's reassignment consistent in all five places.

## Disputed Findings (Agent Conflicts)

**None.** All six lanes converged. The reality lane returned APPROVE-with-comments against four REVISE verdicts, but that reflects its narrower remit (repo-claim verification only), not disagreement — its three findings are subsumed below at the same or higher severity.

## Findings

### CRITICAL

None.

### HIGH

**[HIGH-1] Phase 6.3A's port is not executable as specified — the source feature's contract is agent-pipeline-shaped and four of its imports don't exist here**
Source agents: typescript-reviewer (HIGH; read the source at the external path) + plan-architect-reviewer (MEDIUM: 6.3A is the plan's largest code unit and its only row with no file-level signatures) + plan-quality-checker (MEDIUM: the adapter is the one net-new file with no signature) — merged
Doc: 02:316 (6.3A), 02:36 (AD14 revised)
Issue: 6.3A says port "components/services/types **as shipped there**" plus one new `sources/canvasHubSource.ts`. The port's render boundary is not source-agnostic: `SessionData { messages: PipelineMessage[]; result: PipelineResult | null; isRunning: boolean; feed: FeedModelType }`, consumed by `SessionPanel`, with `ProcessTerminal` dispatching on `ProviderKind = 'sdk' | 'claw' | 'empty'`. Feeding health transitions and log lines through it means synthesising `PipelineMessage[]` and a `FeedModel` — tool-call block projections with no canvas-hub analogue — or rewriting the types, contradicting "as shipped". **`tsc --noEmit` fails on the first file**: `@/features/shared`, `@/features/agentPipeline`, `@/features/clawDirect`, `@/features/renderers` do not exist in this repo (verified across nine files). Three further gaps: two simultaneous lanes versus a single `provider: ProviderKind` prop; **"health-store transitions" don't exist** (the store exposes current `state` + `marks` only, no transition log, and isn't created with `subscribeWithSelector` — the adapter must diff off a vanilla subscribe, ~5 lines, unstated); and a `.ts` adapter cannot call `useHealthStore`/`useCanvassStore` (the port's own `sources/*` are `.tsx`).
Fix: Split 6.3A. Name the **retained** surface explicitly (pure lane renderers: `TextLane`, `RichLane`, `vtEngine`, `ansiParser`, `crt.css`, header/footer chrome) versus the **discarded** surface (the `ProcessTerminal` dispatcher, `sources/ProcessTerminal{SDK,Claw}`, and the `feedReducer`/`coalescer`/`displayPayloads` block model if not kept). Pin the adapter as a signature — e.g. `ProcessPanelRow { at: number; lane: 'activity' | 'system'; source: string; text: string }` — and rename it `canvasHubSource.tsx`.

**[HIGH-2] The ported test suite is unaccounted for against a plan whose own rule halts work on count drift**
Source agents: plan-quality-checker (HIGH) + typescript-reviewer (MEDIUM) — merged
Doc: 02:36 ("~7.5k lines **incl. tests**") vs 02:316 (enumerates only components/services/types); 03:55; 03:348 / 02:406 ("if counts drift during implementation, reconcile both documents **before proceeding**")
Issue: AD14 counts tests inside the port; 6.3A's enumeration omits them; doc 03 allocates Phase 6.3 exactly five tests in one new file. The port ships **13 test files** (8 component, 3 service, 2 source) that `vi.mock('@/features/renderers')`, `vi.mock('react-data-grid')` and use `PipelineMessage`-typed fixtures — they cannot run here unmodified, and `check:all` runs `test:run`. Either answer trips the plan's own gate on arrival: keep them (~139 tests, unaccounted) or drop them (7.5k ported lines land with five tests). `03:58`'s "no existing test file is deleted" governs repo files, not imported ones.
Fix: State the disposition in 6.3A — which ported test files come across (those covering retained surface: `ansiParser`, `vtEngine`/`TextLane`, `rich`), which are dropped with the discarded dispatcher, and whether ported tests count toward the 126 (recommended: excluded, with the 126 counting canvas-hub-authored tests only).

**[HIGH-3] `RECONCILE_MS` is still `300_000` in doc 02 — in the phase row that defines the constant**
Source agents: plan-quality-checker + database-reviewer — merged (independent)
Doc: 02:169 (2.5A) and 02:135 (2.2B, "5 min") vs 01:346, 01:393
Issue: A2 pinned `RECONCILE_MS = 60_000` as-built in doc 01 with "invariant: reconcile < stale, test-pinned" (`STALE_AFTER_MS = 90_000`), but 2.5A — the signature that *defines* the constant — still reads `300_000`, and 2.2B still says "(5 min)". Doc 02 is declared authoritative for file-level detail and flags neither as superseded. Shipped value is `60_000` (`health-store.ts:36`); the ledger (D15) records 60 s as the deliberate fix. An implementer touching health/query config in M5–M6, or any pass reconciling code to plan, reverts it — reintroducing the false-STALE arithmetic (a healthy quiet board reading stale ~4 of every 5 minutes) that the PR #4 cadence dispute was resolved to eliminate. No test name catches a constant edit that also updates its own test.
Fix: 2.5A → `RECONCILE_MS = 60_000` with the A2 marker; 2.2B → "(60 s)"; restate the invariant inline.

**[HIGH-4] Doc 02's catch-up mechanism is still a deny-list; shipped M2 is an allow-list — new M3/M5 query families would silently get no catch-up**
Source agent: database-reviewer
Doc: 02:33 (AD11), 02:170 (2.5B), 02:227 (4.1B)
Issue: All three still describe catch-up invalidation as an **exclusion predicate** on `SIGNED_URL_KEY_PREFIX`. Shipped code is the inverse — `predicate: query => isCaseDataKey(query.queryKey[0])` (`useConnectionHealth.ts:21-25`) backed by `CASE_DATA_KEY_FAMILIES` (`health-store.ts:61-73`), whose comment records the fix-delta change. The two mechanisms differ precisely on *new* families: M5 adding `['roster', caseId]` gets automatic catch-up under the documented deny-list and **never** under the shipped allow-list — so after a sleep/wake the dashboard renders pre-sleep data behind a green `live` indicator, the exact G4 violation the plan exists to prevent. Nothing tells the M5 implementer that a new case-data family must be registered.
Fix: Rewrite AD11/2.5B to the allow-list, name `CASE_DATA_KEY_FAMILIES` as the single registry, and add the obligation explicitly: **every new case-data query family must be registered there or it gets no catch-up refetch.** Adjust 4.1B — signed URLs are excluded by *not being in the allow-list*.

**[HIGH-5] The activity feed is evicted from the dashboard in M5, but its new home ships in M6 — and four documents still put it in the dashboard**
Source agents: plan-architect-reviewer + plan-quality-checker + typescript-reviewer — merged (three lanes)
Doc: 02:282 (5.3A, "does NOT live here") vs 02:261 (5.1A creates `ActivityFeed.tsx`), 02:51 (M5 outcome "dashboard shows counts/roster/**feed**"), 03:255 (**test #98**, "feed rendered within dashboard"), design/prototype-brief.md:17
Issue: A2 amended only 5.3A. M5 therefore ships `ActivityFeed.tsx` with **zero call sites** (a dead export `knip` will flag) while its own definition-of-done — "Feed shows most-recent-first case-scoped entries" — is unachievable until 6.3 lands in M6, breaking the plan's "every milestone ends with a working app" invariant. Test #98 asserts the exact placement 5.3A forbids, and the brief (which claims precedence) backs the test. Unanswerable from the docs: where does `ActivityFeed.tsx` mount at M5, and does 6.3A's ACTIVITY lane reuse it or the ported row renderer?
Fix: Pick one home and propagate: retire/reassign #98 (adjusting Appendix C / Summary if the count moves), fix the M5 row at 02:51, state in 5.1A/6.3A whether the ACTIVITY lane hosts `ActivityFeed.tsx`, move the Appendix A entry, and correct brief §3.

**[HIGH-6] The design brief contradicts A2 on three points and declares itself authoritative over them**
Source agents: plan-quality-checker (HIGH) + plan-architect-reviewer (HIGH, within its findings) + plan-reality-checker (MEDIUM) + typescript-reviewer (MEDIUM) + database-reviewer (MEDIUM) — merged (five lanes)
Doc: design/prototype-brief.md:31, :17, :37 with the precedence clause at :5 ("where they conflict on design matters, **this brief wins**") vs 02:36 (AD14), 02:318 (6.3C), 02:282 (5.3A), 01:358 (rule 6), 03:329 (**test #125**)
Issue: Three conflicts, all pointing the designer the wrong way, all under a clause that makes the brief win: (a) **panel "collapsed by default"** vs AD14/6.3C's "default-open on ACTIVITY (wall posture)" and #125's "fresh mount ⇒ panel expanded"; (b) the brief's panel is **SYSTEM-only** — it never mentions an ACTIVITY lane, so the designer won't design one — while the **activity feed sits in the case dashboard** (§3), against 5.3A; (c) the brief's `arrived 14:32` / `"2m ago"` against new rule 6's "every rendered timestamp carries seconds; dates always explicit `yyyy-mm-dd`". The wall-posture rationale exists only in doc 02; the designer never sees it. The brief also leaves the map-view "overlay vs squeeze" question to the designer — the one thing 6.3C needs decided before it can be implemented. A prototype built to this brief gets approved as the binding design, and M5/M6 inherit an unresolvable conflict.
Fix: Bring brief §3, §7 and §8 in line with AD14 revised (feed out of the dashboard, panel two-lane, default-open on ACTIVITY, rule-6 timestamps), and scope the precedence clause so it cannot override pinned behavior ("aesthetics, not composition or defaults").

**[HIGH-7] The default-open panel collides with spec §4 on the map view, and no phase owns the card-stack ↔ panel geometry**
Source agent: plan-architect-reviewer (typescript-reviewer independently flagged the resize consequence)
Doc: 02:36 (AD14), 02:318 (6.3C), 02:216 (3.4A), 02:31 (AD9, unrevised); spec §4 at "docs/plans/initial plan/canvas-hub-spec.md":144,156
Issue: Spec §4's non-negotiable: "No side panels docked to the viewport edges… Cards float clear of the map's left/right edges (no full-height rails)." The ACTIVITY lane **is** location information ("location added", "status → complete"), so A1's "nav chrome, not an info panel" argument does not carry. Sharper: **AD9 used spec §4's exact words to justify emptying that same slot** ("Stop rendering panels in `MainWindow`… the smallest diff that satisfies 'no edge-docked panels'"), and A2 revives it without revising AD9 — only 01:121 records the reversal. And no phase owns the geometry: 3.4A ships `LocationCardStack` overlay positioning in M3 with no knowledge of a right-edge panel; 6.3C adds no MODIFY row for it. At implementation the card stack either gets a magic right-offset tracking the panel's expanded width (a cross-feature layout coupling AD11 doesn't sanction) or the panel overlays the cards.
Fix: Revise AD9 to record that A2 supersedes it, and pin the map-view posture in AD14/6.3C — either the panel auto-collapses to the SYS tab on the `map` view (default-open applying to `cases`/`case` only), or 6.3C adds a MODIFY row naming the single owner of the panel-width offset.

**[HIGH-8] `process-panel` → canvass is a new cross-feature edge AD11 forbids, and the ring it needs isn't barrel-exported**
Source agents: plan-architect-reviewer + typescript-reviewer — merged (plan-quality-checker concurred at MEDIUM)
Doc: 02:33 (AD11, unchanged by A2) vs 02:316 (6.3A, "the ACTIVITY lane renders the canvass activity ring")
Issue: AD11 states its inventory exhaustively — "**the only** feature→feature imports are one-way, read-only barrel consumptions: canvass → cloud-session … and canvass/cloud-session → preferences". A2 adds a third feature that consumes canvass state and doesn't amend it. The ring is `useCanvassStore` in `canvass/store/canvass-store.ts`, and `canvass/index.ts` exports exactly one symbol (`CanvassRoot`) — so the only import that compiles is `@/features/canvass/store/canvass-store`, which matches `barrel-export-enforcement.yml` (`severity: error`) → **`ast:lint` fails → `check:all` red**. (Reading the *health* store is fine; AD11 homes it in the global layer.)
Fix: Extend AD11's inventory with `process-panel → canvass` (one-way, read-only) **and** add the canvass-barrel addition as an explicit MODIFY row in 6.3 — a read-only activity selector/hook. Alternative: hoist the ring to the global store layer alongside health (no AD11 change, bigger M2 edit). Say which.

**[HIGH-9] A2's two shell-level bindings are assigned to leaf files that structurally cannot own them**
Source agents: plan-architect-reviewer (HIGH) + typescript-reviewer (MEDIUM, with the hide-mechanism detail) — merged
Doc: 02:193 (3.2B), 02:37 (AD15)
Issue: 3.2B puts both new bindings on `MapCanvas.tsx` (NEW): "the map div **persists across views** (never unmount; `map.resize()` on view switch); scale strategy per AD15 (live-checked here)". As built, `CanvassRoot.tsx:47-49` renders `{view === 'map' && <MapPlaceholder />}` — **a child cannot prevent its own unmount when the parent's conditional flips**, and nothing inside `MapCanvas` observes a view switch to call `resize()`. Likewise AD15's `transform: scale(vw/1920)` applies to "the shell" — no phase row and no Appendix B entry touches `MainWindow.tsx`/`MainWindowContent.tsx`/`App.css` for 3.2. Both bindings are un-implementable from where they're assigned, and the WebGL context is torn down on every view switch — exactly what the binding exists to prevent. Two further unstated details: the **hide mechanism** is non-obvious (`display: none` makes a later `resize()` measure 0×0 → collapsed canvas; the container must stay laid out), and A2 adds a **resize trigger it doesn't list** — if the panel squeezes rather than overlays, collapse/expand changes the map width.
Fix: Add a Phase 3.2 MODIFY row for `CanvassRoot.tsx` (hoist the map above the view switch, hidden not unmounted), name the hide mechanism, list the resize triggers as a set (view switch, panel collapse/expand, window resize), and add a row naming the file carrying the AD15 shell transform. Add both to Appendix B.

**[HIGH-10] `read_log_tail`'s tail-slicing lands where Rust tests cannot run, with its two failure-prone details unpinned**
Source agent: rust-reviewer
Doc: 02:317 (6.3B); 03:325-331 (test-count table)
Issue: 6.3B puts the tail extraction in `cloud_session/services/mod.rs` — the app crate, where `[lib] test = false` means inline `#[cfg(test)]` can never run (AGENTS.md, "Testing Pure Rust Logic"). Phase 6.3's five tests are all TypeScript; Rust stays at 6. So the one genuinely tricky piece of new Rust in M6 ships untested, and the two details most likely to break are unspecified: (a) **UTF-8 boundary** — a seek-from-end read starts at an arbitrary byte offset, so `String::from_utf8` returns `Err` whenever it lands mid-codepoint, and the log is not ASCII-only (`TargetKind::Webview` routes frontend logs into the same file; the app ships `fr`/`ar`) → the panel renders its inline error row instead of the log, intermittently, forever; (b) **partial first line** — the first line of a mid-file slice is a fragment nothing says to drop, so the SYSTEM lane's oldest row is truncated on every read. (Placement is inherited from A1's 7.1A, but A2 moves it from M7 into M6 — cheaper to fix now.)
Fix: Pin the pure part as a free function in the existing Tauri-free `platform-utils` workspace crate, taking `&[u8]` → `String` (`from_utf8_lossy`, drop the first partial line, take the last `n` after clamping), with 2–3 Rust tests (non-ASCII split mid-codepoint; `lines` above the clamp; file shorter than the window). Raise the Rust count from 6.

### MEDIUM

**[MEDIUM] 6.3C's mount site is wrong twice over — the "RightSideBar slot" doesn't exist, and `MainWindow.tsx` is above the session gate**
Source agents: plan-reality-checker + typescript-reviewer — merged
Doc: 01:121, 01:481, 02:36, 02:318 (6.3C), deferred.md:10 (D6)
Issue: (a) M1 removed the render site — `MainWindow.tsx:20-30` renders `TitleBar` + `MainWindowContent` only, its docstring saying "no edge-docked side panels (AD9 — the sidebar files stay dormant)"; neither sidebar is rendered anywhere, and A1's "LeftSideBar → NavRail" happened in prose only (`NavRail.tsx` is a bespoke `<nav>` that doesn't import `LeftSideBar`). 01:468 (§11) still calls RightSideBar dormant, contradicting 01:121. (b) More consequentially, `MainWindow` renders unconditionally while the session machine and board live in `MainWindowContent.tsx:27-30` → `CanvassRoot`. Both panel data sources are **board-scoped**, so mounting there means the SYSTEM lane polls `read_log_tail` and the ACTIVITY lane renders during `booting`/`needs-setup`/`signed-out`/`schema-gate` — before anyone signs in, on an unattended wall board — and `CanvassRoot`'s unmount calls `resetCanvassStore()`, silently blanking a panel mounted above that boundary.
Fix: Describe what A1 actually did (a new component in the board tree, `CanvassRoot` as mount site) and gate the panel on `active`/`locked` — mount inside `MainWindowContent`'s active branch or `CanvassRoot`'s flex row, aligning its lifecycle with the ring reset. Reconcile §4/§11 and drop or restate "RightSideBar slot" in AD14/6.3C/D6.

**[MEDIUM] `mediaPlayerIncluded: boolean` is a pending change presented as an as-built correction**
Source agents: plan-reality-checker + database-reviewer — merged
Doc: 01:251
Issue: Its sibling correction (`form_data | null`) genuinely matches `database-types.ts:134`; this one does not — `database-types.ts:78` still declares `string`, and no phase or test reconciles it. Failure at M4/M5: the field typechecks as `string`, so React renders a boolean as **nothing** — the field silently disappears from the expanded card with no error and a green gate; any string method on it throws at runtime.
Fix: Mark it as an outstanding code change ("⚠ shipped type still `string`; correct at first consumption") or add a ledger row — not an as-built fact.

**[MEDIUM] The as-built `subscribeToCaseActivity` signature wasn't propagated to its call sites**
Source agents: plan-quality-checker + plan-architect-reviewer — merged
Doc: 02:145 (2.3A, restates the old three-arg form and calls it "doc 01 §5.2 **verbatim**"), 02:359 (7.3A), 03:315 (#118) vs 01:277
Issue: A2 rewrote the contract to the mount-scoped thunk form with two optional callbacks; doc 02's inline copy is unchanged and self-refuting, and 7.3A instructs `SecondaryRoot` to call it with a positional case id — a type error, with the deeper trap that a secondary must pass a getter reading *its own context's* store (the reason the getter exists). #118 encodes the wrong shape into the test that proves the M7 receive side. Relatedly, the new pre-filters own a `['location-counts']` key that appears in neither 2.2A/2.2B nor Appendix A.
Fix: Replace 2.3A's restatement with a pointer to §5.2 (or copy the five-arg form); update 7.3A and #118; add the counts query to 2.2.

**[MEDIUM] Timestamp rule 6 contradicts rule 3, 5.1A, and the brief**
Source agents: plan-quality-checker + plan-architect-reviewer + database-reviewer — merged
Doc: 01:358 (new rule 6) vs 01:355 (rule 3, `"arrived HH:MM"`, unamended), 02:261 (5.1A "relative timestamps"), brief:21,37
Issue: A2 added a hard rendering rule directly beneath a rule mandating the format it bans, and left the feed's and the card's specifications saying the opposite — with the brief's precedence clause inverting rule 6 for the designer. Three documents, three answers for the same rendered string; the feed (5.1A, M5) is the first surface built against the rule and its own row instructs violating it.
Fix: Reconcile rule 3 to rule 6 (e.g. `arrived 2026-07-20 14:32:07`), amend 5.1A to "absolute with seconds, relative age as secondary annotation (§5.5.6)", and align the brief — or scope rule 6 explicitly to system/liveness timestamps.

**[MEDIUM] 6.3B dropped 7.1A's signature detail — return types, `types/mod.rs`, and the `VaultStatus` field names**
Source agent: rust-reviewer
Doc: 02:317 (compare `main`'s 02:320)
Issue: Four things went with the move and now exist nowhere in the plan. (1) **Return types**: `vault_status(app) -> VaultStatus` is written infallible while every shipped `cloud_session` command is `Result<_, String>` — forcing the service to swallow keyring errors into `false`, so a locked or unreachable keychain renders as "no key present" and sends the operator to re-enroll, exactly misleading the person the panel exists to inform. `read_log_tail` likewise lost `-> Result<String, String>`. (2) `types/mod.rs` is absent from the file column though `VaultStatus` is a new four-derive IPC type. (3) The three field names (`config_present`, `vault_present`, `keyring_key_present`) no longer appear anywhere in the repo. (4) The `vault_get`-is-the-wrong-tool warning is gone.
Fix: Restore all four into 6.3B.

**[MEDIUM] No poll cadence, visibility gate, or in-flight guard for a permanently-mounted panel**
Source agent: rust-reviewer
Doc: 02:316 (6.3A), 02:36
Issue: A1's 7.3C said "polls on a **slow interval**" for a window opened on demand; A2 says only "`read_log_tail` polling" for a panel mounted for the life of a kiosk session measured in days — and the panel defaults to ACTIVITY, so the naive implementation reads 64 KB off disk forever for a lane nobody is looking at. Unspecified: the interval, whether polling stops when collapsed or on the ACTIVITY lane, and what happens when a read outlives its tick (an unguarded `setInterval` stacks concurrent reads).
Fix: Pin the cadence (5 s is ample), gate the poll on *expanded AND SYSTEM active*, and skip a tick while a read is in flight.

**[MEDIUM] Doc 01 doesn't document the `cancelStaleFetch` ordering guard that A2's 5× faster cadence made load-bearing**
Source agent: database-reviewer
Doc: 01:379 (Flow C3)
Issue: Flow C3 describes the realtime patch and says nothing about in-flight fetches. The shipped path cancels first (`useCaseRealtime.ts:117-121`, guarded on the entry having data). Without it, a reconcile that started before a broadcast resolves after the patch and overwrites the fresh row with an older snapshot — the card silently reverts. A2 raised the collision rate fivefold and is the amendment that made this guard load-bearing, yet it appears nowhere in the doc that owns flows; M4 and M5 will add patch paths from the same description.
Fix: Add to Flow C3 — cancel any in-flight fetch for that key **when the entry has data**; never cancel a first fetch (it would strand the query).

**[MEDIUM] The session-exit purge is undocumented, and M7's per-context QueryClient inherits the gap**
Source agent: database-reviewer
Doc: 01:330-335 (session-state table); 02:358 (7.3A); 03 #117
Issue: M2 shipped a three-part purge on board unmount — canvass store, health marks, and the case-data query cache — with its own comment recording why ("a cached list inside staleTime would suppress the sign-in refetch"). Neither doc records it. M7 consequence: 7.3A seeds three per-context singletons and #117 pins teardown as "channels removed + realtime disconnected + token discarded" — nothing about resetting stores or purging that window's own QueryClient. A popped-out map window sits on the ended screen holding operator A's location rows, requester names and DVR credentials; if operator B signs in without closing it, its cache is inside `staleTime` and renders A's data.
Fix: State the invariant once in doc 01 (session exit purges canvass store + health marks + all `CASE_DATA_KEY_FAMILIES` entries, **in every JS context**) and extend 7.3A/#117 to require it per secondary.

**[MEDIUM] §5.4's "binding for M5" paragraph omits the indicator's timestamp source and the second `reconnecting` cause's recovery path**
Source agent: database-reviewer
Doc: 01:343, 01:346
Issue: (a) The `live` row promises "updated HH:MM:SS" but the paragraph binds only `lastEventAt`, while the shipped machine derives `live` from `lastConfirm = max(lastEventAt, lastFetchOkAt)`. On the silent overnight board — the case Flow E4 was rewritten to protect — `lastEventAt` stays `null` forever while reconciles keep the state `live`, so an M5 implementer following the binding renders "updated —" beside a green dot. (b) A2 gave `reconnecting` a second cause (fetch error newer than last confirm) but the Behavior column still describes only the first ("on resubscribe: refetch"); there is no resubscribe for a healthy-socket/500ing-PostgREST degradation — recovery is the next successful reconcile — and the UI column doesn't distinguish them.
Fix: State that the displayed timestamp is `max(lastEventAt, lastFetchOkAt)`, and split the `reconnecting` row's Behavior/UI into its two causes.

**[MEDIUM] Phase 6.3 ships user-facing strings with no locales row**
Source agent: plan-quality-checker
Doc: 02:310-320 vs 02:158 (2.4C) and 02:284 (5.3C), which both carry one; Appendix B locales row = 1.4, 2.4, 5.3
Issue: The panel introduces lane labels (ACTIVITY/SYSTEM), the collapsed SYS tab and inline error rows, and 6.3A requires the port to pass the "i18n keys" gate — but no row names the locale files, the key namespace, or the fr/ar obligation. The port arrives with its own keys from another repo, so the merge target and RTL treatment are undefined; `ar.json` is RTL. Same shape at 4.3A′, whose `PHOTO n OF N` header names no key.
Fix: Add a `6.3D locales/{en,fr,ar}.json MODIFY — processPanel.* keys (ported keys re-namespaced)` row, extend the Appendix B locales row, and name the ImageViewer key.

**[MEDIUM] 6.3B's touchpoints and Appendix B miss integration points A2 created**
Source agents: plan-quality-checker + plan-architect-reviewer + rust-reviewer (nit) — merged
Doc: 02:317, 02:371-390, 02:182 (3.1C), 02:318 (6.3C), 02:85 (1.2G precedent)
Issue: `types/mod.rs` missing from 6.3B; `src/test/setup.ts` needs mocks for the two new commands so #120/#123 can mount the panel (1.2G names that file explicitly for its six commands; 6.3 names it nowhere and Appendix B's row still reads "1.2"); Appendix B's `MainWindow.tsx` row reads "1.4" though 6.3C modifies it and `bindings.rs` reads "1.2" though 6.3B regenerates it; 3.1C modifies a theme file with no Appendix B row. *(Correctly absent: `features/mod.rs` — `cloud_session` is registered from 1.2B — and any capability file, since app-defined commands invoked from `main` need none.)*
Fix: Add the missing touchpoints and phase tags.

**[MEDIUM] Stale cross-references survive the 6.3→6.4 renumber and the diagnostics removal**
Source agents: plan-quality-checker + rust-reviewer + plan-architect-reviewer — merged
Doc: 03:9, 03:91, 02:386, 02:353-355, deferred.md D9; 01:472
Issue: `03:9` sends the supabase mock-fake documentation to "Phase 6.3A" (now the port; docs are 6.4A); `03:91` defers the vault no-log re-check to "the Phase 6.3B pass" (now a Rust MODIFY); Appendix B files `docs/developer/README.md` under 6.3. Separately, **Phase 7.3's header and Goal still read "+ diagnostics window (A1)" / "diagnostics window ships"** three lines above the struck-out 7.3C, and 01:472 still promises the window seven lines before the A2 section that deletes it; ledger D9 still says "pop-outs + diagnostics M7".
Fix: Retarget the three renumbered references; strike "diagnostics window" from 7.3's header and goal; mark 01:472 superseded; update D9.

**[MEDIUM] D16's a11y resolution is homed on a file that cannot host it**
Source agent: typescript-reviewer
Doc: 02:205 (3.3B); ledger D16
Issue: The ledger entry is titled "**Location-card** selection a11y … `role="listbox"` on the **stack**", but A2 pins it to the 3.3B row whose file is `MarkerLayer.tsx` — which renders locations as a GeoJSON source + layers (WebGL output, no per-location DOM node to carry `role="option"`). An implementer either adds ARIA to the wrong file or splits `role="option"` (markers) from `role="listbox"` (stack) across two subtrees — invalid ARIA, since options must be owned by the listbox, so AT reports nothing.
Fix: Move the D16 clause to 3.4A (or a new 3.4 row naming `LocationCardStack.tsx` + `LocationCard.tsx`) and state the model in one line.

**[MEDIUM] Panel open/collapsed state duplicates the template's existing `rightSidebarVisible`**
Source agent: plan-architect-reviewer
Doc: 02:318 (6.3C), 02:36
Issue: 6.3C doesn't say what holds the boolean, and the port brings its own Zustand stores — so the likely outcome is two sources of truth: the shipped `Cmd/Ctrl+2` shortcut and two "show/hide right sidebar" palette commands keep toggling a `ui-store` boolean nothing renders, while the panel obeys its own store.
Fix: State that the panel's expanded/collapsed state **is** `useUIStore.rightSidebarVisible` (default flipped to open) so the existing shortcut and commands drive it; only lane selection is new panel-local state.

**[MEDIUM] The A2 liveness paragraph is inserted mid-table, orphaning the `offline` row**
Source agents: database-reviewer + plan-architect-reviewer — merged
Doc: 01:344-347
Issue: The paragraph lands between the `stale` and `offline` rows, so the table terminates at the blank line and `offline` renders as literal pipe text — the authoritative five-state table visually loses the one state with a distinct behavior contract, consumed by M5's indicator and M6's kiosk work. (Content and authority are right; placement is not.)
Fix: Move the paragraph below the `offline` row.

### LOW

- **[LOW] Appendix A refuses a count while Appendix B still asserts 63** (02:369 vs 02:390) — the refusal is the right call (see below), but the contradiction one line later reopens the arithmetic the amendment just closed. *(plan-quality-checker)*
- **[LOW] `react-data-grid` should be decided now, not at port time** — it is `^7.0.0-beta.59` in the source repo, and neither lane (health transitions, log lines, activity entries) produces tabular payloads; deferring adds a beta runtime dep to a kiosk app for a component with nothing to render. Drop `TableCard`. *(typescript-reviewer + plan-architect-reviewer)*
- **[LOW] 3.1C points `@theme` at `App.css`; the template's `@theme` lives in `theme-variables.css`** — `App.css` is three imports; tokens added there wouldn't reach the quick-pane entry or M7's `window.html`. *(plan-reality-checker)*
- **[LOW] Doc 01 §9 still says "No other new dependencies"** — contradicted by AD14's `react-data-grid`; add a conditional row or strike the absolute. *(plan-reality-checker)*
- **[LOW] The log filename is pinned as a literal derived from the template's `productName`** — correct today (`tauri-app.log`), but a rename silently moves the log and the SYSTEM lane goes permanently empty with no error. Derive from `app.package_info().name`. *(rust-reviewer)*
- **[LOW] `cloud_session`'s module doc comment excludes the log tail it will now own** — placement is right, but the feature's docstring makes the new command undiscoverable. One-line widening. *(rust-reviewer)*
- **[LOW] The V2 caveat names what to preserve but not the topic-reuse trap a per-case topic reintroduces** — switching A → B → A inside the leave window hits the same mid-leave channel reuse that line 266 forbids. *(database-reviewer)*
- **[LOW] The brief omits the unrenderable-media fallback tile** — a designed state §5.5.5 and M4's exit criterion both require, and the seed description drops the `image/heic` row that exists to exercise it. *(database-reviewer)*

## Per-Agent Tallies

| Agent | CRITICAL | HIGH | MEDIUM | LOW | Verdict |
|---|---|---|---|---|---|
| plan-architect-reviewer | 0 | 4 | 4 | 2 | REVISE |
| plan-quality-checker | 0 | 4 | 6 | 1 | executable-with-revisions |
| plan-reality-checker | 0 | 0 | 3 | 2 | APPROVE with comments |
| rust-reviewer (proposal) | 0 | 1 | 3 | 2 | REVISE |
| typescript-reviewer (proposal) | 0 | 3 | 5 | 1 | REVISE |
| database-reviewer (proposal) | 0 | 2 | 6 | 2 | REVISE |
| **Total (after dedupe)** | **0** | **10** | **15** | **8** | **REVISE** |

51 raw scored findings → 33 after dedupe. Heavy convergence: the design-brief conflict was found by **five** lanes, the feed relocation by three, the AD11 seam by three, the timestamp rule by three.

## Verified clean (positives)

- **The as-built corrections are accurate where they touch shipped code.** Reality and database lanes independently verified, line-for-line: the five-arg `subscribeToCaseActivity` signature and both callbacks' pre-filter placement; the side-channel keys; the liveness stamping point (`recordEvent` after envelope validation, before the table/case branch); `evaluate()`'s fetch-error clause; both constants; `form_data | null`; the envelope's `payload.id`/`meta.id` pinned by #47's live-captured fixture; the mount-scoped channel and its regression test.
- **The `RECONCILE_MS < STALE_AFTER_MS` tripwire now exists** (`health-store.test.ts:35`, commented with the round-2 mutation that motivated it) — the prior review's gap is closed, and the plan's "test-pinned" claim is honest.
- **Counts reconcile perfectly**: 126 verified three ways (Appendix C ≡ doc 03 summary ≡ actual rows), Rust 6 + TS 120, with #120's *reassignment* consistent in all five required places. Zero count findings.
- **The product decisions hold.** Every lane that judged them endorsed AD14's swap (no secondary auth topology, no second JS context, no capability file, no handshake — it genuinely shrinks M7), AD15 as a properly-written hardware-contingent decision with default/alternative/decision-point/criterion all named, and the Rust command move as correct ownership stranding nothing.
- **Appendix A abandoning its file count is the right call** (plan-quality-checker, the lane that caught it wrong three times): the count was never load-bearing — implementers execute the enumeration, not the integer — and it consumed review cycles each time. Conditional on Appendix B dropping its stale 63.
- **The brief matches the plan on everything else checked**: rail entries, pop-out affordances, seeded-canvass data (8 visible / 3-3-2 reconciles with 9 rows minus the soft-deleted one), DVR credentials as ordinary strings, connection-indicator states, the no-GPS-fix card, the RTL constraint, and "a diagnostics window" correctly listed out of scope.
- **Correctly out of doc 01** (database-reviewer): `cancelRefetch: false` coalescing is TanStack call-option tuning already tracked as ledger D17, and `visibilitychange` catch-up is already covered by Flow E3.

## Next Steps

1. **One editing pass closes six of the ten HIGHs**, because they are all the same defect — A2 revised one document and left its mirror: the `RECONCILE_MS` constant in 2.5A/2.2B, the catch-up mechanism in AD11/2.5B/4.1B, the feed's home across 5.1A/M5/#98/brief §3, the brief's three conflicts, the AD11 seam inventory, and AD9's supersession.
2. **Phase 6.3 needs restructuring before it can be executed** (HIGH-1, HIGH-2): name the retained vs discarded port surface, pin the adapter's signature, and state the ported tests' disposition against the 126. This is the plan's largest code unit and currently its least specified.
3. **Two ownership fixes**: give the shell bindings (map persistence, AD15 transform) phase rows on files that can hold them, and settle the map-view panel posture so 3.4A's card-stack geometry has an owner.
4. **The Rust HIGH is cheap now**: move the log-tail slicing into `platform-utils` with three tests before M6 rather than discovering the UTF-8 boundary in the field.
5. Re-run with `--fix-delta` after revision — all six reviewers are resumable by name below.

## Agent IDs
<!-- Used by /react-tauri-rust-plan-review --fix-delta to resume reviewers via SendMessage (address by name). -->
- plan-architect-reviewer: a2-arch
- plan-quality-checker: a2-quality
- plan-reality-checker: a2-reality
- rust-reviewer (proposal mode): a2-rust
- typescript-reviewer (proposal mode): a2-ts
- database-reviewer (proposal mode): a2-db

## Reviewer pipeline notes

- **The TypeScript lane read the source it was asked to review.** It opened the ported feature at its external path and found the contract mismatch — four non-existent import aliases and an agent-pipeline-shaped render boundary — which no amount of reading the plan could have surfaced. That single act converted "is one phase enough?" from a judgement call into a demonstrated blocker.
- **Five lanes independently flagged the design brief.** A conflict that visible from five different vantage points is not a nit; it is the amendment's most consequential loose end, because the brief's precedence clause makes stale defaults authoritative over a numbered test.
- **Fresh dispatch was forced, and cost something.** The A1-era plan reviewers were unreachable from this session, so these six started cold with self-contained briefs. They reconstructed the baseline well — but the A1 lanes would have known, without being told, that AD9 once used spec §4's exact words to empty the slot AD14 now refills. The architect lane found it anyway.
- **The reality lane's narrower remit produced the milder verdict** (APPROVE-with-comments vs four REVISEs) — not disagreement, but a reminder that "are the claims true?" and "is this executable?" are different questions. Its grounding stat (20/23) is the strongest single statement of confidence in A2's as-built half.
- **Two lanes caught the same defect class in opposite directions**: the plan asserts a test tripwire that now genuinely exists (good), and asserts an as-built type correction that does not (`mediaPlayerIncluded`). Verifying both directions is why the as-built claim class needs a reality pass, not just an architecture one.
