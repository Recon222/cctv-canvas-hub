# Plan Review: PR #1 — docs(plan): Canvas Hub V1 — three-doc planning set (architecture, implementation plan, test spec)

**Reviewed**: 2026-07-19
**Branch**: plan/canvas-hub-v1 → main
**Docs reviewed**: 3 files (01-canvas-hub-architecture.md, 02-canvas-hub-implementation-plan.md, 03-canvas-hub-test-spec.md)
**Lanes dispatched**: plan-architect-reviewer · plan-quality-checker · plan-reality-checker · rust-reviewer (proposal mode) · typescript-reviewer (proposal mode) · database-reviewer (proposal mode) — all on Opus
**Decision**: REVISE
**Conflicts surfaced**: 0
**Plan grounding**: 28/29 reality-checker claims verified against the codebase

## Summary

**REVISE** — zero CRITICAL, but three independent HIGH findings, each a real defect an implementer following the plan verbatim would ship: (1) connection-health ownership is self-contradictory (session-store `setHealth` + cloud-session barrel "health types" in M1 vs AD11's global home created in M2 — M1 cannot compile standalone as promised); (2) the signed-URL cache config never refreshes a continuously-mounted wall-board thumbnail before its 60-minute TTL, so images 403 on exactly the always-on primary persona; (3) the trap-list mapper "choke point" is enforced only on the fetch path — the realtime cache patch inserts raw unmapped rows and the media query never maps, so WKB/soft-delete/form_data correctness silently fails on the live and media surfaces the product is built around. All three are localized doc edits, not rework; the fifteen MEDIUMs cluster around the same seams (health sequencing, signed-URL/invalidation lifecycle, vault pins, always-on longevity).

Confidence in the plan's grounding is very high: the reality-checker verified **28 of 29** repo-facing claims true against the tree — file paths, symbol names, the registration flow, the workspace-crate pattern, the regex-wide ast-grep rule, the `Result<_, String>` convention, vitest scoping, and even the plan's stale-doc observation about `state-management.md` all check out. The single failed claim is AD11's characterization of the App.tsx preferences read as a "barrel consumption" (it is a relative deep service import, and the barrel doesn't export the service). The five external claim clusters (mobile contract sources, live Supabase behavior, broadcast payload shape, Windows credential cap) are unverifiable from this repo but honestly flagged in-doc as M2 live-verification dependencies. The three-doc set's internal arithmetic is exact: 106 tests reconcile row-by-row across both documents, OD1–OD9 all resolve to AD rows, and Appendix A is exactly 50 new source files.

## Disputed Findings (Agent Conflicts)

None. No agent contradicted another's position. One apparent tension resolves compatibly: typescript-reviewer wants catch-up invalidation *scoped down* (exclude `signed-url`) while database-reviewer wants a periodic location refetch *added* — together they describe the same fix: scope invalidation to case-data keys, give signed URLs their own refresh interval, and add a low-frequency case-key reconciliation for the always-on board.

## Findings

### CRITICAL

None.

### HIGH

**[HIGH] Connection-health ownership is self-contradictory: M1 references health that AD11 homes globally and Phase 2.5 (M2) creates**
Source agents: plan-quality-checker (HIGH) + typescript-reviewer (MEDIUM) — merged
Doc: 02-canvas-hub-implementation-plan.md:91,93 (Phase 1.3A `setHealth`, 1.3C barrel "health types") vs :33 (AD11), :163 (2.5A); 01-canvas-hub-architecture.md:328 (§5.4)
Issue: Phase 1.3A gives session-store a `setHealth` action and 1.3C exports "health types" from the cloud-session barrel — both in M1. But AD11 states health lives in the **global layer** (`src/store/health-store.ts`), "not inside either feature," and the canonical `HealthState` is only produced by 2.5A in M2. M1 either references a type that doesn't exist yet (breaking "nothing in a later milestone is load-bearing for an earlier one") or defines health inside cloud-session, contradicting AD11. `setHealth` also has no consumer anywhere (the polling gate and `evaluate()` read the global store) and no test (#20–24) exercises it. Two homes for health state is a dual-source-of-truth waiting to drift.
Fix: Drop `setHealth` from 1.3A and "health types" from the 1.3C barrel. Health is entirely global (AD11); session UI reads `useHealthStore` via selector. Export `HealthState` from the global health-store. This makes M1 genuinely self-contained.

