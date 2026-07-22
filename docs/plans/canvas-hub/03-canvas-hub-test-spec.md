# Canvas Hub V1 — Test Spec

**Role:** the proof — the checklist. Companions: `01-canvas-hub-architecture.md` (**the design** — authoritative for contracts & flows) and `02-canvas-hub-implementation-plan.md` (**the how** — authoritative for phases & file detail).

**Basis:** doc 01 §5 (contracts, trap list) and doc 02 phases. **Supersedes:** nothing.

**TDD red line:** every test below is written **before** its phase's implementation and must **fail** until that phase lands. Test numbering (`#`) runs continuously across the whole document (post-review additions are appended — numbers never shift). Mock strategy, fixtures, and wiring follow this repo's existing conventions (`docs/developer/testing.md`, `src/test/*` helpers) — this spec pins **what each test proves**, not how it's wired.

**Ported tests (A2, Phase 6.3A):** the adapted `processTerminal` port brings its own test files for the retained surface (`ansiParser`, `vtEngine`/`TextLane` — fix-delta 2 cut `rich/*` with its `DisplayItem` contract), adapted to compile against canvas-hub homes; files covering the discarded dispatcher/sources are dropped with their subjects. Ported tests run in the gate (`check:all` runs `test:run`) but are **excluded from the numbered count in this document** — the numbering counts canvas-hub-authored tests only.

