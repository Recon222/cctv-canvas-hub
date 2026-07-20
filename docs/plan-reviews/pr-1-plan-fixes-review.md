# Plan Fix-Delta Review: PR #1 — docs(plan): Canvas Hub V1 — three-doc planning set

**Reviewed**: 2026-07-19
**Scope**: Fix delta only — re-review of the plan revisions (commits `02532b3`, `c0b6acd`, `975c236`; 67 insertions / 47 deletions) made in response to the initial review (`pr-1-plan-review.md`).
**Reviewers (resumed via SendMessage, full transcript context)**: plan-architect-reviewer · plan-quality-checker · plan-reality-checker · rust-reviewer · typescript-reviewer · database-reviewer — all on Opus
**Decision**: APPROVE (with comments)

> **For the planner:** this document is self-contained. You do not need to reread `pr-1-plan-review.md`.

## Summary

**APPROVE.** All 25 original findings are closed: 23 verified genuinely resolved by the reviewers who raised them (including all three HIGHs, each confirmed fixed at the cited lines *and* mirrored in re-pinned tests, not papered over), 1 refutation accepted on the merits (the anonymous `app_meta` probe — the planner's live HTTP 200 + `[]` evidence is dispositive), and 1 accepted-with-corrected-rationale where the guard was implemented anyway (wake `refreshSession` expiry check). The revised docs reconcile at 107 tests (6 Rust + 101 TS) three ways, verified by independent row-by-row recount.

The revision introduced **6 new findings (3 MEDIUM, 3 LOW after dedupe)** — all localized side-effects of its own improvements, none CRITICAL/HIGH, each a one-edit tidy-up. Every one of the six reviewers independently voted APPROVE. The new items should be folded in before their affected phases (mostly Phase 4.x and test-spec touch-ups), not before implementation starts.

## Original finding → revision mapping

| # | Original finding | Severity | Where addressed in the revision | Verdict |
|---|---|---|---|---|
| 1 | Health ownership contradiction (M1 `setHealth` / barrel health types vs AD11 global home) | HIGH | `setHealth` removed (1.3A: "no health state or actions here"); 1.3C stops exporting health types; `HealthState`/`ChannelStatus` canonical in health-store (2.5A, AD11); M1 verified zero-health | resolved |
| 2 | Signed-URL never refreshes a continuously-mounted thumbnail before 60-min TTL | HIGH | `SIGNED_URL_REFRESH_MS = 50 min` (TTL×0.83) `refetchInterval` on `useSignedUrl` (4.1A/4.1B); interval-vs-staleTime interplay verified coherent; test #78 re-pinned | resolved |
| 3 | Mapper choke point bypassed on realtime + media paths | HIGH | Mapper enforced at all three cache boundaries (§5.5.1, Flow C3, 2.3B, 2.1C `toCanvassMedia`, 2.2A); tests #43/#49 re-pinned to assert mapped-not-raw | resolved |
| 4 | AD11 preferences seam mischaracterized (barrel vs deep import) | MEDIUM | AD11 names `usePreferences` (verified barrel-exported); App.tsx flagged legacy-not-precedent; gate consequence stated | resolved |
| 5 | Health-store sequenced after consumers; `recordFetchOk` no caller | MEDIUM | Build-order pinned bidirectionally (2.5A first within M2); `recordFetchOk()` called from query success (2.2B) | resolved |
| 6 | base64 dep orphaned with contradictory rationale | MEDIUM | base64 dropped from §9 (zero references remain); keyring v3 `set_secret`/`get_secret` mandated for raw bytes | resolved |
| 7 | Vault key get-or-create sequencing unspecified | MEDIUM | `get_or_create_key()` contract: generate once, persist, reuse; per-write re-key path explicitly foreclosed | resolved |
| 8 | Vault commands not pinned no-log | MEDIUM | No-log constraint in 1.2A (names the `save_preferences` idiom as the anti-pattern) + M1 grep-review obligation + 6.3B re-check; mechanism judged adequate given `[lib] test = false` | resolved |
| 9 | Unfiltered invalidation storms signed URLs | MEDIUM | `'signed-url'` exclusion predicate at both sites (2.5B reconnect + 6.2A wake), consistent in AD11/Flow E3; test #105 asserts the exclusion | resolved |
| 10 | Realtime INSERT append without id-dedup | MEDIUM | INSERT is upsert-by-id, redelivery-safe (Flow C3, 2.3B); test #50 rewritten ("exactly one row per id") | resolved |
| 11 | `attentionByLocation` Map vs Record contradiction | MEDIUM | Doc 01 reconciled to `Record<string, number>` with reference-equality rationale | resolved |
| 12 | `ChannelStatus`/`HealthState` undefined | MEDIUM | Both defined once in health-store (2.5A); realtimeService imports, never re-declares | resolved |
| 13 | Keyless vault vs keyed storage adapter coupling | MEDIUM | Single-key invariant documented (1.2C); adapter warns loudly (key name only) on a second key; test #13 extended | resolved |
| 14 | No supabase-js mock seam for ~25 tests | MEDIUM | `vi.mock('@/lib/supabase/client')` fake-client seam in test-spec framing + supabase-integration.md (6.3A) — one residual: test #11 (new MEDIUM below) | resolved |
| 15 | Anonymous `app_meta` probe fails against authenticated-only RLS | MEDIUM | **Refuted with live evidence**: HTTP 200 + `[]` proves anon has GRANT SELECT with RLS row-filtering (an error would be 401/403); probe stays a meaningful gate (reachability, key validity, "no error, not rows"); §4 diagram + Flow A2 record the verified RLS | refutation-accepted |
| 16 | Unbounded `['cases']` read | MEDIUM | Server-side predicates pinned (`deleted_at is null`, not archived, `order updated_at desc`, `limit 50`); test #41 re-pinned | resolved |
| 17 | No periodic reconciliation for lost broadcasts | MEDIUM | `RECONCILE_MS` (5 min) refetch on cases/locations (2.2B, Flow E4); **test #107 appended**; totals reconciled at 107 in both docs; three cadences verified disjoint | resolved |
| 18 | Forced `refreshSession()` wake race | MEDIUM | Wake checks expiry, refreshes only near/after it (Flow E3, 6.2A); test #104 re-pinned ("fresh ⇒ no call; near-expiry ⇒ refresh then setAuth"); corrected GoTrue reuse-interval rationale verified accurate | resolved (rationale corrected) |
| 19 | `session-lock-now` registered before its unlock UI (M5 vs M6) | LOW | Moved to new 6.1C shipping with LockOverlay; 5.3B keeps two commands with rationale; test #99 narrowed | resolved |
| 20 | keyring dep never scheduled in a phase | LOW | New 1.2I `Cargo.toml` row (`keyring = "3"`); Appendix B → "1.1, 1.2" | resolved |
| 21 | `session.vault` write atomicity unspecified | LOW | Pinned: temp file + rename (preferences pattern, verified at preferences/commands/mod.rs:97–112) | resolved |
| 22 | Tests #73–74/#91–92 without test-file homes | LOW | `useFlyTo.test.ts` (3.3, #73–74); `LocationCard.test.tsx` extended (5.1, #91–92); Phase 3.3 stays 5 tests | resolved |
| 23 | "12 hand-modified files" counts rows not files | LOW | Both docs restated: "12 integration-point rows ≈ 17 physical files" | resolved |
| 24 | Per-thumbnail signing ceiling unnoted | LOW | Ceiling noted in 4.1A; `createSignedUrls` batch pinned as upgrade path | resolved |
| 25 | Select shapes / drift strategy unstated | LOW | `select('*')` + schema gate stated as deliberate strategy (2.2A); §5.1 corrected to "cost nothing **to parse**" | resolved |

**25 / 25 closed** (23 resolved + 1 refutation-accepted + 1 resolved-with-corrected-rationale).

## Reviewer verdicts at a glance (fix delta)

| Agent | resolved | still-open | new | verdict |
|---|---|---|---|---|
| plan-architect-reviewer | 2/2 | 0 | 0 (+1 non-blocking observation) | APPROVE |
| plan-quality-checker | 5/5 (incl. the HIGH) | 0 | 2 MEDIUM, 1 LOW | APPROVE with comments |
| plan-reality-checker | 1/1 | 0 | 0 (6/6 new repo claims verified) | APPROVE |
| rust-reviewer | 5/5 | 0 | 1 LOW | APPROVE with one comment |
| typescript-reviewer | 8/8 (incl. the HIGH) | 0 | 1 MEDIUM | APPROVE |
| database-reviewer | 7/7 (incl. the HIGH + refutation) | 0 | 2 LOW | APPROVE |

## Resolved findings — verification detail

The three HIGHs, verified by the agents that raised them:

- **Health ownership** (quality + ts): 1.3A/1.3C carry explicit negative statements ("no health state or actions here"; "health types are not exported here"), both types homed once in 2.5A, build-order pinned in both directions, and no health reference survives anywhere in phases 1.1–1.4. M1 now compiles standalone as the Overview promises.
- **Signed-URL refresh** (ts): the interval — not staleness, focus, or reconnect — is what re-signs an always-mounted thumbnail, and the revised text says so explicitly; 50-min interval serves a fresh URL 10 minutes before the 60-min expiry; #78 asserts the interval.
- **Mapper at every boundary** (db): §5.5.1 now states "raw rows never enter a query cache"; both realtime patch paths name their mappers; `fetchMedia` returns mapped `CanvassMedia`; re-pinned #49 asserts "coord parsed — no raw WKB hex in cache" and #43 asserts "rows are CanvassMedia with soft-deleted excluded" — assertions a raw insert would now fail.

Cross-checks that held: the reality-checker verified all 6 new repo-facing claims the fixes introduced (Windows app-crate test exemption per `Cargo.toml:37`, the preferences atomic-write pattern, the barrel-export facts, the test-table additions); the quality-checker's independent recount confirms 107 tests, numbers 1–107 continuous, no pre-existing number shifted; the architect confirmed the combined AD11/health/Flow C3 edits stay mutually consistent.

## Deferral / refutation justifications — verification detail

- **Finding 15 (app_meta probe) — refutation ACCEPTED** by the database-reviewer on the merits, not deference: a role lacking the table GRANT returns 401/403, so the planner's live HTTP 200 + `[]` can only mean anon holds GRANT SELECT with RLS filtering all rows — precisely the "succeeds empty, does not error" behavior the fix claims. The probe remains a meaningful enrollment gate (reachability + key validity + table existence; success = "no error, not rows"; real schema validation happens post-auth at `checkSchemaGate`). Rubric met: named in-doc (Flow A2 + §4 diagram), specific rationale, evidence recorded. Correctly documented in the hub's own doc rather than editing the mobile team's pinned §3 contract.
- **Finding 18 (wake refresh) — accepted with corrected rationale, guard implemented anyway.** The database-reviewer confirms the GoTrue ~10 s refresh-token reuse-interval rationale is accurate (it is exactly why the race rarely bites) and the expiry-gated refresh is the right belt-and-suspenders. Counted as resolved.

## New problems introduced by the revision

After dedupe (quality's media-type MEDIUM ≡ db's LOW → one MEDIUM; the architect's non-blocking predicate-placement observation folds into quality's forward-ref MEDIUM):

### MEDIUM

**[MEDIUM] Media view-model type not propagated: `diffMedia`/`mediaEntry` still take `MediaRow` while the query now yields `CanvassMedia`**
Source agents: plan-quality-checker (MEDIUM) + database-reviewer (LOW) — merged
Doc: 02:232 (4.2A) vs 02:119 (2.1C), 02:129 (2.2A); 03: #83 vs #43
Issue: The mapper-boundary fix changed `fetchMedia` to return `CanvassMedia[]`, but 4.2A still declares `diffMedia(prev: MediaRow[], next: MediaRow[])` — a guaranteed type error at Phase 4.2, and #83's soft-delete assertion now tests a path a `deleted_at` row can no longer reach (the boundary already filtered it).
Fix: Retype `diffMedia`/`mediaEntry` to `CanvassMedia` (confirm it retains id/locationId/type/bucket/path/mime); move #83's assertion to the boundary or fold into #43.

**[MEDIUM] Signed-URL exclusion predicate is homed in `mediaService` (M4) but consumed by the health hook (M2), and never declared in 4.1A's signature list**
Source agents: plan-quality-checker (MEDIUM) + plan-architect-reviewer (non-blocking observation) — merged
Doc: 02:165 (2.5B), 02:33 (AD11) vs 02:220 (4.1A)
Issue: M2's `useConnectionHealth` can't import a predicate from a module created in M4 — the same cross-milestone forward-reference class as the original health HIGH, though functionally harmless in M2 (no signed-url queries exist yet). The architect independently noted the placement also soft-inverts the feature→global direction.
Fix: Home the trivial prefix predicate somewhere available from M2 (health layer or shared constants), or state explicitly that M2 uses plain invalidation and the exclusion arrives in M4 — and declare the export in 4.1A if it stays in `mediaService`.

**[MEDIUM] Mock-seam framing mis-buckets test #11 — the enrollment probe runs before `getSupabase()` exists**
Source agent: typescript-reviewer
Doc: 03:274 (mock-seam para) vs 02:119 (1.2E), 01:353 (Flow A)
Issue: `probeProject(url, key)` runs at Flow A step 2, before `initSupabase` at step 3 — `getSupabase()` would throw. The probe needs a throwaway client or raw fetch, which the stated single mock point doesn't intercept; #11 can't be written without inventing a second seam.
Fix: Route the probe through a client.ts export (e.g. `probeClient(url, key)`) so the single seam covers it, or state that #11 mocks the bare probe client.

### LOW

**[LOW] `get_or_create_key` should regenerate only on `keyring::Error::NoEntry`, never on transient errors**
Source agent: rust-reviewer
Doc: 02:74 (1.2A)
Issue: The ergonomic-and-wrong `if let Ok(bytes) … else generate` treats a transient keychain failure as absence — regenerating over the stored key and orphaning the vault (forced re-sign-in). Bounded blast radius (session is re-obtainable).
Fix: One clause: only `NoEntry` takes the create path; any other error fails closed.

**[LOW] `session-lock-now` registration lost its test in the move to 6.1C**
Source agent: plan-quality-checker
Doc: 02:289 (6.1C); 03:251 (#99)
Issue: #99 was narrowed to the two M5 commands; no Phase 6.1 test asserts the third command's registration.
Fix: Add a registration assertion to `commands.test.ts` for 6.1 (or note #99's coverage extends when 6.1 lands).

**[LOW] Signed-URL exclusion + >TTL outage leaves fallback tiles for up to 50 min on an operator-less wall board**
Source agent: database-reviewer
Doc: 02:188, :199, :231
Issue: After an outage longer than the 60-min TTL, media rows refetch on reconnect but excluded signed-url queries hold expired URLs → fallback tiles until the 50-min interval fires; the plan doesn't state whether the 4.1C fallback retry is automatic.
Fix: Pin that `<img>` onError triggers an automatic re-sign of that specific query so a post-outage board self-heals immediately.

## Next Steps

**Ready to implement.** The plan is approved; all original findings are closed and the three-doc set reconciles. Fold the six new items in as cheap doc edits — the three MEDIUMs before their affected phases (4.2's `diffMedia` retype, the predicate's home before 2.5B, the probe seam note before 1.2E's tests), the LOWs alongside their phases (1.2A keyring clause, 6.1 registration test, 4.1C auto-retry pin). None warrants another full review cycle; a self-check when touching those phases suffices.
