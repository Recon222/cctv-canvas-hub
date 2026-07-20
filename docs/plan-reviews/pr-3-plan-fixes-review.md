# Plan Fix-Delta Review: PR #3 — docs(plan): Amendment A1 — three-view IA, nav rail, multi-window (M7), diagnostics

**Reviewed**: 2026-07-20
**Scope**: Fix delta only — re-review of the single fix commit (`a03f90f`) landed in response to the scoped A1 review (`pr-3-plan-review.md`).
**Reviewers (resumed via SendMessage, full context, all Opus)**: plan-architect-reviewer · plan-quality-checker · plan-reality-checker · rust-reviewer (proposal) · typescript-reviewer (proposal) · database-reviewer (proposal)
**Decision**: APPROVE (with comments)

> **For the planner:** self-contained. You do not need to reread `pr-3-plan-review.md`.

## Summary

**APPROVE.** All 20 aggregate findings from the scoped review are genuinely resolved in one editing pass over the Phase 7.x seam — the five HIGHs verified closed at the cited lines by the lanes that raised them, not papered over. The three that were the amendment's real risk are now source-accurate and end-to-end: the secondary auth mechanism is pinned to the `accessToken` client option (database-reviewer re-verified callback shape, REST/storage/realtime coverage, and both consequences line-by-line against installed supabase-js 2.110.7), the case-id contract is carried by both a command parameter and a handshake-delivered `view-context` event with the focus-if-open retarget reasoned through, and `session-ended`-on-lock is replaced by a `session-locked`/`unlocked` pair giving popped-out secondaries AD6 parity. Both docs were kept in sync (doc 01 §11.2 rewritten to match doc 02 7.2B), and the 121-test reconciliation holds three ways with the #120 rehome clean.

The revision introduced **5 new findings (1 MEDIUM, 4 LOW after dedupe)** — all localized tails of the fixes themselves, none blocking. The one worth attention before M7 build: canvass-store gets seeded in a secondary but **session-store `locked` does not**, so the reused `LocationCard` would render DVR credentials **unmasked while the main window is idle-locked** (a T2/AD6 gap) — the exact edge the `accessToken` proxy and the store-seeding fix exposed. Every lane voted APPROVE.

## Fix commit → original finding mapping