**One new seam the repo's conventions don't yet cover:** tests exercising services that wrap supabase-js directly (#11, #15–19, #41–51, #77–78) mock the client at its single choke point — `vi.mock('@/lib/supabase/client')` with a minimal fake returned by `getSupabase()` covering only the touched surfaces (`auth.signInWithPassword/getSession/refreshSession/signOut`, the `from().select()…` chain, `channel().on().subscribe()`, `storage.from().createSignedUrl`). Test #11 is covered by the same seam via `createProbeClient` — the enrollment probe runs before `initSupabase`, so it uses the transient probe client exported from `client.ts`, not `getSupabase()`. The fake's shape gets documented in `docs/developer/supabase-integration.md` (Phase 6.4A — the docs pass; renumbered from 6.3 by A2).

**Run commands:**

- TypeScript (scoped): `npx vitest run src/features/cloud-session src/features/canvass src/lib/supabase`
- Rust: `cd src-tauri && cargo test -p secure-vault -p platform-utils` (platform-utils gains #127–129 at 6.3B′)
- Full gate: `npm run check:all`

---

## Test File Location Table

| Test file                                                              | Phase | Status    |
| ---------------------------------------------------------------------- | ----- | --------- |
| `src-tauri/crates/secure-vault/src/lib.rs` (inline `#[cfg(test)]`)     | 1.1   | NEW       |
| `src/lib/supabase/vault-storage.test.ts`                               | 1.2   | NEW       |
| `src/features/cloud-session/__tests__/configService.test.ts`           | 1.2   | NEW       |
| `src/features/cloud-session/__tests__/authService.test.ts`             | 1.2   | NEW       |
| `src/features/cloud-session/__tests__/session-store.test.ts`           | 1.3   | NEW       |
| `src/features/cloud-session/__tests__/useAuthBootstrap.test.ts`        | 1.3   | NEW       |
| `src/features/cloud-session/__tests__/screens.test.tsx`                | 1.4   | NEW       |
| `src/features/canvass/__tests__/geo.test.ts`                           | 2.1   | NEW       |
| `src/features/canvass/__tests__/mappers.test.ts`                       | 2.1   | NEW       |
| `src/features/canvass/__tests__/queries.test.ts`                       | 2.2   | NEW       |
| `src/features/canvass/__tests__/realtime.test.ts`                      | 2.3, (R6 #130–131 — ledger D17) | NEW + additions |
| `src/features/canvass/__tests__/canvass-store.test.ts`                 | 2.4   | NEW       |
| `src/features/canvass/__tests__/LocationCard.test.tsx`                 | 2.4, 4.3 (#88 — media strip, M4), 5.1 (pulse additions — #91–92) | NEW |
| `src/features/canvass/__tests__/useFlyTo.test.ts`                      | 3.3 (#73–74, R7 #135) | NEW + additions |
| `src/features/canvass/__tests__/markers.test.ts` (R7 #132–134 — PR #6 review M3) | 3.3 | NEW |
| `src/store/health-store.test.ts` (next-to-store, `ui-store.test.ts` precedent) | 2.5, 6.2 | NEW (6.2 additions) |
| `src/features/preferences/__tests__/preferences-additions.test.tsx`    | 3.1   | NEW (the preferences feature currently has no tests) |
| `src/features/canvass/__tests__/MapCanvas.test.tsx`                    | 3.2, (R7 #136–137 — PR #6 review M4) | NEW + additions |
| `src/features/canvass/__tests__/mapData.test.ts`                       | 3.3   | NEW       |
| `src/features/canvass/__tests__/cardStack.test.tsx`                    | 3.4   | NEW       |
| `src/features/canvass/__tests__/mediaService.test.ts`                  | 4.1   | NEW       |
| `src/features/canvass/__tests__/MediaThumb.test.tsx`                   | 4.1   | NEW       |
| `src/features/canvass/__tests__/attention.test.ts`                     | 4.2   | NEW       |
| `src/features/canvass/__tests__/useMediaPolling.test.ts`               | 4.2   | NEW       |
| `src/features/canvass/__tests__/VideoPlayer.test.tsx`                  | 4.3   | NEW       |
| `src/features/canvass/__tests__/ActivityFeed.test.tsx`                 | 5.1   | NEW       |
| `src/features/cloud-session/__tests__/ConnectionIndicator.test.tsx`    | 5.2   | NEW       |
| `src/features/canvass/__tests__/DashboardView.test.tsx`                | 5.3   | NEW       |
| `src/lib/commands/commands.test.ts`                                    | 5.3, 6.1 (#108) | additions |
| `src/features/cloud-session/__tests__/idleLock.test.tsx`               | 6.1   | NEW       |
| `src/features/canvass/__tests__/casesView.test.tsx` (A1, #110–111)     | 2.4   | NEW       |
| `src/lib/supabase/secondary-client.test.ts` (A1, #114–116)             | 7.2   | NEW       |
| `src/features/canvass/__tests__/secondaryWindows.test.tsx` (A1, #112–113, #117–119, #121) | 7.1–7.3 | NEW |
| `src/features/process-panel/__tests__/processPanel.test.tsx` (A2, #120, #122–125) | 6.3   | NEW       |
| `src/features/canvass/__tests__/imageViewer.test.tsx` (A2, #126)        | 4.3   | NEW       |
| `src-tauri/crates/platform-utils/src/lib.rs` (inline `#[cfg(test)]`, A2 fix round, #127–129) | 6.3 | additions |

No existing test file is deleted or rewritten, with two sanctioned exceptions: **#98 is amended in place at Phase 6.3C** (the feed relocates to the panel — the test flips to assert the recomposed dashboard), and **`LocationCard.test.tsx`'s selection-a11y test is amended in place at Phase 3.4A** (ledger D16 migrates the card from `role="button"` to the single-select `role="option"`/`aria-selected` model — the old role query is the exact thing D16 changes). **As-built 6.3C riders on the #98 relocation (M6):** #90's scoping arm retargeted its subject in place (`CaseDashboard` → `PanelActivityLane`, the code that owns the case filter after the relocation — the pinned behavior is unchanged), and two `casesView.test.tsx` header-chrome arms scoped their state-word queries to the header banner (the panel footer now renders the same word; the pins stay on the D15 chip). Four existing files receive **additions** only (`src/lib/commands/commands.test.ts`, `src-tauri/crates/platform-utils/src/lib.rs`, `src/features/canvass/__tests__/realtime.test.ts` — R6, `src/features/canvass/__tests__/LocationCard.test.tsx` — #88 at 4.3, M4). Before Phase 1.4 removes the sidebar panels, audit existing component/hook tests for assertions pinned to that layout and re-home them in the same commit — nothing pinned may silently disappear.

---

## Phase 1.1 — secure-vault crate (Rust)

| #   | Test Description                                                       | Key Assertion                                                    |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Should round-trip seal → open with the same key                        | `open(key, seal(key, pt)) == pt`                                 |
| 2   | Should fail to open with a different key                               | `Err(VaultError::AuthFailed)`                                    |
| 3   | Should fail to open tampered ciphertext                                | flipping one byte ⇒ `Err(VaultError::AuthFailed)`                |
| 4   | Should reject sealed input shorter than the nonce frame                | `Err(VaultError::Corrupt)`, no panic                             |
| 5   | Should produce distinct ciphertexts for identical plaintexts           | two `seal` calls differ (fresh nonce each time)                  |
| 6   | Should round-trip a session-sized payload (≥ 4 KB)                     | 4 KB+ JSON survives seal/open byte-identical                     |

## Phase 1.2 — config, vault adapter, auth services

| #   | Test Description                                                            | Key Assertion                                                            |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 7   | Should return null config when the backend has none                         | `loadConfig()` resolves `null` (not throw)                               |
| 8   | Should round-trip save → load of a CloudConfig                              | loaded equals saved (url, key, email)                                    |
| 9   | Should parse a valid v1 enrollment payload                                  | `{v:1,url,key}` ⇒ `{url, key}`                                           |
| 10  | Should reject malformed enrollment payloads                                 | bad JSON / wrong shape / `v≠1` ⇒ `EnrollmentPayloadError`                |
| 11  | Should surface probe rejection distinctly from unreachable                  | PostgREST error ⇒ "rejected"; network throw ⇒ "unreachable"              |
| 12  | Should read the vault through the storage adapter                           | `vaultStorage.getItem` returns the command's decrypted value             |
| 13  | Should write the vault through the storage adapter (single-blob invariant)  | `setItem` forwards value to `vaultSet`; transient `…-code-verifier` keys are backed in-memory and never reach the vault (live-falsified single-key premise, M1); any other second session-class key triggers the loud failure path (key name only — never the value) |
| 14  | Should treat vault command failure as absent session, not a crash           | command error ⇒ `getItem` resolves `null`                                |
| 15  | Should sign in and persist the session via the adapter                      | after `signIn`, session lands in vault storage                           |
| 16  | Should surface bad credentials as a typed sign-in failure                   | auth error message reaches the caller; no session stored                 |
| 17  | Should pass the schema gate when `schema_version == 1`                      | `checkSchemaGate()` ⇒ `'ok'`                                             |
| 18  | Should fail the schema gate on any other version                            | version 2 / missing row ⇒ `'mismatch'`                                   |
| 19  | Should clear vault and client state on sign-out                             | `signOut()` ⇒ vault cleared + subsequent `getSupabase` re-init required  |

**M1 verification obligation (not a numbered test — app-crate Rust is not unit-testable on Windows):** before closing M1, grep-review the vault service/commands for any `{value:?}`/`{result:?}`/argument logging (the 1.2A no-log constraint), and verify Flow B relaunch-restore against the running app — a per-write `generate_key()` regression manifests as forced re-sign-in on every restart. Re-checked in the Phase 6.3B pass (A2: 6.3B is the `read_log_tail`/`vault_status` Rust MODIFY touching the same `cloud_session` services — the re-check rides that touch).

## Phase 1.3 — session store + bootstrap

| #   | Test Description                                                         | Key Assertion                                                   |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 20  | Should start in `booting` and reach `needs-setup` with no config         | bootstrap with null config ⇒ `needs-setup`                      |
| 21  | Should reach `signed-out` with config but no restorable session          | restore=false ⇒ `signed-out`                                    |
| 22  | Should reach `active` with config + session + gate pass                  | full Flow B ⇒ `active`                                          |
| 23  | Should reach `schema-gate` on gate mismatch                              | gate `'mismatch'` ⇒ `schema-gate`, never `active`               |
| 24  | Should transition `active → locked → active` via lock/unlock actions     | `lock()` then `unlock()` restores `active`                      |

## Phase 1.4 — session screens

| #   | Test Description                                                          | Key Assertion                                              |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 25  | Should render SetupScreen in `needs-setup` and submit a pasted payload    | valid paste calls save + advances state                    |
| 26  | Should show an inline translated error on probe failure                   | rejected probe ⇒ error text visible, form still editable   |
| 27  | Should render SignInScreen in `signed-out` and sign in                    | submit calls `signIn(email, pw)`                           |
| 28  | Should render SchemaGateScreen with the found vs required version         | mismatch state shows both versions, no board mount         |

## Phase 2.1 — geo + mappers (the trap list)

| #   | Test Description                                                            | Key Assertion                                                    |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 29  | Should parse a live-format WKB hex point to lat/lng                         | known hex ⇒ `{lat, lng}` within 1e-6 (lng-first order honored)   |
| 30  | Should parse the SRID-flagged geography variant                             | `0101000020E6100000…` form parses                                |
| 31  | Should return null for `(0,0)`                                              | null-island guard (GPS no-fix)                                   |
| 32  | Should return null for malformed or truncated hex                           | garbage / short input ⇒ `null`, no throw                         |
| 33  | Should return null for a null `location` column                             | `parse(null-ish)` pathway ⇒ `coord: null`                        |
| 34  | Should keep lat/lng within valid ranges on real seed data                   | all 8 seeded coords within bounds                                |
| 35  | Should exclude soft-deleted rows in `visibleRows`                           | `deleted_at != null` filtered for cases, locations, media        |
| 36  | Should map a full LocationRow to a CanvassLocation                          | name/status/investigator/coord/arrival populated                 |
| 37  | Should surface the latest arrival across multiple visits                    | max `arrivalDateTime` wins (multi-visit seed shape)              |
| 38  | Should degrade gracefully on older-shape/empty form_data                    | all enrichment fields null/absent; no throw, no "undefined" text |
| 39  | Should label the investigator from requester_name with uid fallback         | empty `requester_name` ⇒ shortened `user_id`                     |
| 40  | Should keep DVR credentials present on the view-model                       | `dvrUsername`/`dvrPassword` pass through verbatim — ordinary strings, no secrecy handling at any layer (owner directive) |

## Phase 2.2 — queries

| #   | Test Description                                                        | Key Assertion                                            |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| 41  | Should fetch cases with pinned server-side predicates                   | mapped visible cases; query excludes archived + soft-deleted, ordered by `updated_at desc`, bounded limit |
| 42  | Should fetch locations keyed by case                                    | `['locations', caseId]` key; only that case's rows       |
| 43  | Should fetch media keyed by case, mapped at the boundary                | `['media', caseId]`; rows are `CanvassMedia` with soft-deleted excluded |
| 44  | Should exclude soft-deleted rows end-to-end                             | seeded soft-deleted location absent from hook data       |
| 45  | Should report query failure to health                                   | service throw ⇒ `recordFetchError` called + hook error   |

## Phase 2.3 — realtime

| #   | Test Description                                                             | Key Assertion                                                     |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 46  | Should subscribe to `agency:activity` as a private channel                    | channel name + `{ config: { private: true } }`                    |
| 47  | Should decode the broadcast_changes payload shape                             | `{operation, table, record, old_record}` ⇒ typed `ActivityEvent` (shape pinned against a live capture in M2) |
| 48  | Should dispatch only events matching the subscribed case_id                   | other-case record ⇒ handler not called (G6 partition rule)        |
| 49  | Should patch an UPDATE into the locations cache by id, **mapped**             | replaced row is a `CanvassLocation` (coord parsed — no raw WKB hex in cache); no refetch issued |
| 50  | Should upsert INSERTs by id and drop soft-deleted rows from cache             | a redelivered INSERT replaces, never duplicates (exactly one row per id); `deleted_at` set ⇒ removed |
| 51  | Should ignore unknown tables/ops without throwing                             | forward-compat: unhandled payload ⇒ no-op                         |

## Phase 2.4 — canvass store + cards

| #   | Test Description                                                          | Key Assertion                                                  |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 52  | Should select a case and clear location selection                         | `selectCase` resets `selectedLocationId`                       |
| 53  | Should cap the activity ring at 200 entries                               | 201st push evicts the oldest                                   |
| 54  | Should scope activity entries to their case                               | entries carry `caseId`; other-case entries not shown           |
| 55  | Should stamp and expire attention marks                                   | stamp sets timestamp; `clearExpiredAttention(now+TTL)` removes |
| 56  | Should navigate across the three views (A1)                               | `setView` round-trips `'cases'` / `'case'` / `'map'`           |
| 57  | Should render card fields from the view-model                             | name, address, status, investigator, arrival visible           |
| 58  | Should render DVR credentials plainly, always                             | username/password text present in every session state (spec §3; owner directive — ordinary strings) |
| 59  | Should reflect status with distinct styling per state                     | started/working/complete map to distinct classes               |
| 60  | Should render designed empty states                                       | no locations ⇒ empty-state copy, not blank                     |

## Phase 2.5 — connection health

| #   | Test Description                                                            | Key Assertion                                             |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| 61  | Should report `live` while confirmations are fresh                          | recent event/fetch ⇒ `live`                               |
| 62  | Should degrade to `stale` after the silence threshold                       | no confirm > `STALE_AFTER_MS` ⇒ `stale` (G4)              |
| 63  | Should report `reconnecting` on channel drop and recover on resubscribe     | drop ⇒ `reconnecting`; resubscribe ⇒ queries invalidated  |
| 64  | Should report `offline` from the browser signal and pause polling gate      | `offline` event ⇒ state + polling predicate false         |
| 65  | Should only upgrade on positive confirmation                                | evaluate never returns `live` without a fresh confirm     |

## Phase 3.1 — preferences additions

| #   | Test Description                                                     | Key Assertion                                     |
| --- | -------------------------------------------------------------------- | ------------------------------------------------- |
| 66  | Should round-trip the three new preference fields                    | token/style/idle minutes survive save → load      |
| 67  | Should render the new inputs in the dialog                           | three fields present, token field masked-style    |

## Phase 3.2 — map canvas

| #   | Test Description                                                | Key Assertion                              |
| --- | --------------------------------------------------------------- | ------------------------------------------ |
| 68  | Should show the token gate when no Mapbox token is configured   | gate copy rendered, no `<Map>` mount       |
| 69  | Should mount the map when a token exists                        | Map receives token + style props           |

## Phase 3.3 — markers, clustering, fly-to

| #   | Test Description                                                        | Key Assertion                                          |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| 70  | Should build GeoJSON only from locations with coordinates               | `coord: null` rows excluded (no null-island markers)   |
| 71  | Should carry status and attention props on features                     | feature props include `status`, `attention` flags      |
| 72  | Should emit a distinct incident feature when the case has coords        | incident feature separate from location features       |
| 73  | Should fly to a location when its card is selected                      | `selectLocation` ⇒ `flyTo` with that coord             |
| 74  | Should highlight the card when its marker is selected                   | marker click ⇒ `selectedLocationId` + scroll-into-view |

## Phase 3.4 — floating card stack

| #   | Test Description                                                  | Key Assertion                                       |
| --- | ----------------------------------------------------------------- | --------------------------------------------------- |
| 75  | Should group cards under their case header                        | case-grouped order per spec §4                      |
| 76  | Should sort attention-fresh cards to the top of their group       | recent attention ⇒ earlier position                 |

## Phase 4.1 — signed URLs + thumbnails

| #   | Test Description                                                        | Key Assertion                                                |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| 77  | Should create a signed URL for a bucket/path                            | service called with bucket, path, `SIGNED_URL_TTL_S`         |
| 78  | Should proactively re-sign a continuously-mounted thumbnail before TTL  | `refetchInterval` (< TTL) configured — refresh does not depend on focus/reconnect; second render within `staleTime` hits cache |
| 79  | Should classify renderable vs non-renderable mimes                      | jpeg/png/webp/mp4 true; heic/quicktime false                 |
| 80  | Should render an image thumb for renderable images                      | `<img>` with signed URL                                      |
| 81  | Should render the fallback tile for HEIC (never a broken img)           | placeholder + open-externally affordance                     |

## Phase 4.2 — media polling + diff (G3)

| #   | Test Description                                                       | Key Assertion                                               |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| 82  | Should detect newly arrived media rows by id                           | `diffMedia(prev, next)` returns only the new visible rows   |
| 83  | Should diff by id, not position — no re-report on reorder/refetch      | inputs are `CanvassMedia[]` (boundary already filtered soft-deleted — see #43); reordered/unchanged rows ⇒ empty diff |
| 84  | Should emit a media-new activity entry with location attribution       | entry kind `media-new`, `locationId` set, attention stamped |
| 85  | Should keep polling while locked and stop only when offline/signed-out | `locked` ⇒ interval **enabled**; `offline`/`signed-out` ⇒ disabled (doc 01 §5.4) |

## Phase 4.3 — video + media UX

| #   | Test Description                                                      | Key Assertion                                  |
| --- | --------------------------------------------------------------------- | ---------------------------------------------- |
| 86  | Should render video on demand with no preload/autoplay                | `preload="none"`, no `autoPlay`                |
| 87  | Should swap to fallback on player error                               | error event ⇒ fallback panel, player unmounted |
| 88  | Should show media count badges on the card                            | image/video/audio counts per location          |

## Phase 5.1 — feed + pulses

| #   | Test Description                                                   | Key Assertion                                 |
| --- | ------------------------------------------------------------------ | --------------------------------------------- |
| 89  | Should render the feed most-recent-first                           | newest entry first in DOM order               |
| 90  | Should scope the feed to the selected case                         | other-case entries absent                     |
| 91  | Should apply the pulse class while attention is fresh              | marker/card carries pulse class within TTL    |
| 92  | Should drop the pulse class after TTL expiry                       | expired stamp ⇒ class absent                  |

## Phase 5.2 — connection indicator

| #   | Test Description                                                    | Key Assertion                                |
| --- | ------------------------------------------------------------------- | -------------------------------------------- |
| 93  | Should show state dot + last-updated in live/connecting states      | chip renders state + `HH:MM:SS`              |
| 94  | Should escalate to banner mode when stale                           | `stale` ⇒ banner with "since" timestamp (G4) |
| 95  | Should escalate to banner mode when offline                         | `offline` ⇒ banner                           |

## Phase 5.3 — dashboard + palette

| #   | Test Description                                                     | Key Assertion                                     |
| --- | -------------------------------------------------------------------- | ------------------------------------------------- |
| 96  | Should show status counts for the selected case                      | started/working/complete counts match seed        |
| 97  | Should derive the roster from location rows (AD8)                    | investigators grouped with their locations/status |
| 98  | Should embed the activity feed (M5 interim home)                     | feed rendered within dashboard at M5 (5.3A); **Phase 6.3C amends this test in place** to assert the recomposed dashboard — feed absent (relocated to the panel's ACTIVITY lane), roster occupying the freed column |
| 99  | Should register the M5 palette commands (A1)                         | `canvass-view-cases` / `canvass-view-case` / `canvass-view-map` + `session-sign-out` in the registry (`session-lock-now` registers in 6.1, with its unlock overlay) |

## Phase 6.1 — idle lock

| #   | Test Description                                                        | Key Assertion                                       |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| 100 | Should lock after the configured idle period                            | fake timers: no activity ⇒ `locked`                 |
| 101 | Should reset the idle timer on user activity                            | activity event ⇒ timer restarts, no lock            |
| 102 | Should leave board content untouched while locked                       | locked ⇒ overlay blocks interaction but card text — DVR credentials included — is byte-identical to unlocked (AD6 + owner directive: lock alters nothing) |
| 103 | Should resume on successful re-auth and stay locked on failure          | good pw ⇒ `active`; bad pw ⇒ `locked` + inline error |

## Phase 6.2 — wake / reconnect catch-up

| #   | Test Description                                                         | Key Assertion                                              |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 104 | Should refresh on wake only when the session is near/after expiry        | fresh session ⇒ no `refreshSession` call (autoRefreshToken owns rotation); near-expiry ⇒ `refreshSession` then `setAuth` order |
| 105 | Should invalidate case-data queries on catch-up, excluding signed URLs   | invalidation covers `['cases']`, `['locations', id]`, `['media', id]`; `['signed-url', …]` queries are NOT refetched |
| 106 | Should drop to signed-out when the refresh is refused **(amended in place, PR #9 M2 fix round)** | a DEFINITE 4xx `invalid_grant` refusal ⇒ `signed-out` (never silently stale); a network-shaped refresh failure (status 0/5xx/429) is `deferred` — stays put and retries, never a forced sign-out on a transient blip (unnumbered deferred + setAuth-hiccup arms ride in the same file) |

---

## Revision R1 additions (post plan-review PR #1)

Appended so existing test numbers never shift. Belongs to **Phase 2.2** (counted there in the summary).

| #   | Test Description                                                          | Key Assertion                                                                     |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 107 | Should reconcile case-data queries on a slow interval as a broadcast safety net | cases/locations queries carry `refetchInterval: RECONCILE_MS`; a cache made stale by a dropped broadcast converges within one cycle without any realtime event |

## Revision R2 additions (post fix-delta review)

Belongs to **Phase 6.1** (counted there in the summary).

| #   | Test Description                                          | Key Assertion                                                              |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 108 | Should register `session-lock-now` when 6.1 lands          | command id present in the registry after 6.1C init (it ships with LockOverlay — restores the registration coverage #99 lost when the command moved out of 5.3) |

## Revision R3 additions (M1 implementation)

Belongs to **Phase 1.2** (counted there in the summary). Written during M1 as cheap real coverage of otherwise mock-only code; recorded here per the reconcile rule.

| #   | Test Description                                        | Key Assertion                                                    |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| 109 | Should report whether a session is restorable            | `restoreSession()` resolves `true` with a vaulted session, `false` without |

## Revision R4 additions (Amendment A1 — three-view IA + multi-window)

#110–111 belong to **Phase 2.4**; #112–113 to **Phase 7.1**; #114–117 to **Phase 7.2**; #118–119 and #121 to **Phase 7.3**; **#120 reassigned by A2 to Phase 6.3** (the ProcessPanel owns diagnostics content).

| #   | Test Description                                                          | Key Assertion                                                                 |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 110 | Should render the Cases landing view with one card per active case         | seeded case ⇒ card with case number, incident address, status counts, last activity |
| 111 | Should navigate from a case card to the case dashboard                     | selecting a card sets `selectedCaseId` + `view: 'case'`; `case`/`map` rail entries disabled with no selection |
| 112 | Should open a view window with its case context                            | rail pop-out affordance ⇒ `commands.openViewWindow(view, caseId)` called with the selected case's id (the window is unusable without it) |
| 113 | Should focus, not duplicate, an already-open view window                   | second open call for the same view resolves without creating a second window (service contract) |
| 114 | Should authenticate secondary REST requests with the pushed user token     | client is created with the `accessToken` callback; a REST request carries the user bearer token, NOT the publishable key (anon REST = RLS-empty board); no refresh ticker |
| 115 | Should never touch the vault from a secondary context                      | secondary init + reads issue zero `vaultGet`/`vaultSet`/`vaultClear` calls (T9) |
| 116 | Should update the secondary client when main rebroadcasts a refreshed token | `session-token` event ⇒ `updateSecondaryToken` swaps the `accessToken` closure token AND calls `realtime.setAuth` (no `onAuthStateChange` exists in a secondary) |
| 117 | Should tear down and terminalize on `session-ended` (sign-out only)        | event ⇒ channels removed + realtime disconnected + token discarded BEFORE the ended screen (no broadcast delivered after the event); teardown also runs the **per-context session-exit purge** — this context's stores reset + its own QueryClient's `CASE_DATA_KEY_FAMILIES` entries removed (doc 01 §5.4 invariant); `session-locked` instead ⇒ this context's session-store goes `locked` (interaction in step with main), board keeps flowing, content unchanged (AD6 parity + owner directive); no credential prompt exists in the secondary context |
| 118 | Should host the view and consume the case-id round-trip                    | `SecondaryRoot` mounts `MapCanvas`/`DashboardView` per `view` param with its own QueryClient; `view-context {view, caseId}` drives `selectCase(caseId)` + the mount-scoped subscription — `subscribeToCaseActivity(getCaseId, …)` in the five-arg thunk form (doc 01 §5.2), with `getCaseId` reading THIS context's canvass-store (a positional case id is a type error and would freeze the channel to one case) (the receive side of the H2/H3 contract) |
| 119 | Should offer pop-out only on case and map rail entries                     | `cases` entry has no pop-out affordance (bound to main)                        |
| 120 | Should render diagnostics content in the SYSTEM lane (A2: panel, not window) | health detail, log tail (via the diagnostics service wrapping `readLogTail`), vault/keyring status, app + schema versions present |
| 121 | Should keep main-window state untouched when a secondary closes            | close event ⇒ canvass-store selection/view unchanged in main                   |

## Revision R5 additions (Amendment A2 — process panel + design bindings)

#122–125 belong to **Phase 6.3**; #126 to **Phase 4.3**; #127–129 (Rust — `platform-utils::tail_log`, A2 fix round) to **Phase 6.3B′** (counted under 6.3 in the summary). Ported 6.3A test files are **not numbered here** — see the ported-tests rule in the preamble.

| #   | Test Description                                                          | Key Assertion                                                                 |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 122 | Should render canvass activity in the ACTIVITY lane                        | activity-ring entries appear newest-first — the lane renders the `activitySlot` ReactNode that `CanvassRoot` fills with `<ActivityFeed />` (composition; no cross-feature import — fix-delta 2) |
| 123 | Should feed the SYSTEM lane from health transitions + the log tail         | health-store transition rows + polled `readLogTail` lines render source-tagged; a failed tail read renders an inline error row, board unaffected |
| 124 | Should toggle lanes and collapse to the SYS tab                            | ACTIVITY ↔ SYSTEM toggle swaps content; collapse renders the slim tab; expand restores lane + scroll state |
| 125 | Should default the panel posture per view, with user toggles winning       | fresh mount on `cases`/`case` ⇒ expanded, ACTIVITY active; first entry to `map` ⇒ SYS tab; **a manual expand on `map` survives `map → case → map`** (view-derived posture applies on first entry per view only — `viewsSeen`; explicit toggles win thereafter, fix-delta 2); expanded-on-map overlays the card stack — nothing reflows |
| 126 | Should wrap through a location's photos in the ImageViewer                 | ‹ from photo 1 lands on photo N, › from N lands on 1; header shows `PHOTO n OF N` |
| 127 | Should tail cleanly across a mid-codepoint slice boundary (Rust)           | `tail_log(bytes, n, partial_first_line: true)` on a slice starting mid-UTF-8-codepoint never errors — `from_utf8_lossy` + the flagged first-partial-line drop yields only clean lines |
| 128 | Should clamp to the last `max_lines` lines (Rust)                          | input above the clamp returns exactly the newest `max_lines` lines             |
| 129 | Should return the whole input when shorter than the window (Rust)          | `tail_log(bytes, n, partial_first_line: false)` ⇒ all lines intact, first line included — the caller passes `false` because it never seeked (fix-delta 2: the flag is the caller's knowledge, not inferable from bytes) |

## Revision R6 additions (M3 implementation — ledger D17)

Belongs to **Phase 2.3** (counted there in the summary). D17's two untested-guard arms, added at M3's first touch of `realtime.test.ts` per the ledger trigger; both mutation-verified during M3 (reverting each guard fails its arm).

| #   | Test Description                                                          | Key Assertion                                                                 |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 130 | Should survive an `updated_at: null` case event through `toCanvassCase`    | with a ≥2-entry cases cache, a `cloud_cases` broadcast carrying `updated_at: null` still patches the list (guard maps null → `''`, sorts last) and no `realtime: event dispatch failed` is logged — reverting `wireString(row.updated_at)` kills the patch inside the dispatch containment |
| 131 | Should invalidate the landing families with `cancelRefetch: false`         | an options spy pins BOTH pre-filter invalidations — `['location-counts']` and `['cases']` — called with `{ cancelRefetch: false }` (a bulk re-sync burst must not cancel-and-restart the in-flight landing fetches); dropping the options argument fails |

## Revision R7 additions (PR #6 code-review fixes)

#132–135 belong to **Phase 3.3** (counted there in the summary): the review's M3 (untested pure marker factories) and its optional L4 (RTL camera padding). #136–137 belong to **Phase 3.2**: the review's M4 (untested token-rejection path). All six pin behavior that already shipped; #134 and #137 were mutation-verified (a `transition` on the marker root fails #134; dropping the toast dedup guard fails #137).

| #   | Test Description                                                          | Key Assertion                                                                 |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 132 | Should dispatch `onSelect` from a marker click                             | `createLocationMarker` root click ⇒ the onSelect spy fires (the marker half of #74's two-way contract, previously exercised only via `selectLocation`) |
| 133 | Should flip selection/attention/status datasets idempotently on update     | `updateLocationMarker` sets/removes `data-selected`/`data-attention`, updates `data-status` + the COMPLETE ✓ glyph and label text; a repeated identical update changes nothing |
| 134 | Should never put position/transform/transition on the marker ROOT          | MARKER-BINDING rule: `root.style.{position,transform,transition}` all empty after create AND after update, for location and incident factories — Mapbox owns the root transform per frame |
| 135 | Should flip the camera-padding sides under RTL                             | `cameraPadding()` mirrors: `rtl.left === ltr.right` and `rtl.right === ltr.left` (stack clearance follows inline-end) |
| 136 | Should render the rejected gate and resolve the tokenRejected key on 401   | captured `onError({error:{status:401}})` ⇒ the rejected banner renders the RESOLVED `canvass.map.tokenRejected` string, and the same resolved string reaches `toast.error` (a broken key would render its raw name) |
| 137 | Should toast once per rejected token, re-arming on a new token             | double-firing the same 401 ⇒ exactly ONE toast (no per-render storm); a different token failing afterward toasts again (rejection state is token-keyed) |

---

## Test Count Summary

| Phase | Tests | Phase | Tests | Phase | Tests |
| ----- | ----- | ----- | ----- | ----- | ----- |
| 1.1   | 6     | 2.5   | 5     | 4.3   | 4     |
| 1.2   | 14    | 3.1   | 2     | 5.1   | 4     |
| 1.3   | 5     | 3.2   | 4     | 5.2   | 3     |
| 1.4   | 4     | 3.3   | 9     | 5.3   | 4     |
| 2.1   | 12    | 3.4   | 2     | 6.1   | 5     |
| 2.2   | 6     | 4.1   | 5     | 6.2   | 3     |
| 2.3   | 8     | 4.2   | 4     | 6.3   | 8 (5 TS + 3 Rust) |
| 2.4   | 11    | 7.1   | 2     | 6.4   | 0     |
| 7.2   | 4     | 7.3   | 3     |       |       |

**Total: 137** (Rust 9 — 6 `secure-vault` + 3 `platform-utils` · TypeScript 128; #107 → R1/2.2, #108 → R2/6.1, #109 → R3/1.2, #110–121 → R4/A1 with #120 reassigned to 6.3 by A2, #122–129 → R5/A2 with #127–129 the Phase 6.3B′ Rust tests, #130–131 → R6/2.3 (ledger D17, added at M3), #132–135 → R7/3.3 and #136–137 → R7/3.2 (PR #6 review M3 + L4 + M4); ported 6.3A test files are excluded — this count is canvas-hub-authored tests only) — reconciles with the Implementation Plan, Appendix C. **Rule:** if counts drift during implementation, reconcile both documents before proceeding to the next phase.