**[HIGH] Signed-URL query never refreshes a continuously-mounted thumbnail before its 60-min TTL expires**
Source agent: typescript-reviewer
Doc: 02-canvas-hub-implementation-plan.md:219–220 (Phase 4.1A/4.1B)
Issue: `SIGNED_URL_TTL_S = 3600` with `staleTime 40 min, gcTime 55 min, refetchOnWindowFocus: false` and no `refetchInterval`. On the always-on wall board, thumbnails stay mounted for hours; `gcTime` only GCs *inactive* queries, and a stale *active* query does not auto-refetch without a trigger. With focus-refetch off, the only triggers are mount and reconnect — on a stable connection the signed URL expires at t=60 min and the `<img>` 403s, breaking the "never a broken img" promise. The 4.1B comment "refresh before expiry" is not delivered by this config.
Fix: Give `useSignedUrl` its own `refetchInterval` below the TTL (~50 min / TTL×0.8) so mounted thumbnails proactively re-sign, independent of focus/reconnect. Pair with the scoped-invalidation fix (MEDIUM below).

**[HIGH] Trap-list mapper is a choke point only on the fetch path — the realtime patch and the media query both bypass it**
Source agent: database-reviewer
Doc: 01-canvas-hub-architecture.md:342 (§5.5.1), :366–368 (Flow C3); 02-canvas-hub-implementation-plan.md:118, :128, :140
Issue: §5.5.1 pins "`deleted_at !== null` ⇒ invisible — applied at the mapper, so no consumer can forget," and `fetchLocations` honors it (cache holds `CanvassLocation`). But (a) the realtime `ActivityEvent` carries a **raw** `LocationRow`, and Flow C3 / Phase 2.3B apply it with `setQueryData` "no refetch needed" — inserting a raw row into a `CanvassLocation[]` cache skips every trap transform: `location` stays WKB hex (no marker), the (0,0)→null guard never runs, form_data enrichment and `investigatorLabel` are never derived. A live-updated row renders broken while its initially-fetched neighbors render correctly — contract fidelity fails on exactly the live path. (b) `fetchMedia` returns raw `MediaRow[]` with no `toCanvassMedia`/`visibleRows` at the fetch boundary — soft-deleted media sits in the cache and every consumer (count badges #88, dashboard) must remember to filter. Test #49 only asserts "row replaced," which a raw insert would pass.
Fix: Enforce the invariant at every cache boundary: map incoming realtime rows through `toCanvassLocation`/`toCanvassCase` before `setQueryData`; apply `visibleRows` (and a `toCanvassMedia`) at the media fetch. Add a realtime test asserting the patched row is *mapped*, not merely present.

### MEDIUM

**[MEDIUM] AD11 mischaracterizes the preferences seam — App.tsx "precedent" is a relative deep import, not a barrel consumption**
Source agents: plan-reality-checker (MEDIUM) + plan-architect-reviewer (LOW) — merged
Doc: 02-canvas-hub-implementation-plan.md:33 (AD11)
Issue: AD11 claims "one-way, read-only **barrel** consumptions: … cloud-session/canvass → preferences **service** (existing App.tsx precedent)." Reality: App.tsx:9 uses a *relative* deep import (`./features/preferences/services/preferencesService`) that escapes the `barrel-export-enforcement` ast-grep rule only because the rule's regex anchors on the `@/features/…` alias; the preferences barrel exports only `PreferencesDialog`, `usePreferences`, `useSavePreferences` — not the service. An implementer following AD11 literally (aliased deep import) fails `ast:lint` → milestone not gate-green; importing from the barrel doesn't compile because the service isn't exported.
Fix: Name the seam as the already-barrel-exported `usePreferences` hook (the clean read path for the three new fields). If a non-React read is ever needed, extend the preferences barrel to export the service rather than deep-importing.

**[MEDIUM] health-store (2.5A) is sequenced after the phases that consume it; `recordFetchOk()` has no assigned caller**
Source agent: plan-quality-checker
Doc: 02-canvas-hub-implementation-plan.md:131 (2.2B), :140 (2.3B), :163 (2.5A); 03-canvas-hub-test-spec.md:127 (test #45)
Issue: 2.2B ("query errors flow to the health store") and 2.3B ("feeds the health store") consume `recordFetchError`/`recordEvent` created only in 2.5A — TDD test #45 in Phase 2.2 cannot pass until 2.5 exists. Separately, `recordFetchOk()` has no caller in any phase, yet the `live` predicate depends on successful-fetch confirmations — the board could go STALE after 90 s even while polling succeeds.
Fix: Reorder health-store before 2.2 within M2 (or annotate 2.2/2.3 "depends on 2.5A"), and assign `recordFetchOk()` a caller (query/poll success in 2.2B/4.2B).

**[MEDIUM] `base64 ^0.22` dependency has no consumer and a contradictory rationale**
Source agents: rust-reviewer (MEDIUM) + plan-quality-checker (LOW) — merged
Doc: 01-canvas-hub-architecture.md:432 (§9), :303 (§5.3); 02-canvas-hub-implementation-plan.md:62 (1.1A)
Issue: §9 lists base64 for "vault file framing," but §5.3 defines the vault file as a binary `nonce‖ciphertext` blob, and Phase 1.1A scopes crate deps to `aes-gcm, rand` only. No file consumes base64. The one plausible need — string-encoding the keyring key — is obviated by keyring v3's `set_secret(&[u8])`/`get_secret()`; an implementer using `set_password(&str)` with raw key bytes hits a non-UTF-8 runtime failure.
Fix: Drop base64 and mandate keyring v3 `set_secret`/`get_secret` for the raw key (simplest); or pin base64's real consumer and correct the §9 rationale.

**[MEDIUM] Vault key get-or-create sequencing is unspecified — risks re-keying on every write and breaking relaunch restore**
Source agent: rust-reviewer
Doc: 01-canvas-hub-architecture.md:300, :303; 02-canvas-hub-implementation-plan.md:74 (1.2A)
Issue: `generate_key()` exists and "the key lives in the keychain," but nothing pins when it's generated vs read. A verbatim implementer could call `generate_key()` inside `vault_set` per write → every relaunch reads `session.vault` with the newest key against ciphertext sealed under a prior key → `AuthFailed` → forced re-sign-in on every restart, silently breaking Flow B (M1's headline outcome).
Fix: Pin a `get_or_create_key()` contract in 1.2A: read the keyring entry; if absent, generate once, persist, reuse; `generate_key()` only on the create path.

**[MEDIUM] Vault commands must be pinned no-log — the template's own convention leaks the session token to plaintext logs**
Source agent: rust-reviewer
Doc: 02-canvas-hub-implementation-plan.md:74; 01-canvas-hub-architecture.md:444 (T3)
Issue: `vault_get`/`vault_set` move the decrypted GoTrue session (access + refresh tokens) as plain `String` over IPC. T3 says tokens are never logged, but the per-command spec doesn't restate it and the template's own `save_preferences` logs its full argument (`log::debug!("… {preferences:?}")`, preferences/commands/mod.rs:89). Copying that idiom writes the refresh token into the on-disk log — bypassing the entire AES-256-GCM vault (T1).
Fix: Add an explicit no-log constraint on the vault commands/service (no `{value:?}`, no `{result:?}`) in 1.2A and make it a Test Spec proof obligation for M1.

**[MEDIUM] Unfiltered `invalidateQueries()` regenerates every signed URL and reloads every thumbnail on each reconnect/wake**
Source agent: typescript-reviewer
Doc: 02-canvas-hub-implementation-plan.md:164 (2.5B), :297 (6.2A), :33 (AD11)
Issue: Catch-up invalidation with no filter refetches ALL mounted queries including every `['signed-url', bucket, path]` — each refetch mints a NEW signed URL (one storage API call per tile) and swaps `<img src>`, so every wifi blip triggers N storage calls plus a visible thumbnail-reload flash across the wall. The inverse of the signed-URL HIGH: stable connection = no refresh; flaky connection = over-refresh.
Fix: Scope catch-up invalidation to case-data keys (`['cases']` / `['locations', id]` / `['media', id]`), excluding `signed-url`; signed URLs refresh on their own interval.

**[MEDIUM] Realtime INSERT "appends" with no id-dedup → duplicate rows in the cache**
Source agent: typescript-reviewer
Doc: 01-canvas-hub-architecture.md:367 (Flow C3); 02-canvas-hub-implementation-plan.md:140 (2.3B); test #50
Issue: "INSERT appends" as a blind push duplicates a location when a broadcast is redelivered (realtime redelivers) or when an INSERT races an in-flight catch-up refetch — two identical cards, React key collisions, doubled dashboard counts until the next full refetch.
Fix: Specify INSERT as upsert-by-id (replace if present, else append) in Flow C and 2.3B.

**[MEDIUM] `attentionByLocation` type contradiction: `Map` (doc 01) vs `Record` (doc 02)**
Source agent: typescript-reviewer
Doc: 01-canvas-hub-architecture.md:338 vs 02-canvas-hub-implementation-plan.md:150
Issue: The two authoritative docs disagree. A `Map` in Zustand is a re-render footgun: in-place mutation (or replacement without `new Map(prev)`) won't change the reference selectors compare — marker pulse / card highlight silently fail to re-render. Doc 02's `Record<string, number>` is correct.
Fix: Reconcile doc 01 §5.4 to `Record<string, number>`.

**[MEDIUM] Cross-module types used in public signatures are never defined: `ChannelStatus`, `HealthState`**
Source agent: typescript-reviewer
Doc: 01-canvas-hub-architecture.md:272–273; 02-canvas-hub-implementation-plan.md:163, :93
Issue: `ChannelStatus` flows from `realtimeService.onStatus` into `health-store.channelStatus(s)`; `HealthState` is `evaluate`'s return and a barrel export. Neither is defined anywhere — inviting two divergent definitions across modules.
Fix: Pin both canonically in the global health-store module (`HealthState` = `connecting|live|reconnecting|stale|offline` per §5.4; `ChannelStatus` mapped from supabase-js subscribe states); realtimeService imports, never re-declares.

**[MEDIUM] Keyless vault IPC vs keyed supabase-js storage-adapter contract — undocumented single-key coupling**
Source agent: typescript-reviewer
Doc: 02-canvas-hub-implementation-plan.md:76 (1.2C); 01-canvas-hub-architecture.md:291–293
Issue: supabase-js calls `getItem(key)`/`setItem(key, value)` with specific keys; the vault commands accept no key and hold a single blob, so the adapter silently discards the key. Safe only while supabase-js uses exactly one storage key (true today for password grant + `detectSessionInUrl: false`) — but nothing documents or asserts it. Any second key (code-verifier, second client) collapses into the same blob → session corruption.
Fix: Document the single-key invariant in 1.2C and have the adapter assert/validate the key knowingly, so a supabase-js upgrade that adds a key is caught loudly.

**[MEDIUM] No supabase-js mock seam specified for ~25 service-level tests**
Source agent: typescript-reviewer
Doc: 03-canvas-hub-test-spec.md:7; docs/developer/testing.md; src/test/setup.ts
Issue: Tests #11, 15–19, 41–51, 77–78 exercise services wrapping supabase-js directly (auth, chainable query builder, channel, storage). The repo's documented conventions cover only Tauri-command mocks and service-layer mocks — neither fakes a chainable supabase-js client. A TDD-first implementer hits the wall at test #11 with no pattern to follow.
Fix: Add a supabase mock seam to the test spec — all access already routes through `getSupabase()`, so pin `vi.mock('@/lib/supabase/client')` returning a documented fake-client shape covering the surfaces the tests touch.

**[MEDIUM] Enrollment's anonymous `app_meta` probe is undocumented in the pinned contract and contradicts doc 01 §4's own RLS label**
Source agent: database-reviewer
Doc: 01-canvas-hub-architecture.md:50, :353; 02-canvas-hub-implementation-plan.md:78; canvas-hub-spec.md §3
Issue: Flow A gates enrollment on an anonymous pre-sign-in `app_meta` select succeeding, but spec §3 never mentions `app_meta`, and doc 01 §4 labels its RLS "agency-wide SELECT" (authenticated). An anonymous probe against an authenticated-only policy fails for a valid project → a real agency becomes un-enrollable with a misleading "rejected" message. The gate rests on an assumed more-permissive anon-SELECT policy stated nowhere.
Fix: Add `app_meta` to the §3 contract with its actual RLS stated (anon-SELECT, distinct from the data tables), reconcile the §4 label, and record the anon-read as live-verified behavior.

**[MEDIUM] The `['cases']` query is an unbounded, unordered, unlimited agency-wide read**
Source agent: database-reviewer
Doc: 02-canvas-hub-implementation-plan.md:128–129
Issue: `fetchCases()` pins no status filter, no order, no limit, no server-side `deleted_at is null`. On a mature deployment it pulls the entire case archive — refetched on every catch-up invalidation and case-level realtime event on an always-on board. The CaseSwitcher needs only the active set.
Fix: Pin server-side predicates: exclude archived/soft-deleted, `order by updated_at desc`, bounded limit; search/pagination later if needed.

**[MEDIUM] No periodic reconciliation for the realtime-only location cache — a silently-dropped broadcast leaves the board wrong while health reads "live"**
Source agent: database-reviewer
Doc: 02-canvas-hub-implementation-plan.md:129, :131, :163; 01-canvas-hub-architecture.md:335; spec §6
Issue: Locations rely on realtime + wake/online/resubscribe invalidation only. Broadcast is best-effort with no ack/replay; a single event lost on a healthy socket is caught by nothing, and an always-on kiosk may see no wake trigger for days. Meanwhile the 20 s media poll keeps feeding `recordFetchOk`, so health stays green — one location silently wrong under a "live" badge, the exact failure spec §6 forbids.
Fix: Add a low-frequency safety-net refetch of case-scoped location/case queries (few-minute `refetchInterval` or periodic scoped invalidation) — the location analogue of the media poll.

**[MEDIUM] Flow E forces `refreshSession()` on every wake/online/resubscribe — redundant with `autoRefreshToken` and race-prone against a rotating refresh token**
Source agent: database-reviewer
Doc: 01-canvas-hub-architecture.md:380; 02-canvas-hub-implementation-plan.md:77, :297
Issue: `autoRefreshToken: true` already keeps the token fresh and propagates it to Realtime on TOKEN_REFRESHED. A manual `refreshSession()` racing the background refresh can submit an already-consumed (rotated) refresh token → "invalid refresh token" → a healthy always-on session forced to signed-out. supabase-js serializes refreshes via `navigator.locks` — present in WebView2 (primary target) but worth pinning; the forced round-trip is redundant regardless.
Fix: On wake, check validity (`getSession()`/expiry) and refresh only when near/after expiry; let autoRefreshToken own routine rotation. Confirm `navigator.locks` in the target webview. Add a long-run idle test (background refresh with no wake event; private channel survives) — #104 covers only the wake path.

### LOW

**[LOW] M5 registers `session-lock-now` before its unlock UI ships in M6**
Source agent: plan-architect-reviewer
Doc: 02-canvas-hub-implementation-plan.md:275 (5.3B) vs :286–287 (6.1B)
Issue: In an M5 build, "lock now" sets `locked` and masks credentials, but no LockOverlay or unlock affordance exists until M6 — the only escape is sign-out. Contradicts milestone independence (line 7).
Fix: Move `session-lock-now` registration into Phase 6.1, or land LockOverlay's unlock in M5.

**[LOW] Root-manifest `keyring` dependency is never scheduled in a phase**
Source agents: rust-reviewer + plan-quality-checker — merged
Doc: 02-canvas-hub-implementation-plan.md:64 (1.1C), :74 (1.2A), :318 (Appendix B); 01-canvas-hub-architecture.md:430
Issue: Appendix B maps `src-tauri/Cargo.toml` to Phase 1.1 only, and 1.1C adds just the workspace member. keyring — used by 1.2A — is never added by any phase step. Self-correcting compile error, but a gap in a follow-verbatim plan.
Fix: Add `keyring ^3` to Phase 1.2's Cargo.toml touchpoints and reflect in Appendix B.

**[LOW] `session.vault` write atomicity unspecified while the config write is pinned atomic**
Source agent: rust-reviewer
Doc: 02-canvas-hub-implementation-plan.md:74 (1.2A)
Issue: A torn vault write degrades gracefully (`Corrupt` → re-sign-in), so not data loss — but the template ships the exact temp-file + rename pattern to reuse (preferences/commands/mod.rs:97–112).
Fix: Specify the same atomic-write pattern for `session.vault`.

**[LOW] Tests #73–74 and #91–92 assert component behavior with no test-file home in the location table**
Source agent: plan-quality-checker
Doc: 03-canvas-hub-test-spec.md:36, :44
Issue: Fly-to/marker-click tests (3.3) map only to `mapData.test.ts` (pure GeoJSON); pulse tests (5.1) only to `ActivityFeed.test.tsx`. No MarkerLayer or useFlyTo test file appears anywhere.
Fix: Add `useFlyTo.test.ts`/`MarkerLayer.test.tsx` (or note additions to `LocationCard.test.tsx`) for 3.3 and 5.1.

**[LOW] "12 hand-modified files" counts table rows, not physical files (~17)**
Source agent: plan-quality-checker
Doc: 01-canvas-hub-architecture.md:405; 02-canvas-hub-implementation-plan.md:331
Issue: Several Appendix B rows bundle multiple files (mod.rs+bindings.rs; three locale files; types+service). Cosmetic — the table, not the count, drives implementation. ("50 new source files" is exact.)
Fix: Say "12 integration-point rows" or restate the physical count.

**[LOW] Signed URLs are created one-per-thumbnail; the batch `createSignedUrls` API is unused**
Source agent: database-reviewer
Doc: 02-canvas-hub-implementation-plan.md:219–221
Issue: N signing requests per card, re-issued each staleTime cycle. Fine at ~10 locations/case; a known ceiling for denser cases.
Fix: Acceptable for V1 — note the ceiling and pin `createSignedUrls` (per-case batched signing) as the upgrade path.

**[LOW] Select shapes / column lists never pinned; drift detection rests entirely on the schema gate**
Source agent: database-reviewer
Doc: 01-canvas-hub-architecture.md:255; 02-canvas-hub-implementation-plan.md:128
Issue: Implicit `select('*')` means unmodeled form_data keys DO cross the wire (§5.1's "cost nothing" is true for parsing, false for bandwidth), and a renamed cloud column surfaces only as runtime `undefined` unless `schema_version` bumps.
Fix: Pin explicit column lists (fail-fast, bounded payload) or state `select('*')` + schema gate as the deliberate drift strategy and correct the §5.1 claim to "cost nothing to parse."

## Per-Agent Tallies

| Agent | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| plan-architect-reviewer | 0 | 0 | 0 | 2 |
| plan-quality-checker | 0 | 1 | 1 | 3 |
| plan-reality-checker | 0 | 0 | 1 | 0 |
| rust-reviewer (proposal mode) | 0 | 0 | 3 | 2 |
| typescript-reviewer (proposal mode) | 0 | 1 | 7 | 0 |
| database-reviewer (proposal mode) | 0 | 1 | 4 | 2 |
| **Total (after dedupe)** | **0** | **3** | **15** | **7** |

Dedupe merges: health-ownership (quality HIGH + ts MEDIUM → one HIGH); AD11 preferences seam (reality MEDIUM + architect LOW → one MEDIUM); base64 (rust MEDIUM + quality LOW → one MEDIUM); keyring scheduling (rust LOW + quality LOW → one LOW). 28 raw findings → 25 after dedupe.

## Files Reviewed

- docs/plans/canvas-hub/01-canvas-hub-architecture.md (457 lines)
- docs/plans/canvas-hub/02-canvas-hub-implementation-plan.md (346 lines)
- docs/plans/canvas-hub/03-canvas-hub-test-spec.md (280 lines)

## Next Steps

1. Fix the three HIGHs — all are localized doc edits: (a) remove `setHealth`/"health types" from cloud-session, home everything health in the global store; (b) add a dedicated `refetchInterval` to `useSignedUrl` and scope catch-up invalidation to case-data keys; (c) pin the mapper at every cache boundary (realtime patch + media fetch) and strengthen test #49.
2. Sweep the MEDIUMs — most are one-line pins (Map→Record, key get-or-create, no-log constraint, upsert-by-id, single-key invariant, `['cases']` predicates, `app_meta` contract entry, supabase-js mock seam, wake-refresh guard, periodic reconciliation).
3. Re-run with `--fix-delta` after revision: `/react-tauri-rust-plan-review 1 --fix-delta` — the reviewers below can be resumed with their context intact.

## Agent IDs
<!-- Used by /react-tauri-rust-plan-review --fix-delta to resume reviewers via SendMessage (address by name). -->
- plan-architect-reviewer: arch-reviewer
- plan-quality-checker: quality-checker
- plan-reality-checker: reality-checker
- rust-reviewer (proposal mode): rust-lane
- typescript-reviewer (proposal mode): ts-lane
- database-reviewer (proposal mode): db-lane