| Original finding | Sev | Fix (all in `a03f90f`) | Verdict |
|---|---|---|---|
| H1 Secondary REST/storage authenticates as anon | HIGH | 7.2A pins `createClient(…, { accessToken: async () => currentToken })` — feeds REST/storage/realtime; both consequences pinned (throwing `auth.*` proxy; `updateSecondaryToken` swaps closure token + `realtime.setAuth`); #114 re-pinned to assert the REST bearer | **closed** (source-verified) |
| H2 No case-id channel to a pop-out | HIGH | `open_view_window(view, case_id)` + `view-context` event; focus-if-open re-emits to retarget; boot order pinned; #112 re-pinned to carry the case id | **closed** |
| H3 Null client + empty stores in secondary context | HIGH | `initSecondaryClient` claims the context's `getSupabase()` singleton; boot order handshake → token → store seed → mount | **closed** (client + canvass-store; see new MEDIUM for the other two stores) |
| H4 Initial token push races listener attach | HIGH | `secondary-ready` handshake replaces emit-on-open; pushes remain for refresh; timeout demoted to backstop | **closed** |
| H5 `session-ended` on lock kills the wall map | HIGH | `session-ended` = sign-out only; new `session-locked`/`unlocked` pair — secondaries mask credentials, keep flowing (AD6 parity); doc 01 §11 synced | **closed** |
| M1 Capabilities: wrong file + missing event grant | MEDIUM | New minimal `capabilities/view-windows.json` with `core:event:default` listen; `default.json` stays main-only (T9); capability-level delivery = M7 smoke obligation | **closed** |
| M2 `view: String` stringly-typed | MEDIUM | `ViewWindow` four-derive enum, `rename_all="lowercase"`; distinct from the store union | **closed** |
| M3 `read_log_tail` unbounded + path unpinned | MEDIUM | `lines` ≤500, seek-from-end ≤64 KB, path `app_log_dir()/tauri-app.log` | **closed** |
| M4 Double-open destroy-on-error race | MEDIUM | build-Err re-check arm (window exists → focus+Ok; destroy only genuine partial); also checklist rule 2 | **closed** |
| M5 Three-view ripple (toggle cmd, #56/#99, doc 01) | MEDIUM | per-view go-to commands; #56/#99 re-pinned; doc 01 §4/§7 fixed | **closed** |
| M6 Diagnostics mount + barrels | MEDIUM | window-main branches on view; SecondaryRoot/DiagnosticsView barrel-exported | **closed** |
| M7 DiagnosticsView direct IPC + no vault-status cmd | MEDIUM | `diagnosticsService`/`useDiagnostics` + new presence-only `vault_status` command | **closed** |
| M8 Sign-out leaves secondary realtime + token live | MEDIUM | teardown-before-overlay pinned (channels/token/client dropped, then terminal state); #117 asserts no post-ended broadcast | **closed** |
| M9 "Secondary-window checklist" doesn't exist | MEDIUM | Written into tauri-commands.md (7 rules); resolves both the plan and AGENTS.md dangling pointers | **closed** |
| L1 doc 01 §4 stale CaseSwitcher | LOW | tree updated (NavRail/CasesView/SecondaryRoot) | **closed** |
| L2 Appendix A/B stale counts | LOW | recounted to 63/14 (still off-by-one — see new LOW) | **closed** (with residual) |
| L3 setAuth-before-subscribe | LOW | pinned in 7.2A boot order | **closed** |
| L4 #120 placement | LOW | rehomed to cloud-session/__tests__/diagnostics.test.tsx | **closed** |
| L5 stale post-M1 wording / :105 vs :121 | LOW | reconciled (LeftSideBar repurposed) | **closed** |
| L6 deferred.md D6 stale sibling | LOW | trimmed, defers to D9 | **closed** |

**20 / 20 closed.**

## Reviewer verdicts at a glance (fix delta)

| Agent | closed | still-open | new | verdict |
|---|---|---|---|---|
| plan-architect-reviewer | 3/3 | 0 | 1 LOW | APPROVE |
| plan-quality-checker | 5/5 | 0 | 2 LOW | APPROVE |
| plan-reality-checker | 4/4 | 0 | 0 (9/9 delta claims verified) | APPROVE |
| rust-reviewer | 4/4 | 0 | 1 MEDIUM, 1 LOW | APPROVE with comments |
| typescript-reviewer | 6/6 | 0 | 1 MEDIUM | APPROVE with comments |
| database-reviewer | 6/6 | 0 | 1 LOW | APPROVE |

## Closed findings — verification detail (the load-bearing three)

- **H1 (accessToken)** — database-reviewer re-verified against installed supabase-js: the callback matches the `accessToken` option (SupabaseClient.ts:342-360); "feeds REST/storage/realtime" correct (`_getSessionToken` → fetch; construction-time `realtime.setAuth`); consequence (a) throwing `auth.*` proxy exact (:351-359); consequence (b) no `onAuthStateChange` under accessToken (:410-412) → manual `setAuth` on rebroadcast propagates in-place to joined channels (RealtimeClient.ts:636-652), no resubscribe. Re-pinned #114 asserts the REST bearer that the original design would have failed. The >1h-lock question resolved: `session-token` still fires on TOKEN_REFRESHED with no lock gating, so locked secondaries stay fresh.
- **H2/H3/H4 (case-id + client seam + handshake)** — quality-checker and typescript-reviewer confirm the round-trip: `open_view_window(view, case_id)` emits, `secondary-ready` handshake avoids the event-buffering race, `initSecondaryClient` claims the context `getSupabase()` singleton, and boot order seeds canvass-store via `view-context` before subscribe. focus-if-open re-emits `view-context` to retarget (the "can't re-URL a focused window" edge).
- **H5 (session-locked)** — architect confirms end-to-end coherence with main's locked contract; the unlock path is pinned (main re-auth → `session-unlocked`; secondaries never prompt). The revision also correctly added teardown-before-overlay on genuine sign-out (M8).

Cross-checks that held: reality-checker verified the newly-written checklist covers everything AGENTS.md promised (including native-✕, which decorationless quick-pane couldn't model) and that `core:event:default` matches the real capability files; quality-checker's independent recount confirms 121 reconciles three ways with all twelve R4 tests homed exactly once.

## New findings introduced by the fixes

### MEDIUM

**[MEDIUM] Store-seeding is half-pinned — reused `LocationCard` would show DVR credentials unmasked in a secondary while main is idle-locked**
Source agents: typescript-reviewer (MEDIUM) + database-reviewer (LOW, health half) — merged
Doc: 02 7.3A (boot order seeds only canvass-store); 7.2A(a) (throwing auth proxy); baseline 2.4B/6.1B (LocationCard masks on session-store `locked`), 6.2A (`useConnectionHealth` wake → `auth.refreshSession()`)
Issue: 7.3A pins the client seam and canvass-store seeding, but the reused board components read two more per-context singletons the fix leaves empty. (a) **session-store `locked`**: LocationCard masks DVR credentials off session-store, which in a secondary is default (`booting`) with no event writing it — so a popped-out board renders DVR credentials **unmasked while main is idle-locked**, a T2/AD6 security gap, unless SecondaryRoot seeds its own session-store from `session-locked`/`unlocked` (parallel to the pinned canvass-store `view-context` seeding). (b) **health**: the reused `useConnectionHealth` wake path calls `auth.refreshSession()`, which throws under the accessToken proxy — the plan asserts "secondary code never calls auth" but doesn't reconcile this one reused hook.
Fix: Extend the 7.3A boot/event contract: `session-locked`/`unlocked` → set this context's session-store `locked`/`active` (reused LocationCard masks unchanged); pin SecondaryRoot as **refresh-passive** — feed health from channel status only (`subscribeToCaseActivity` `onStatus`), never mount the main `useConnectionHealth` wake-refresh. Both are one-line pins parallel to the canvass-store seeding already specified.

### LOW

**[LOW] `vault_status` mtime fields will trip specta `BigIntForbidden` if typed from `SystemTime`**
Source agent: rust-reviewer
Doc: 02 7.1A
Issue: The natural `metadata.modified()?…as_secs()` → `u64` (or `u128` from `as_millis()`) on a `Type`-deriving struct fails tauri-specta at `npm run rust:bindings` — M7 can't go gate-green. `ViewWindow` was pinned precisely but "mtimes" left untyped, and u64 is the ergonomic-but-forbidden choice.
Fix: Pin the mtime fields `Option<f64>` (epoch millis) per the §5.3 timestamp convention.

**[LOW] `view-context` emitter ownership ambiguous — 7.1A's Rust row implies a second emitter**
Source agent: rust-reviewer
Doc: 02 7.1A ("focus-if-open re-emits view-context") vs 7.2B/7.2C (JS `sessionEvents.ts` owns emission)
Issue: A verbatim implementer could emit `view-context` from the Rust command AND the JS service — double-fire, or drift if payloads diverge.
Fix: State `view-context` is emitted JS-side only; the Rust command builds/focuses and returns, the JS caller emits after it resolves.

**[LOW] Appendix A file count off by one again (enumerated 64, claims 63)**
Source agent: plan-quality-checker
Doc: 02:354
Issue: Manifest enumerates 64 (52 pre-M7 + 12 A1/M7); the label says 63 — the uncounted item is `capabilities/view-windows.json` (enumerated but likely treated as config, not source). Third pass this count has drifted. Cosmetic — implementers build every enumerated file. (Appendix B is now correct: 14 rows.)
Fix: 63→64, or label "63 source files + 1 capability config."

**[LOW] The case-id round-trip's receive side (`view-context` → `selectCase` + subscribe) has no test assertion**
Source agent: plan-quality-checker
Doc: 03 #112 (emit side), #118 (mounts by view param)
Issue: #112 asserts the case id is emitted and #118 that SecondaryRoot mounts the right view, but nothing asserts the secondary *consumes* `view-context` to seed `selectCase(caseId)` and subscribe — the linchpin of the H2/H3 fix; a regression there passes CI green.
Fix: Add an assertion (extend #118 or a new 7.3 test) that `view-context {view, caseId}` drives `selectCase(caseId)` + `subscribeToCaseActivity(caseId, …)`.

**[LOW] One stale "view toggle" annotation survives at doc 01:109**
Source agent: plan-architect-reviewer (also noted trivial by quality-checker)
Doc: 01:109 ("palette entries (view toggle, lock now…)")
Issue: The M5 ripple fix updated §7 (:400) and 5.3B but missed this §4 file-tree echo, so doc 01 self-contradicts (line 109 vs 400). Pure hygiene — doc 02 is authoritative for command detail.
Fix: "view toggle" → "per-view go-tos".

**Non-findings recorded for the implementer** (INFO, from db + ts + rust lanes): attach the secondary's `session-token`/`view-context` listeners *before* emitting `secondary-ready` (else the reply re-races); the shared `view-windows.json` grants all pop-outs the union of secondary commands (harmless — `vault_status`/`read_log_tail` are presence-only/redacted); `client.ts` needs a trivial setter so `initSecondaryClient` can populate the private `getSupabase()` holder; app commands aren't ACL-gated so 7.1C's "+ commands secondaries invoke" means core/plugin perms only (quick-pane.json already models this).

## Deferral justifications

None this round — every finding was fixed rather than deferred. (The capability-level token-delivery test correctly became an **M7 live-smoke obligation** rather than a vitest unit test — rust-reviewer confirmed a real multi-window Tauri runtime is the only way to assert a secondary receives an event given its capability, same precedent as M1's no-log grep obligation.)

## Architecture invariants — re-verified clean

- AD13 topology endorsed again by every lane; the `accessToken` mechanism is a correctness improvement, source-accurate, no incoherence across AD12–14/M7.
- Realtime rebroadcast propagates in-place (no resubscribe); locked secondaries stay token-fresh.
- 121-test reconciliation holds three ways; #120 rehome clean; all R4 tests homed once.
- New repo claims (checklist content, `core:event:default`, log path, `vault_status` feasibility, barrel discipline) all verified against the tree (9/9).

## Next Steps

1. **One MEDIUM worth closing before M7 build**: pin SecondaryRoot's session-store seeding (`session-locked`/`unlocked` → `locked`/`active`, so DVR masking works in pop-outs) and refresh-passive health, in 7.3A — parallel to the canvass-store seeding already there. Security-relevant (unmasked credentials on an idle-locked wall).
2. **Fold the four LOWs** into 7.1/7.3 while the section is open: `vault_status` mtimes → `f64`, `view-context` single JS emitter, Appendix A 63→64, a receive-side test for the case-id round-trip, and the one-word doc 01:109 fix.
3. Otherwise the amendment is **ready to implement** — all 20 findings closed, both docs synced, topology sound, counts reconciled. None of the new items requires another full review cycle; a self-check when authoring Phase 7.x suffices.

## Reviewer pipeline notes

- **Cross-lane convergence again**: the store-seeding MEDIUM was found by typescript (session-store masking + health) and database (health/auth-proxy) from different angles — the security-relevant masking half set the severity. The DVR-credential-in-a-locked-secondary gap is the exact edge the accessToken fix exposed: closing H1 (throwing auth proxy) surfaced a latent assumption in the reused board components.
- **Source verification held the bar**: the H1 fix wasn't taken on faith — database-reviewer re-checked the `accessToken` callback, the throwing proxy, and the missing auth-event listener against installed supabase-js line numbers before confirming.
- The recurring Appendix A off-by-one (third pass) suggests the manifest count is worth generating rather than hand-maintaining — flagged, not blocking.
