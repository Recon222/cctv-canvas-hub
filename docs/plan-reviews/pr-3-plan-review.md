# Plan Review: PR #3 — docs(plan): Amendment A1 — three-view IA, nav rail, multi-window (M7), diagnostics

**Reviewed**: 2026-07-20
**Branch**: plan/canvas-hub-a1 → main
**Scope**: **A1 delta only** (+90/−11 across the three plan docs + deferred.md). The baseline was reviewed in PR #1 (initial + fix-delta) and reconciled post-M1; reviewers were resumed with that context and instructed to treat everything outside the delta as reviewed.
**Docs reviewed**: 4 files (01/02/03 plan docs + deferred.md)
**Lanes (resumed from PR #1, all Opus)**: plan-architect-reviewer · plan-quality-checker · plan-reality-checker · rust-reviewer (proposal) · typescript-reviewer (proposal) · database-reviewer (proposal)
**Decision**: REVISE
**Conflicts surfaced**: 0
**Plan grounding (delta)**: 11/15 repo-facing sub-claims verified

## Summary

**REVISE** — zero CRITICAL, five HIGH. Every HIGH lives in the M7 multi-window seam (session propagation + secondary hosting); the AD12 three-view/rail surface and AD14's product shape are essentially clean, and the four product decisions themselves were taken as given per the PR's ground rule. The five HIGHs are: (1) secondary REST/storage queries authenticate as **anon** — the plan pins realtime auth but no PostgREST token mechanism, so a popped-out board renders empty under RLS; (2) **no pinned channel carries the case id** to a pop-out — the command takes only `view`, the events carry only token/ended, and focus-if-open defeats URL delivery; (3) the reused views resolve a **null client and empty stores** in a secondary JS context — "hosting, not forking" has no specified seam; (4) the initial token **push races the listener attach** — secondaries boot to the terminal "session ended" state on essentially every open; (5) `session-ended` on idle lock **kills the popped-out wall map** — contradicting AD6's own "wall display keeps flowing" contract and the amendment's headline use case. All five are pin-the-mechanism doc edits, not topology rethinks: every lane independently endorsed AD13's main-as-sole-auth-owner topology as the right choice.

Grounding is solid where it matters: quick-pane genuinely is the create-once/show-hide async reference, vite multi-entry already has the quick-pane.html precedent, the Windows `LogDir` fix landed so `read_log_tail` has a real file, and the rail-vs-info-panel argument faithfully reads spec §4. The two grounding failures worth acting on: the "secondary-window checklist" the plan (and AGENTS.md) defers ghost-window/native-✕ handling to **does not exist**, and 7.1C routes secondary labels into the main-scoped `default.json`, which would over-permission pop-outs against the plan's own T9. The 121-test reconciliation was independently recounted and holds three ways.

## Disputed Findings (Agent Conflicts)

None. (One soft divergence, not a dispute: typescript-reviewer's clean-list accepted the lock→session-ended mechanism as *covered*, while architect/database challenge it as *wrong* — the former verified coverage, the latter judged design; the design challenge stands as H5.)

## Findings

### CRITICAL

None.

### HIGH

**[HIGH] Secondary REST/storage queries authenticate as anon — the user JWT reaches realtime but never PostgREST**
Source agent: database-reviewer (source-verified against installed supabase-js 2.110.7)
Doc: 01 §11 A1 pt 2; 02 AD13 + 7.2A; tests #114/#116
Issue: The token is installed only via `realtime.setAuth(token)`. supabase-js derives the REST/storage Authorization header from `_getSessionToken()` — the `accessToken` option callback or `auth.getSession()`, nothing else. With `persistSession: false`, no signIn/setSession (correctly forbidden — setSession needs the refresh token), and no `accessToken` option, REST falls back to the publishable key: every fetchCases/fetchLocations/fetchMedia and signed-URL call runs as **anon** → RLS filters to empty, private-bucket signing 403s. The popped-out board renders empty, receiving live deltas patched onto nothing.
Fix: Pin the mechanism in 7.2A: `createClient(url, key, { accessToken: async () => currentToken })` — verified as the access-token-only path feeding both REST and realtime without the refresh token leaving main. Pin the two consequences: with `accessToken` set, `supabase.auth` becomes a throwing proxy (secondaries must never call auth.*), and no onAuthStateChange fires — `updateSecondaryToken` must update the callback's closure token AND call `realtime.setAuth`. Add a test asserting a secondary REST request carries the user bearer token (#114 only checks config flags).

**[HIGH] No pinned channel carries the case id to a pop-out — M7's headline outcome is unbuildable as specified**
Source agent: plan-quality-checker
Doc: 02 7.1A, 7.3A, 7.2B; test #112
Issue: 7.3A promises the case id "via window query/event," but `open_view_window(app, view)` carries only `view` (so the URL can't), and the 7.2B event contract is token/ended only (so no event does). Secondaries can't read main's store (separate contexts). Focus-if-open compounds it: even a URL-borne case id goes stale when re-popping `map` for a different case — the id must be event-pushed, which nothing provides. Test #112 pins the view-only call, so TDD passes while the feature is broken. `SecondaryRoot`'s whole stack (case query + `subscribeToCaseActivity(caseId,…)`) is case-scoped.
Fix: Add `case_id` to `open_view_window` AND a `view-context` event that re-targets an already-open window; update 7.1A, 7.3A, and #112.

**[HIGH] Reused views resolve a null client and empty stores in a secondary JS context — "hosting, not forking" has no specified seam**
Source agents: typescript-reviewer (HIGH) + database-reviewer (MEDIUM) — merged
Doc: 02 7.2A, 7.3A; as-built src/lib/supabase/client.ts:48–53
Issue: The reused DashboardView/MapCanvas pull data through services that call `getSupabase()` — a per-context module singleton that is null in a secondary (initSupabase never runs there; reusing it is not an escape — it hardcodes `storage: vaultStorage`, which would fire vault IPC and fail #115/T9). `initSecondaryClient` returns a client, but nothing wires the services to it. Same gap for the other per-context singletons the views read: canvass-store (unseeded `selectedCaseId`), health-store (no wiring). First render throws `SupabaseNotInitializedError`.
Fix: Pin the seam: initSecondaryClient installs its client as the `getSupabase()` singleton within the secondary context (mirroring initSupabase), or the services accept a client/provider SecondaryRoot registers pre-mount; and specify SecondaryRoot seeding its own-context canvass-store + health wiring. State it in 7.2A/7.3A.

**[HIGH] Initial session-token delivery races the secondary's listener attach — secondaries boot to "session ended" on essentially every open**
Source agent: typescript-reviewer
Doc: 02 7.2B ("main emits on window-open request") + 7.2 error note
Issue: The secondary's `onSessionToken` attaches only after its bundle loads and mounts — hundreds of ms after creation. Tauri events aren't buffered for late subscribers, so an emit at window-open lands before the listener exists and is dropped; the boot-timeout then renders the terminal state despite a live session. The backstop converts a hang into a dead-on-arrival window.
Fix: Make initial delivery a handshake: secondary emits `secondary-ready` (or invokes a `get_session_token` command) on mount; main replies with `emitSessionToken`. Keep TOKEN_REFRESHED/session-ended as pushes and the timeout as a genuine-failure backstop.

**[HIGH] `session-ended` on idle lock kills the popped-out wall map — contradicts AD6 and A1's own purpose, and revokes nothing**
Source agents: plan-architect-reviewer (HIGH) + database-reviewer (MEDIUM) — merged
Doc: 02 7.2B/7.2C + 01 §11 A1 pt 2 ("session-ended on sign-out/lock") vs 01 §5.4 locked row ("data keeps flowing … a wall display is idle by default; only offline/signed-out stop data") + AD6/Flow F; 7.3's headline ("map on the wall TV")
Issue: A wall display idles by default, so the lock timer (default 15 min) is *guaranteed* to fire — and on lock, main (the desk) keeps flowing while the popped-out wall map drops to a terminal reopen-required state. It buys no security: lock revokes nothing (the in-memory access token stays valid), and the DVR-credential exposure lock guards is handled by masking, which a secondary can do too. Argued nowhere — T9 covers only the at-rest/on-close posture.
Fix: Reserve `session-ended` for sign-out. On lock, emit a distinct `session-locked`/`session-unlocked` pair — secondaries apply AD6 behavior (mask DVR credentials, keep the board flowing), matching main's own locked state. Update 01 §11 pt 2, 7.2B/7.2C, and the error-handling paragraph.

### MEDIUM

**[MEDIUM] Secondary windows need a NEW minimal per-window capability file with event permissions — 7.1C's default.json target is wrong on both counts**
Source agents: plan-reality-checker + rust-reviewer — merged (complementary halves)
Doc: 02 7.1C + Appendix B; src-tauri/capabilities/{default,quick-pane}.json
Issue: (a) default.json is `"windows": ["main"]` with the full main permission set — adding secondary labels there over-permissions pop-outs against AD13/T9; the established pattern is a minimal per-window file (quick-pane.json). (b) A label listed in NO capability gets zero permissions — it cannot `listen`, so `onSessionToken` never fires and every secondary hits the boot timeout: the entire AD13 propagation is non-functional without an explicit event-listen grant. main already has create-webview-window + emit.
Fix: 7.1C creates `capabilities/view-windows.json` scoped to the secondary labels with a minimal set (`core:event:default` listen + the specific commands they invoke); add a test asserting a secondary actually receives a pushed token (permission-level, not just the JS handler).

**[MEDIUM] `open_view_window(view: String)` should be a four-derive specta enum**
Source agent: rust-reviewer
Doc: 02 7.1A
Issue: Two divergent view vocabularies now exist — the store's `'cases' | 'case' | 'map'` vs the command's `'case' | 'map' | 'diagnostics'`. A `String` param generates `view: string` in the bindings, so `commands.openViewWindow(store.view)` passing `'cases'` compiles and fails at runtime. The repo's enum-threshold applies to branched-on inputs, not just errors.
Fix: `#[serde(rename_all = "lowercase")] enum ViewWindow { Case, Map, Diagnostics }` in view_windows/types — invalid views unrepresentable over IPC, exhaustive match in the service, distinct TS union.

**[MEDIUM] `read_log_tail` must cap-before-read, clamp `lines`, and pin the log path**
Source agents: rust-reviewer + plan-quality-checker — merged
Doc: 02 7.1A
Issue: The kiosk's LogDir file has no rotation cap; a naive read-whole-file-then-tail spikes memory (tens/hundreds of MB after weeks of runtime), violating the cap-before-read convention. `lines: u32` is unbounded, and the file path (`app_log_dir()` + default `<bundle>.log` name with `file_name: None`) is left for the implementer to derive.
Fix: Seek-from-end bounded tail (~64 KB max), clamp `lines`, pin the path derivation in 7.1A.

**[MEDIUM] Create-once + destroy-on-error races destructively on a double-open**
Source agent: rust-reviewer
Doc: 02 7.1A + Phase 7.1 error note
Issue: Async commands interleave — two rapid opens both pass the `get_webview_window == None` check; the second `build` fails (label in use) and the specified destroy-on-error then destroys the window the first call just created (flash-open-then-vanish). quick_pane avoids this by eager-create; A1's lazy-create reintroduces the race.
Fix: In the build-Err arm, re-check for the window — if it now exists, focus and return Ok; destroy only on genuine partial creation. Or serialize opens per label. In view_windows/services.

**[MEDIUM] The three-view union is not propagated — a binary toggle command, tests #56/#99, and doc 01 references still encode the retired two-view model**
Source agents: plan-architect-reviewer + typescript-reviewer + plan-quality-checker — merged (three lanes)
Doc: 02 2.4A (amended) vs 02:280 (5.3B `canvass-toggle-view`), 03:156 (#56 "toggle between map and dashboard" — `'dashboard'` is not a union value; `setView('dashboard')` is a tsc error), 03:254 (#99), 01:400 (§7 "toggle dashboard")
Issue: "Toggle" is binary and undefined over three rail-navigated views; the stale test text names a nonexistent value.
Fix: Define the command's role under three views (cycle case↔map, per-view go-to commands, or drop it — the rail is primary nav); reconcile 5.3B, #56, #99, and the doc 01 references in the same pass.

**[MEDIUM] Diagnostics window mount path and barrel exports are unpinned**
Source agents: plan-quality-checker + typescript-reviewer — merged
Doc: 02 7.1B, 7.3A, 7.3C; test #120
Issue: `window-main.tsx` "mounts SecondaryRoot," but SecondaryRoot hosts only map/dashboard — no diagnostics branch, though `view=diagnostics` is valid. Nothing states window-main branches (diagnostics → DiagnosticsView, else → SecondaryRoot). And both SecondaryRoot (canvass) and DiagnosticsView (cloud-session) are feature-internal: without pinned barrel exports, window-main must either alias-deep-import (fails `ast:lint`) or relative-deep-import (the App.tsx anti-pattern AD11 forbids copying).
Fix: Pin the window-main branch and add both components to their feature barrels; import via barrels.

**[MEDIUM] DiagnosticsView consumes IPC directly and the vault/keyring-status command doesn't exist**
Source agents: typescript-reviewer + database-reviewer — merged
Doc: 02 7.3C + 7.1A
Issue: The plan has a component consume `read_log_tail` with no wrapping service/hook — violating services-own-IPC, and the `no-direct-ipc-in-components` ast-grep rule only matches `invoke()`, so `commands.readLogTail()` slips the automated gate. "Vault/keyring status" implies a command 7.1A never lists — and the only existing vault read (`vault_get`) returns the decrypted secret, the opposite of a presence flag.
Fix: Add a cloud-session diagnostics service + hook wrapping `readLogTail` and a NEW presence-only vault/keyring-status command (booleans/timestamps, never key material); DiagnosticsView consumes the hook. Consider defensive redaction in read_log_tail rather than trusting T3 project-wide.

**[MEDIUM] On sign-out, secondaries must tear down realtime and drop the token — a terminal overlay alone leaks live data for up to an hour**
Source agent: database-reviewer
Doc: 02 7.2 error note; tests #117/#121; deferred D12
Issue: signOut revokes refresh tokens, not issued access tokens (signature+exp verification, no revocation list) — the secondary's in-memory JWT stays valid ~1h. If `session-ended` only swaps the UI while the socket lives underneath, the popped-out window keeps receiving agency broadcasts after the coordinator signed out, undercutting T9's "closing them leaves nothing." #117 asserts UI state only.
Fix: On session-ended: remove channels/disconnect realtime, discard the token, drop the client (the secondary-side analogue of D12). Add a test that no broadcast is delivered after the event.

**[MEDIUM] The "secondary-window checklist" the plan defers ghost-window/native-✕ handling to does not exist**
Source agent: plan-reality-checker
Doc: 02 Phase 7.1 error note ("see tauri-commands.md secondary-window checklist"); 01:470; AGENTS.md carries the same dangling reference
Issue: tauri-commands.md (read in full) contains no such checklist — no destroy-on-error, native-✕ → destroy(), entry CSS reset, or background-color guidance. quick_pane can't substitute for the native-✕ part: it's decorationless. The M7 implementer is pointed at content that isn't there for exactly the Windows ghost-window failure the async rule exists to prevent.
Fix: Write the checklist section in tauri-commands.md (and fix AGENTS.md's pointer), or inline the rules in Phase 7.1.

### LOW

**[LOW] doc 01 §4 feature tree still lists the rejected CaseSwitcher, omits NavRail/CasesView/SecondaryRoot**
Source agents: plan-architect-reviewer + plan-quality-checker — merged
Doc: 01:95–97
Fix: Swap CaseSwitcher → CasesView; add NavRail and SecondaryRoot (doc 02 App A is already correct).

**[LOW] Appendix A/B summary numbers stale: manifest enumerates 60 files (not 59); honesty metric still says "12 rows / 50 files" over a 14-row table**
Source agent: plan-quality-checker
Doc: 02:354, :375
Fix: 59→60 (the +8 arithmetic omits SecondaryRoot); "12 rows/50 files" → "14 rows/60 files."

**[LOW] Pin setAuth-before-subscribe ordering for the secondary's private channel**
Source agent: database-reviewer
Doc: 02 7.2A/7.3A
Issue: Private channels authorize at subscribe time. (Verified sound otherwise: realtime-js `setAuth` pushes a refreshed token to joined channels in place — no resubscribe needed; per-window socket count trivial.) With the `accessToken`-option fix, construction handles it; if manual setAuth survives, pin that it precedes subscribe.

**[LOW] Test #120 (DiagnosticsView, a cloud-session component) lives in a canvass test file**
Source agent: typescript-reviewer
Doc: 03:160
Fix: Move #120 to cloud-session/__tests__/.

**[LOW] Stale post-M1 wording: "drop sidebar panels" is already done; :105 "repurposed" contradicts :121 "becomes unreferenced"**
Source agent: plan-reality-checker
Doc: 01:104–105 vs :121
Fix: Reword the tree to the post-M1 baseline; reconcile the LeftSideBar sentences (repurposed into NavRail, not unreferenced).

**[LOW] deferred.md D6 is a stale sibling of the updated D9**
Source agent: plan-reality-checker
Doc: deferred.md:12
Fix: Trim D6 to the genuinely-deferred remainder (RightSideBar + ui-store visibility + toggles → post-V1 cleanup); drop the "M5-ish, design pending / Map-Dashboard" text D9 supersedes.

## Per-Agent Tallies

| Agent | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| plan-architect-reviewer | 0 | 1 | 1 | 1 |
| plan-quality-checker | 0 | 1 | 1 | 4 |
| plan-reality-checker | 0 | 0 | 2 | 2 |
| rust-reviewer (proposal mode) | 0 | 0 | 4 | 0 |
| typescript-reviewer (proposal mode) | 0 | 2 | 3 | 1 |
| database-reviewer (proposal mode) | 0 | 1 | 3 | 2 |
| **Total (after dedupe)** | **0** | **5** | **9** | **6** |

29 raw scored findings → 20 after dedupe. Merges: lock-kills-wall-display (arch+db), client/store seam (ts+db), view-union ripple (arch+ts+quality), capabilities (reality+rust, complementary halves), read_log_tail (rust+quality), diagnostics mount/barrels (quality+ts), diagnostics IPC/command (ts+db), doc-01 tree (arch+quality).

## Verified clean (positives)

- **AD13's topology endorsed by every lane that judged it**: main as sole auth owner, secondaries as read-only token recipients, both rejected alternatives correctly argued (the two-GoTrueClients-on-one-storage-key hazard is real). The fixes above pin mechanisms; none rethink the topology.
- **Realtime rebroadcast design verified against realtime-js**: setAuth propagates in place to joined channels — no resubscribe needed; socket count trivial.
- **121-test reconciliation recounted independently — holds three ways**; base numbers stable; the #117 file/phase attribution is consistent.
- **Grounding (11/15)**: quick-pane is a genuine create-once/show-hide async reference; vite multi-entry has the quick-pane.html precedent; the Windows LogDir fix landed (read_log_tail has a real file); `read_log_tail`'s "token-free by T3" claim verified (the file is Rust-records-only); spec §4/§1 claims faithful; onAuthStateChange correctly marked as new wiring; test-file placement conventions hold.
- **M7 phase granularity clean** (plumbing → auth → surfaces, milestone-independent); Phase 2.4 remains a sane single phase; AD14's no-auth-gate argument sound.

## Next Steps

1. All five HIGHs are localized 7.1/7.2/7.3 + §11 doc edits pinning mechanisms: the `accessToken` option (+ its two consequences), a case-id command param + `view-context` event, the getSupabase-seam/store-seeding contract, a ready-handshake for initial token delivery, and `session-locked`/`unlocked` replacing session-ended-on-lock.
2. The MEDIUMs cluster in the same sections — one editing pass over Phase 7.x covers the capability file, the ViewWindow enum, the bounded log tail, the double-open race arm, the diagnostics service/command/barrels, sign-out teardown, and writing the missing checklist (also fixes AGENTS.md's dangling pointer).
3. The view-union ripple + LOWs are a quick reconciliation sweep (5.3B/#56/#99, doc 01 tree/§7, Appendix numbers, D6).
4. Re-run with `--fix-delta` after revision — all six reviewers are resumable by name below.

## Agent IDs
<!-- Used by /react-tauri-rust-plan-review --fix-delta to resume reviewers via SendMessage (address by name). -->
- plan-architect-reviewer: arch-reviewer
- plan-quality-checker: quality-checker
- plan-reality-checker: reality-checker
- rust-reviewer (proposal mode): rust-lane
- typescript-reviewer (proposal mode): ts-lane
- database-reviewer (proposal mode): db-lane

## Reviewer pipeline notes

- **Scoped resume worked as intended**: reviewers held the PR #1 baseline + fix-delta context and reviewed only the delta; no baseline re-litigation occurred.
- **Heavy cross-lane convergence on the M7 seam** — five distinct lanes converged on "the mechanisms are unpinned" from five angles (REST auth, case-id IPC, client seam, event timing, capability grants). That convergence is itself the review's headline: AD13's *decisions* are right; its *contract surface* needs one more editing pass before M7 is implementable.
- **Soft divergence noted**: ts-lane's clean-list accepted lock→session-ended as covered (mechanism exists) while arch/db challenged the design (mechanism wrong) — recorded here rather than as a dispute; the design challenge stands.
- The database lane again verified against installed library sources (supabase-js `_getSessionToken`, realtime-js `setAuth`) rather than docs — both the HIGH and the it's-actually-fine realtime verdict came from that discipline.
