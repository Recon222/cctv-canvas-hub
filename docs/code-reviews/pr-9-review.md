# PR 9 — Aggregate Code Review

**PR:** [#9](https://github.com/Recon222/cctv-canvas-hub/pull/9) — feat(canvass): M6 — kiosk hardening (idle lock, wake catch-up, ProcessPanel port)
**Branch:** `feature/canvas-hub-m6` → `main`
**Cut / Phase:** M6 of 7 (phases 6.1–6.4 — the last single-window milestone; four ledger items closed)
**Reviewers (fresh fan-out, all forced Opus):** rust-reviewer, typescript-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, database-reviewer (full six-lane surface)
**Date:** 2026-07-22

## Verdict

**REVISE.**

One HIGH: the idle lock — this milestone's security core — is not durable. A reload or relaunch while locked re-bootstraps straight to `active` with no re-authentication, because session state has no persistence and `useAuthBootstrap` sets `active` on a restored session with no "was locked" check. **Three lanes converged on the lock wall from different angles** (silent found the reload escape and a titlebar-coverage gap; typescript found keyboard-reachability past the pointer wall; the test lane proved no test pins lock durability at all). The wall is bypassable by pressing F5. Two MEDIUMs follow (the wall's spatial/focus coverage; an over-eager wake-time sign-out on a transient network blip), plus a cluster of LOWs. The Rust surface, type design, SYSTEM-lane error honesty, and the AD6 data-plane are all clean — the defect is the lock's *durability and coverage*, not its data behavior.

