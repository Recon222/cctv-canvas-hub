# Canvas Hub V1 — Test Spec

**Role:** the proof — the checklist. Companions: `01-canvas-hub-architecture.md` (**the design** — authoritative for contracts & flows) and `02-canvas-hub-implementation-plan.md` (**the how** — authoritative for phases & file detail).

**Basis:** doc 01 §5 (contracts, trap list) and doc 02 phases. **Supersedes:** nothing.

**TDD red line:** every test below is written **before** its phase's implementation and must **fail** until that phase lands. Test numbering (`#`) runs continuously across the whole document. Mock strategy, fixtures, and wiring follow this repo's existing conventions (`docs/developer/testing.md`, `src/test/*` helpers) — this spec pins **what each test proves**, not how it's wired.

**Run commands:**

- TypeScript (scoped): `npx vitest run src/features/cloud-session src/features/canvass src/lib/supabase`
- Rust: `cd src-tauri && cargo test -p secure-vault`
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
| `src/features/canvass/__tests__/realtime.test.ts`                      | 2.3   | NEW       |
| `src/features/canvass/__tests__/canvass-store.test.ts`                 | 2.4   | NEW       |
| `src/features/canvass/__tests__/LocationCard.test.tsx`                 | 2.4   | NEW       |
| `src/store/health-store.test.ts` (next-to-store, `ui-store.test.ts` precedent) | 2.5, 6.2 | NEW (6.2 additions) |
| `src/features/preferences/__tests__/preferences-additions.test.tsx`    | 3.1   | NEW (the preferences feature currently has no tests) |
| `src/features/canvass/__tests__/MapCanvas.test.tsx`                    | 3.2   | NEW       |
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
| `src/lib/commands/commands.test.ts`                                    | 5.3   | additions |
| `src/features/cloud-session/__tests__/idleLock.test.tsx`               | 6.1   | NEW       |

No existing test file is deleted or rewritten. One existing file receives **additions** only (`src/lib/commands/commands.test.ts`). Before Phase 1.4 removes the sidebar panels, audit existing component/hook tests for assertions pinned to that layout and re-home them in the same commit — nothing pinned may silently disappear.

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
| 13  | Should write the vault through the storage adapter                          | `setItem` forwards value to `vaultSet`                                   |
| 14  | Should treat vault command failure as absent session, not a crash           | command error ⇒ `getItem` resolves `null`                                |
| 15  | Should sign in and persist the session via the adapter                      | after `signIn`, session lands in vault storage                           |
| 16  | Should surface bad credentials as a typed sign-in failure                   | auth error message reaches the caller; no session stored                 |
| 17  | Should pass the schema gate when `schema_version == 1`                      | `checkSchemaGate()` ⇒ `'ok'`                                             |
| 18  | Should fail the schema gate on any other version                            | version 2 / missing row ⇒ `'mismatch'`                                   |
| 19  | Should clear vault and client state on sign-out                             | `signOut()` ⇒ vault cleared + subsequent `getSupabase` re-init required  |

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
| 40  | Should keep DVR credentials present on the view-model                       | `dvrUsername`/`dvrPassword` pass through unmasked (AD6 renders)  |

## Phase 2.2 — queries

| #   | Test Description                                                        | Key Assertion                                            |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| 41  | Should fetch cases via the service into `['cases']`                     | hook resolves mapped visible cases                       |
| 42  | Should fetch locations keyed by case                                    | `['locations', caseId]` key; only that case's rows       |
| 43  | Should fetch media keyed by case                                        | `['media', caseId]` key                                  |
| 44  | Should exclude soft-deleted rows end-to-end                             | seeded soft-deleted location absent from hook data       |
| 45  | Should report query failure to health                                   | service throw ⇒ `recordFetchError` called + hook error   |

## Phase 2.3 — realtime

| #   | Test Description                                                             | Key Assertion                                                     |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 46  | Should subscribe to `agency:activity` as a private channel                    | channel name + `{ config: { private: true } }`                    |
| 47  | Should decode the broadcast_changes payload shape                             | `{operation, table, record, old_record}` ⇒ typed `ActivityEvent` (shape pinned against a live capture in M2) |
| 48  | Should dispatch only events matching the subscribed case_id                   | other-case record ⇒ handler not called (G6 partition rule)        |
| 49  | Should patch an UPDATE into the locations cache by id                         | `setQueryData` row replaced; no refetch issued                    |
| 50  | Should insert new rows and drop soft-deleted rows from cache                  | INSERT appends; `deleted_at` set ⇒ removed                        |
| 51  | Should ignore unknown tables/ops without throwing                             | forward-compat: unhandled payload ⇒ no-op                         |

