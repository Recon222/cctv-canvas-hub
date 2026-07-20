# PR 2 — Aggregate Code Review

**PR:** [#2](https://github.com/Recon222/cctv-canvas-hub/pull/2) — feat(cloud-session): M1 — session foundation (vault, enrollment, sign-in, schema gate)
**Branch:** feature/canvas-hub-m1 → main
**Cut / Phase:** Milestone M1 of 6 (Canvas Hub V1, plan phases 1.1–1.4)
**Reviewers (fresh fan-out, all Opus):** rust-reviewer · typescript-reviewer · pr-test-analyzer · silent-failure-hunter · type-design-analyzer · database-reviewer
**Date:** 2026-07-19

## Verdict

**REVISE.**

Two HIGH findings, no CRITICAL. The implementation quality is genuinely strong — crypto, type design, conventions, and i18n all came back clean or near-clean — but the database lane found a broken core M1 flow (in-process sign-out → sign-in throws, masked by a fully-mocked test), and the test lane found the "never infinite booting" contract has zero adversarial coverage. Both are cheap, localized fixes.

## Pre-flight gates

| Gate | Result |
|---|---|
| `cargo test` (workspace) | 12/12 pass (secure_vault 6/6 new; platform_utils 5/5 + 1 doctest pre-existing) |
| `vitest run` (full suite) | 56/56 pass, 12 files (App.test stderr menu-init noise is pre-existing env noise) |
| `tsc --noEmit` | clean (exit 0) |
| `npm run check:all` | reported green by author; eslint/ast-grep re-verified clean on changed surface by typescript-reviewer |

## Reviewer verdicts at a glance

| Agent | C | H | M | L | Verdict |
|---|---|---|---|---|---|
| rust-reviewer | 0 | 0 | 0 | 1 | APPROVE |
| typescript-reviewer | 0 | 0 | 1 | 0 | APPROVE with comments |
| pr-test-analyzer | 0 | 1 | 2 | 0 | REVISE |
| silent-failure-hunter | 0 | 0 | 1 | 1 | APPROVE with comments |
| type-design-analyzer | 0 | 0 | 0 | 0 | APPROVE (clean) |
| database-reviewer | 0 | 1 | 0 | 3 (+1 INFO) | request changes |
| **Total (after dedupe)** | **0** | **2** | **3** | **4** | **REVISE** |

Dedupe merges: probe status-0 gap (test-analyzer MEDIUM + database LOW → one MEDIUM); the sign-out defect and the mocked test that masked it (database HIGH + test-analyzer MEDIUM → one HIGH with both fixes). 11 scored raw findings → 9 after dedupe. Conflicts: none.

## Findings (deduped, ranked by severity)

### CRITICAL

None.

### HIGH

**[HIGH] Sign-out destroys the client singleton — the next in-process sign-in throws; masked by the fully-mocked test #19**
Source agents: database-reviewer (defect) + pr-test-analyzer (the masking test gap) — merged
Files: src/features/cloud-session/services/authService.ts:52 · src/lib/supabase/client.ts:48–64 · src/features/cloud-session/components/SignInScreen.tsx:24 · src/components/layout/MainWindowContent.tsx:22 · src/features/cloud-session/__tests__/authService.test.ts:130–141
Issue: `signOut()` ends with `await teardownSupabase()`, which nulls the singleton. Sign-out routes to `signed-out` (config still on disk, so SetupScreen's `initSupabase` never runs) and `useAuthBootstrap` is a mount-once effect that doesn't re-run on screen swaps — so SignInScreen's submit hits `getSupabase()` → `SupabaseNotInitializedError`, swallowed into the generic "sign-in failed" toast. In-process sign-out → sign-in only recovers via full app restart, contradicting the PR's stated M1 outcome. The suite stays green because test #19 mocks `@/lib/supabase/client` entirely — it asserts teardown was *called* but never exercises the singleton-null-then-sign-in sequence, and no test exercises the real client module.
Fix: Remove `teardownSupabase()` from `signOut()` — the project/config is unchanged and GoTrue's `auth.signOut()` already cleared the session and stopped its refresh ticker; the client is immediately reusable. Reserve teardown for genuine re-enrollment into a different project. AND add a small `client.test.ts` against the real module: `initSupabase` → `teardownSupabase` → `getSupabase()` throws `SupabaseNotInitializedError`, plus the signOut → signIn sequence staying functional.

**[HIGH] Bootstrap error paths have zero adversarial coverage — the "never infinite booting" contract is unpinned**
Source agent: pr-test-analyzer
Files: src/features/cloud-session/hooks/useAuthBootstrap.ts:29–34, 49–53 · src/features/cloud-session/__tests__/useAuthBootstrap.test.ts:36–86
Issue: The hook's two catches (config-load throw → `needs-setup`; restore/gate throw → `signed-out`) implement the plan's headline error contract, but every existing test (#20–23) uses `mockResolvedValue` — happy paths only. A refactor that breaks either catch freezes the app on the booting shell at launch (an IPC error or restore network failure is a realistic trigger) with the suite green.
Fix: Two tests — config-load-throws → store reaches `needs-setup`; restore-throws → store reaches `signed-out`.

### MEDIUM

**[MEDIUM] SchemaGateScreen's mount check can flip global state back to `active` after sign-out**
Source agent: typescript-reviewer
File: src/features/cloud-session/components/SchemaGateScreen.tsx:16–27, 39–41
Issue: The mount effect's `checkVersion` writes `useSessionStore.getState().setState('active')` after an unguarded await — a global write that survives unmount. The sign-out button is live during the initial check (`busy` false), so a sign-out that resolves first can be overridden by a late-resolving version check: the app lands on `active`/ConnectedPlaceholder with the vault cleared and (per the HIGH above) the client torn down — a "connected" shell with no session.
Fix: Guard the transition on still being gated: `if (version === APP_REQUIRED_SCHEMA_VERSION && useSessionStore.getState().state === 'schema-gate')` — or a `cancelled` ref in the effect.

**[MEDIUM] SchemaGateScreen swallows sign-out failure into a prod-noop log and proceeds as signed-out**
Source agent: silent-failure-hunter
File: src/features/cloud-session/components/SchemaGateScreen.tsx:49–58 (with src/lib/logger.ts:18)
Issue: The catch around `signOut()` logs via `logger.warn` — a no-op in production builds — then unconditionally transitions to `signed-out`. A locked/undeletable `session.vault` (Windows AV/backup lock) means the encrypted session stays on disk and auto-restores next boot, while the operator saw a clean "signed out" screen: a sign-out that lies, on a shared wall terminal. The sibling ConnectedPlaceholder handles the identical failure correctly (toast, no false transition).
Fix: Mirror ConnectedPlaceholder: `toast.error(...)` in the catch. Proceeding to `signed-out` afterward is acceptable per the no-dead-ends design; the gap is the missing user-visible signal.

**[MEDIUM] The probe's real-world "unreachable" path (resolved status 0) is untested, and its try/catch comment is wrong**
Source agents: pr-test-analyzer + database-reviewer — merged (independent cross-lane identification)
Files: src/features/cloud-session/services/configService.ts:99–112 · src/features/cloud-session/__tests__/configService.test.ts:117–150
Issue: In the installed postgrest-js 2.110.7, a fetch failure resolves as `{ error, status: 0 }` — it does not reject. Production "unreachable" therefore hits the `if (!status) throw ProbeUnreachableError` branch, never the `catch`; the `catch` is effectively dead for postgrest queries and the comment ("postgrest-js only throws when fetch itself fails outright") is inaccurate. Test #11 only exercises the synthetic reject path, so the one path real users hit is unpinned — a regression would surface network-down as "key refused."
Fix: Add a `resolves: { error, status: 0 }` → `ProbeUnreachableError` case to #11; correct the comment.

### LOW

**[LOW] `seal` maps its (unreachable) encrypt failure to `VaultError::Corrupt` — an open-side name**
Source agent: rust-reviewer
File: src-tauri/crates/secure-vault/src/lib.rs:44
Issue: `Corrupt` is documented as "sealed input malformed" (open-side); a maintainer debugging a write-path `Corrupt` would be misled. Only reachable at ~64 GiB plaintext — cosmetic.
Fix: Optional `SealFailed` variant, or leave with the existing comment.

**[LOW] The vault-read degrade path's required "loud warning" is a no-op in production**
Source agent: silent-failure-hunter
Files: src/lib/supabase/vault-storage.ts:76–84 · src/lib/logger.ts:18, 74–78
Issue: `logger.warn` is DEV-gated and `logToBackend` is commented out, so a persistent keychain fault (the fail-closed Rust path working as designed) is indistinguishable in production from a normal expired session — bounced to sign-in every launch with zero diagnostic signal. Undercuts the plan's "warns loudly" requirement; pre-existing logger limitation.
Fix: Wire warn/error through a production-surviving sink (enable `logToBackend` or a Tauri log event) for the degrade-path signals.

**[LOW, latent] Vault writes are unserialized and share one fixed temp file**
Source agent: database-reviewer
Files: src-tauri/src/features/cloud_session/services/mod.rs:32 · src/lib/supabase/vault-storage.ts:88–98
Issue: auth-js runs lockless here and the adapter adds no serialization; two overlapping `vault_set` calls share `session.vault.tmp`, and concurrent `std::fs::write` on Windows can interleave → corrupt vault → forced re-sign-in. Unreachable in M1 (writers never overlap); reachable in M6 when `reauthenticate` can race the auto-refresh ticker.
Fix: Unique temp filename per write (Rust side), or serialize vault ops in the adapter — cheap while the files are open.

**[LOW, latent] `teardownSupabase` never stops the old client's auto-refresh ticker**
Source agent: database-reviewer
File: src/lib/supabase/client.ts:55–64
Issue: The abandoned GoTrueClient's interval keeps firing; on a future in-process re-enrollment its `getSession()` can re-bind the vault adapter's `boundKey` to the old storage key, tripping the single-key loud-fail. Latent (no in-process re-enrollment flow exists yet).
Fix: `await closing.auth.stopAutoRefresh()` in teardown.

### INFO (unscored)

- Transient network error during the schema gate drops to `signed-out` rather than a retryable gate state — fail-closed and recoverable; acceptable for M1 (database-reviewer).
- `reauthenticate` collapses wrong-password and network-unreachable into `false` — no live caller in M1; fix when M2/M6 wires the unlock screen, reusing the ProbeRejected/ProbeUnreachable distinction (silent-failure-hunter).

## Architecture invariants checked & confirmed

- **Crypto (rust):** textbook AES-256-GCM — fresh 96-bit nonce per seal, `nonce‖ciphertext+tag` framing, min-frame guard before `split_at` (no panic on short input), no production unwraps.
- **Key lifecycle (rust):** `get_or_create_key` creates only on `keyring::Error::NoEntry`, fails closed otherwise; key material never reaches an error string; T3 no-log verified by grep; atomic writes mirror the accepted preferences pattern.
- **tauri-specta:** derives in convention order; commands async thin wrappers; all six registered; bindings regenerated, cross-language fidelity verified aligned (no drift, no manual TS duplicates).
- **Type design:** `SessionState` single-discriminant union with all three `setState('active')` sites gate-guarded; rejected-vs-unreachable are typed Error subclasses branched via `instanceof`; `VaultError` correctly scoped crate-internal; vault adapter structurally satisfies `SupportedStorage`.
- **Fail-closed schema gate:** `.maybeSingle()` handles the RLS-empty case as `mismatch` (no crash); NaN/non-number/missing-row all stay closed — verified against installed library sources.
- **Verifier-key fix (b18a10c):** sound — `-code-verifier` keys route to in-memory backing, never the vault; single-BLOB invariant stands loud for session-class keys; flowType defaults verified (PKCE never engages with password grant + `detectSessionInUrl: false`).
- **Conventions:** Zustand selector-only (ast-grep clean), services-own-IPC, barrel-only imports, no manual memo, i18n complete and interpolation-consistent across en/fr/ar.
- **Test hygiene:** mock seam honest (services real, only client + Tauri commands mocked); 29-new-test reconciliation (6 Rust + 23 TS, #109/R3) verified true; i18n drift detectable via real I18nextProvider.

## Recommended next steps

1. **Fix the two HIGHs** — remove `teardownSupabase()` from `signOut()` + add a real `client.test.ts` (singleton lifecycle + signOut→signIn sequence); add the two bootstrap error-path tests.
2. **One commit can clear both SchemaGateScreen MEDIUMs** (state guard on the mount check + toast in the sign-out catch) — they're adjacent lines.
3. Add the probe status-0 test case + comment fix (MEDIUM), and take the four LOWs while the files are open (unique temp filename and `stopAutoRefresh()` are one-liners).
4. Re-run with `--fix-delta`: `/react-tauri-rust-code-review 2 --fix-delta` — reviewers below resume with context intact.

## Agent IDs
<!-- Used by /react-tauri-rust-code-review --fix-delta to resume reviewers via SendMessage (address by name). -->
- rust-reviewer: rust-code
- typescript-reviewer: ts-code
- pr-test-analyzer: test-lane
- silent-failure-hunter: silent-lane
- type-design-analyzer: type-lane
- database-reviewer: db-code

## Reviewer pipeline notes

- **Cross-lane independent identification, twice.** The probe status-0 gap was found by both the test lane (missing coverage) and the database lane (dead catch + wrong comment, verified against installed postgrest-js source). And the sign-out HIGH pairs the database lane's flow defect with the test lane's independent discovery of exactly the mocked-out test (#19) that masked it. Both are strong-signal confirmations.
- **SchemaGateScreen drew two unrelated MEDIUMs** (race from ts lane, swallowed failure from silent lane) — the component's effect/handler wiring deserves focused attention in the fix commit.
- **The database lane's verify-against-installed-sources discipline paid off**: three of its findings (status-0 resolution behavior, lockless auth-js, `scope: 'global'` sign-out) rest on library source verification rather than documented defaults.
- The plan-reconciliation docs commit (04c93e3) was treated as context, not a review surface; locales/lockfiles/bindings.ts skipped as generated/mechanical.