## Pre-flight gates

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 326 passed, 0 failed (41 files) |
| `npm run rust:test` | 15 passed (platform-utils 8 incl. #127–129, secure_vault 6, 1 doctest) |
| `npm run check:all` (orchestrator re-run) | green, exit 0 |
| Pre-existing failures | none |

## Reviewer verdicts at a glance

| Lane | C | H | M | L | Verdict |
| --- | --- | --- | --- | --- | --- |
| rust-reviewer | 0 | 0 | 0 | 0 | APPROVE (clean) |
| typescript-reviewer | 0 | 0 | 1 | 2 | APPROVE w/ comments |
| pr-test-analyzer | 0 | 1 | 1 | 1 | REVISE |
| silent-failure-hunter | 0 | 1 | 2 | 1 | REVISE |
| type-design-analyzer | 0 | 0 | 0 | 2 | APPROVE |
| database-reviewer | 0 | 0 | 1 | 4 | REVISE (soft) |
| **Deduped totals** | **0** | **1** | **2** | **~7** | **REVISE** |

## Findings (deduped, ranked by severity)

### CRITICAL

None.

### HIGH

**H1 — The idle lock is not durable: reload/relaunch escapes to `active` with no re-auth** _(silent-failure-hunter found it; pr-test-analyzer independently proved the coverage gap; orchestrator confirmed by direct trace)_
`src/features/cloud-session/store/session-store.ts` (no `persist` middleware — `devtools` only) · `hooks/useAuthBootstrap.ts:48` (sets `active` on restore, no locked check) · `use-keyboard-shortcuts.ts:20` (locked keydown gate `return`s without `preventDefault`)
Session state is in-memory zustand with no persistence and initial `'booting'`. While `locked`, F5/Ctrl+R (WebView2-honored, not preventDefaulted) — or ANY relaunch (crash, updater, M1 relaunch-restore, needing no keyboard) — re-inits the store to `booting`; `bootstrap()` restores the vault session and lands `active` directly. The gold overlay vanishes, the board is fully interactive, the idle timer restarts fresh — **no password entered.** The lock is documented as "a real wall (a bypass is a security lie)"; it is not persisted anywhere, so it does not survive a reload. **Orchestrator verification:** confirmed by reading `session-store.ts` (only `devtools` imported) and `useAuthBootstrap.ts:42-48` (restore → `active`, no branch on prior lock).
**Fix:** the lock must survive a reload — persist a `locked` flag (vault/config) that `bootstrap()` reads to re-enter `locked` instead of `active` when a session restores (this also closes the keyboard-free relaunch door, which intercepting F5 alone would not). Add the test arm the test lane specified: mount with a restored session while last state was `locked` → asserts the overlay renders, not the bare board (fails today; pins the fix).

### MEDIUM

**M1 — The lock overlay doesn't cover the whole window and doesn't contain interaction** _(typescript-reviewer + silent-failure-hunter, two distinct facets of one root cause; pr-test-analyzer named the matching coverage gap)_
`src/components/layout/MainWindowContent.tsx:40` (overlay is `absolute inset-0` inside the content region only) · `MainWindow.tsx:22` (TitleBar is a sibling *above* it) · direct-store controls: `NavRail.tsx:156-157`, `TitleBarContent.tsx:25,75` (toggles), `CanvassRoot.tsx` MonitorToggle + MapZoomControls
AD6's "interaction-dead" holds for every *command-dispatcher* and *global-shortcut* path (the build round gated all three known bypasses), but several controls bypass the dispatcher via direct `useUIStore`/`useCanvassStore`/map calls, and the overlay is a pointer wall over the *content region only* with no focus trap / `inert`:

- _(silent, F2)_ the **TitleBar toggles sit physically outside the overlay** — a plain mouse click on the right-panel toggle expands the ProcessPanel over the locked board and its SYSTEM tab begins polling log tail + vault status to an unauthenticated viewer.
- _(typescript)_ **no focus containment** — Tab from the password field reaches NavRail/MonitorToggle/MapZoomControls; Enter fires `setView`/toggle/zoom while "locked."

Both are limited blast radius (panel/view/zoom changes; no case-data mutation, no writes, everything already visible by owner directive), hence MEDIUM — but on a kiosk-*hardening* PR it borders HIGH. **One fix closes all of it: move the overlay up to the `MainWindow` shell (covering the titlebar) and add `inert` on the board subtree while locked** (React 19 supports the prop). Test lane: add an arm asserting a NavRail `setView` click is a no-op while locked.

**M2 — Wake catch-up signs out on a transient network blip (the inverse lie)** _(silent-failure-hunter F3 + database-reviewer F1, converging from behavior and installed-source angles)_
`src/lib/supabase/client.ts:101-104` (`ensureFreshSession`: any `refreshSession()` error → `'failed'`) · `useConnectionHealth.ts` (`'failed'` → `exitSignedOut` → `signed-out`)
On an offline/near-expiry wake (kiosk sleeps overnight; morning wake fires `visibilitychange` before wifi reconnects), `refreshSession()` fails with a network-level `AuthRetryableFetchError` → mapped to `'failed'` → forced sign-out + "session expired" toast, demanding a human + password — when the refresh token was valid and would have refreshed seconds later. This defeats M6's unattended-liveness premise. **Database-reviewer's deeper finding:** installed gotrue 2.110.7 `getSession()` *already* auto-refreshes within a 90 s margin (wider than the hand-rolled 60 s), so the explicit `refreshSession()` branch is redundant in the common path and only fires in gotrue's proactive-preserve edge — where it *bypasses* the preserve fallback and converts a still-valid-token blip into a sign-out. The "avoids racing autoRefreshToken" rationale is moot (gotrue single-flights every refresh). **Fix:** reuse `authService.ts`'s existing `isNetworkAuthError` predicate — only a definite 4xx `invalid_grant` refusal forces sign-out; a network/5xx error stays locked/degraded and retries on the next tick. Or drop the explicit branch entirely and read `getSession()`'s returned `expires_at` for liveness.

### LOW (condensed)

- **L1 — `catchUp` has no in-flight/dedup guard** _(typescript)_: `online` + `visibilitychange` fire together on wake → two concurrent `catchUp`. Benign (TanStack + supabase-js both coalesce); flagged for the record.
- **L2 — `catchUp`'s broad `.catch` signs out on a post-refresh `setAuth` hiccup** _(database-reviewer F4)_: in the already-`refreshed` path, a trailing `setAuth` rejection routes to `exitSignedOut` despite a valid fresh session. Low risk (setAuth rarely rejects). Narrow the catch to the freshness result, not the whole chain.
- **L3 — `reauthenticate` misclassifies 429 as wrong password** _(database-reviewer F3)_: `isNetworkAuthError` treats only status `undefined|0|≥500` as unreachable; a 429 rate-limit is `<500` → "wrong password, retype." The D3 distinction's whole point is telling these apart — treat 429 as unreachable/third state.
- **L4 — `ProcessPanelRow.lane` is a vestigial discriminant** _(type-design)_: only `'system'` is ever constructed and nothing reads `row.lane` (ACTIVITY is a ReactNode slot). Drop or narrow to `'system'`.
- **L5 — `VaultStatus` mtime/present coupling not type-enforced** _(type-design)_: shape permits `vault_present: false` with a set mtime; the sole constructor enforces it correctly. Defense-in-depth only.
- **L6 — `ansiParser` `chunksToLines`/`parseAnsi` has no production consumer** _(typescript)_: kept alive as the vtEngine golden-parity test oracle; knip will flag it. Optionally relocate under `__tests__/`.
- **L7 — A wedged log-tail read freezes the SYSTEM log sub-lane with no staleness signal** _(silent-failure-hunter)_: `inFlight` stays true on a hung read (no Rust-side timeout); uptime/health keep ticking so the lane looks alive. Self-heals on lane toggle. Optional watchdog.
- **L8 — `vaultGet` now runs on every focus/online; transient keychain unavailability signs out** _(database-reviewer F5)_: not new behavior, but M6 amplifies exposure. Conscious trade; noted.
- **L9 — `supabase-integration.md` (new doc) two accuracy fixes** _(database-reviewer)_: the wake-catch-up description should acknowledge `getSession()` refreshes at gotrue's 90 s margin (explicit refresh is a fallback); "setAuth() with the rotated token" → "re-auths realtime via the accessToken callback" (it takes no argument).
- **L10 — Allow-list *membership* isn't pinned** _(pr-test-analyzer)_: only the blocking mechanism is; a non-window command wrongly added to `LOCKED_ALLOWED_COMMANDS` (e.g. a leaked `session-sign-out`) would pass the suite. One assertion closes it.

### D19 adjudication (the PR requested it) — **LOW / accept under V1 posture**

Both silent-failure-hunter and database-reviewer independently concur: **not a silent failure.** A revoked-but-unexpired stateless JWT keeps REST (PostgREST validates signature + `exp` locally) and realtime (rides the embedded token) working until `exp` (≤~1 h); no admin path (`signOut global`, user deletion, `banned_until`) pushes an immediate socket disconnect. But the board's liveness claim stays *true* — the data is genuinely current — and a fully-revoked session self-corrects honestly at the next refresh (the D3 signed-out path). Accept as a documented tradeoff. **Database-reviewer surfaced the one genuinely-silent sub-case to record:** agency *membership* revoked mid-session while the JWT stays valid → REST reconcile returns `ok`+empty, realtime stays subscribed delivering nothing → green dot over an empty board, same ≤1 h bound. Inherent to stateless-JWT + agency-wide reads; **not introduced or worsened by M6.** Keep D19 with the bound recorded as "≤ access-token TTL" and the RLS-narrowing sub-case noted; the only faster-revocation lever is a shorter server-side access-token TTL, not client code.

## Architecture invariants checked & confirmed

- **Rust diagnostics surface is clean** (rust-reviewer, zero findings): `read_log_tail` failures are distinct `Err`s at every step (never empty-as-success); the 500-line clamp precedes the 64 KB seek; `vault_status` distinguishes `NoEntry` (→ absent) from error kinds (→ Err) per the M1 fail-closed lesson; no plausible runtime hang; `str::lines()` handles `\r\n`; `tail_log`'s `partial_first_line` contract, `saturating_sub`, and lossy decode all sound; `#127–129` mutation-verified.
- **Type design sound** (type-design, 2 LOW only): `VaultStatus` keeps locked/unreachable in the Err channel (unrepresentable as a value); `ProbeUnreachableError` is `instanceof`-discriminated and never crosses the IPC boundary that would strip its class; `LOCKED_ALLOWED_COMMANDS` fails closed on a typo; `usePanelPosture` makes the illegal override state unrepresentable; the ported vtEngine/ansiParser/ansiSgr came through conformed — no `any`s or loose index signatures.
- **AD6 data-plane untouched** (database-reviewer): `useIdleLock` calls only `useSessionStore.lock()`, a pure `active→locked` flip — no channel/query teardown; `useConnectionHealth` has zero session-gating, so interval/listeners/`reevaluate`/`catchUp` all keep running under lock; queries gate on `active||locked`. The locked board keeps flowing exactly as designed; the M2-CRITICAL realtime lifecycle is not touched.
- **Wake choreography is functionally correct** (database-reviewer): every wake ends with a fresh session + re-authed socket; a genuinely dead session exits honestly. M2's redundancy (the explicit refresh, the explicit `setAuth`) is inefficiency, not breakage. Vault wake-read has no `-user` sibling-key pitfall (no `userStorage` configured).
- **SYSTEM-lane error honesty solid** (silent-failure-hunter): `vault_status` Err → explicit error row (never all-false); `read_log_tail` Err → honest "failed to open the app log" (never fake-empty); the idle-timer event set is user-input only (no synthetic source resets it forever).
- **AD11 boundary holds** (typescript + type-design): production `process-panel` imports nothing from `canvass`; the ACTIVITY lane is a `ReactNode` slot composed at the mount site. The export cut (`0b6ef1a`) is genuinely consumer-free; the lane renders through `vtEngine→TextLane`.
- **Every claimed test pin holds under mutation** (pr-test-analyzer, 9-mutation program): AD6 gate (both arms), the idle clamp (0-minute floor holds), #102, the 6.2 fresh-vs-near-expiry AND the `refreshSession→setAuth` ordering (mutation 4b reds on swap), posture manual-wins precedence, Rust #127/#128. No false-coverage among the claimed pins. Flake 0/10 on both timer-heavy files.
- **Counts reconcile at runtime**: 326/41 vitest + 15 cargo (8+6+1); ported ANSI/VT suites are real, unskipped, and conform to local conventions. (The Appendix-C ≡ doc-03 ≡ rows *textual* equivalence was explicitly left to a docs pass by the test lane — the one arithmetic leg not audited here.)

## Recommended next steps

1. **H1 (the REVISE gate)** — persist the `locked` state so bootstrap re-enters `locked` on restore; add the reload-durability test arm. Do NOT ship the F5-intercept-only variant — it misses the keyboard-free relaunch door.
2. **M1** — move the overlay to the `MainWindow` shell + `inert` the board subtree while locked (closes both the titlebar-coverage and keyboard-reachability facets); add the direct-store-control inert test arm.
3. **M2** — reuse `isNetworkAuthError` in `ensureFreshSession` (or drop the redundant explicit refresh); only `invalid_grant` forces sign-out.
4. **LOWs** — L3 (429) and L10 (allow-list membership) are cheap and worth folding into the fix round; L9 (doc fixes) rides along; L1/L2/L4–L8 are defer-with-ledger candidates. **D19** — keep the ledger row with the recorded bound + the RLS-narrowing sub-case (no code change).
5. Fix round → mapping comment → `--fix-delta` before merge (standing rule). Note: the security-sensitive fixes (H1, M1, M2) each warrant their own test arm, all specified above.

## Agent IDs

<!-- Used by /react-tauri-rust-code-review --fix-delta to resume reviewers via SendMessage. Names are session-scoped: resumable by name within the originating session; a new session must fresh-dispatch. -->

- rust-reviewer: `pr9-rust`
- typescript-reviewer: `pr9-ts`
- pr-test-analyzer: `pr9-tests`
- silent-failure-hunter: `pr9-silent`
- type-design-analyzer: `pr9-types`
- database-reviewer: `pr9-db`

## Reviewer pipeline notes

- **Three-lane convergence on the lock wall is the strongest signal this review produced** — and each lane found a *different facet*: silent the reload escape (H1) + the titlebar-coverage gap (M1a), typescript the keyboard-reachability past the pointer wall (M1b), the test lane the total absence of durability/direct-control coverage. None is a duplicate; together they show the wall is incomplete along every axis (temporal: reload; spatial: titlebar; input: keyboard; and untested). The dispatcher gate the build round shipped is correct — it just isn't the whole wall.
- **The wake-blip MEDIUM (M2) is a genuine two-lane dedupe** where the second lane made it sharper: silent found the inverse-lie behavior; database traced it to installed gotrue and showed the explicit refresh is *redundant* as well as harmful — the fix framing shifted from "add a distinction" to "delete the branch or add the distinction."
- **Database-reviewer's D19 work is the model for an adjudication finding**: it verified the factual claim against installed realtime-js/gotrue (which revocation paths cut the socket — none), hunted the genuinely-silent variant (RLS-narrowing), and returned a severity with the lever named. Both silent and db reached LOW/accept independently.
- The Rust and type-design lanes staying clean/LOW while the security lanes found the HIGH is the right shape: the *mechanism* code (log tail, vault probe, types) is tight; the *composition* (where the overlay sits, whether state persists) is where the defect lives — exactly the seam a per-file review misses and a whole-flow review catches.
- Six of six lanes needed the idle-without-report nudge; recovery-by-name held at 100%.