## Phase 2.4 — canvass store + cards

| #   | Test Description                                                          | Key Assertion                                                  |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 52  | Should select a case and clear location selection                         | `selectCase` resets `selectedLocationId`                       |
| 53  | Should cap the activity ring at 200 entries                               | 201st push evicts the oldest                                   |
| 54  | Should scope activity entries to their case                               | entries carry `caseId`; other-case entries not shown           |
| 55  | Should stamp and expire attention marks                                   | stamp sets timestamp; `clearExpiredAttention(now+TTL)` removes |
| 56  | Should toggle view between map and dashboard                              | `setView` round-trips                                          |
| 57  | Should render card fields from the view-model                             | name, address, status, investigator, arrival visible           |
| 58  | Should render DVR credentials plainly when unlocked                       | username/password text present (spec §3 requirement)           |
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
| 78  | Should cache signed URLs and refresh before expiry                      | query `staleTime` < TTL; second render hits cache            |
| 79  | Should classify renderable vs non-renderable mimes                      | jpeg/png/webp/mp4 true; heic/quicktime false                 |
| 80  | Should render an image thumb for renderable images                      | `<img>` with signed URL                                      |
| 81  | Should render the fallback tile for HEIC (never a broken img)           | placeholder + open-externally affordance                     |

## Phase 4.2 — media polling + diff (G3)

| #   | Test Description                                                       | Key Assertion                                               |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| 82  | Should detect newly arrived media rows by id                           | `diffMedia(prev, next)` returns only the new visible rows   |
| 83  | Should ignore soft-deleted media in the diff                           | new row with `deleted_at` ⇒ not reported                    |
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
| 98  | Should embed the activity feed                                       | feed rendered within dashboard                    |
| 99  | Should register the three new palette commands                       | ids present in registry after init                |

## Phase 6.1 — idle lock

| #   | Test Description                                                        | Key Assertion                                       |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| 100 | Should lock after the configured idle period                            | fake timers: no activity ⇒ `locked`                 |
| 101 | Should reset the idle timer on user activity                            | activity event ⇒ timer restarts, no lock            |
| 102 | Should mask DVR credentials while locked                                | locked ⇒ masked text on card; unlocked ⇒ plain (AD6) |
| 103 | Should resume on successful re-auth and stay locked on failure          | good pw ⇒ `active`; bad pw ⇒ `locked` + inline error |

## Phase 6.2 — wake / reconnect catch-up

| #   | Test Description                                                         | Key Assertion                                              |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 104 | Should refresh the session and realtime auth on wake                     | `visible`/`online` ⇒ `refreshSession` then `setAuth` order |
| 105 | Should invalidate all case-scoped queries on catch-up                    | invalidation covers `['cases']`, `['locations', id]`, `['media', id]` |
| 106 | Should drop to signed-out when the refresh fails                         | refresh error ⇒ `signed-out` (never silently stale)        |

---

## Test Count Summary

| Phase | Tests | Phase | Tests | Phase | Tests |
| ----- | ----- | ----- | ----- | ----- | ----- |
| 1.1   | 6     | 2.5   | 5     | 4.3   | 3     |
| 1.2   | 13    | 3.1   | 2     | 5.1   | 4     |
| 1.3   | 5     | 3.2   | 2     | 5.2   | 3     |
| 1.4   | 4     | 3.3   | 5     | 5.3   | 4     |
| 2.1   | 12    | 3.4   | 2     | 6.1   | 4     |
| 2.2   | 5     | 4.1   | 5     | 6.2   | 3     |
| 2.3   | 6     | 4.2   | 4     | 6.3   | 0     |
| 2.4   | 9     |       |       |       |       |

**Total: 106** (Rust 6 · TypeScript 100) — reconciles with the Implementation Plan, Appendix C. **Rule:** if counts drift during implementation, reconcile both documents before proceeding to the next phase.
