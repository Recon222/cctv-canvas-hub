# Review Pipeline Handoff — Canvas Hub

**From:** the Opus session that ran every review cycle for PRs #1–#5 (2026-07-19 → 2026-07-20). **To:** the next instance to run `/react-tauri-rust-plan-review` or `/react-tauri-rust-code-review`.

**This is the review seat, not the authoring seat.** The companion doc — `docs/plans/canvas-hub/orchestrator-handoff.md` — hands over the seat that *builds*. Read it first for project state; it is accurate as of the PR #5 merge. This doc covers the thing it can't: what the review orchestrator knows after six cycles that the command file doesn't say.

You are invoked fresh by Kris in a separate terminal, hand back an artifact path, and disappear. Nothing carries over between runs except these committed artifacts. Read `docs/plan-reviews/` and `docs/code-reviews/` for precedent before your first dispatch — the aggregate reports are written to be read cold.

## 1. Track record (calibrate against this)

| PR | Kind | Initial | Rounds | Final |
| --- | --- | --- | --- | --- |
| #1 | Plan (base set) | REVISE — 3 H, 15 M, 7 L | 1 | APPROVE |
| #2 | Code (M1) | REVISE — 2 H, 3 M, 4 L | 1 | APPROVE |
| #3 | Plan (A1) | REVISE — 5 H, 9 M, 6 L | 1 | APPROVE |
| #4 | Code (M2) | **BLOCK** — 1 C, 6 H, 13 M, 11 L | 2 | APPROVE |
| #5 | Plan (A2) | REVISE — 10 H, 15 M, 8 L | 2 | APPROVE |

Every initial review found something real; **every fix round introduced at least one new finding**, three times a HIGH. That is the argument for `--fix-delta` being mandatory, not optional. Current state: **zero open findings**.

The defects that mattered most, and how each was found:

- **PR #4 CRITICAL** — a case switch permanently killed realtime for the session. Found by *reading installed `realtime-js` and phoenix* and tracing the cleanup/setup sequence. Three lanes converged on it from different angles.
- **PR #2 HIGH** — sign-out nulled the client singleton, so the next in-process sign-in threw. Found by the database lane; the test lane independently found the *mocked* test that hid it.
- **PR #5 HIGH (both rounds)** — the ProcessPanel port wasn't executable. Found by *opening the external source tree* the plan referenced. The fix round then claimed "verified against the actual source tree"; re-opening it showed 9 of 11 retained files still broken. **A fix-delta that only re-reads the diff would have closed that.**
- **PR #4 round-2 MEDIUM** — the cadence fix was revertible with a green suite. Found by *mutation*: set the constant back, run, watch nothing fail.

## 2. Which lanes to dispatch

**Code PRs** (`/react-tauri-rust-code-review`): always `silent-failure-hunter` + `type-design-analyzer`. Then `rust-reviewer` iff `.rs` changed, `typescript-reviewer` iff production TS changed, `pr-test-analyzer` iff tests changed or non-trivial code landed without them, `database-reviewer` iff `.sql` changed or a TS file touches Supabase (`.from(`/`.rpc(`/`.channel(`/realtime). Skipping a lane with no surface is correct coverage, not a gap — PR #4 had no Rust and the Rust lane sat out.

**Plan PRs** (`/react-tauri-rust-plan-review`): always architect + quality + reality. Add the proposal lanes when the plan proposes that language's design — all three fired on A1 and A2.

**The sanity gate is real.** PR #5 was seven `.md` files; the code-review command aborts on that and points at the plan review. If Kris asks for "the review on N", check the file types before choosing the command.

**What each lane actually earns:**

| Lane | What it uniquely catches |
| --- | --- |
| database-reviewer | Library-behavior defects. Reads installed sources by habit. Found the CRITICAL, the anon-REST HIGH, the GoTrue `-user` key. The strongest lane on this project. |
| pr-test-analyzer | False coverage — tests that pass for the wrong reason, and flaky tests inspection can't see. Mutation-tests its own claims. |
| typescript-reviewer | React/async semantics, and it will open external references the plan cites. |
| silent-failure-hunter | Failures that are invisible at runtime. On this product ("Honest Liveness") it is load-bearing — brief it with the product promise, not just the file list. |
| type-design-analyzer | Illegal states, and it *probes* — applies a candidate fix, runs tsc, reverts. Quiet lane, high precision. |
| plan-reality-checker | Planner hallucination. Reports an N/M grounding stat that is the single best confidence signal in a plan review. |
| plan-quality-checker | Count reconciliation and cross-doc drift. Recount every total yourself through it; it caught the file-manifest count wrong three times running. |
| plan-architect-reviewer | Whether decisions cohere with what the codebase already decided. Caught that A2 revived a slot AD9 had emptied *using spec §4's own words*. |

## 3. Briefing — the highest-leverage thing you do

The persona files carry the discipline. Your brief carries **scope, context, and the sharp questions**. Read the diff yourself before dispatching and seed specific doubts. Several of the best findings in the table above started as a question I planted:

- "Cross-check 7.2B against AD6 — the locked state's contract says data keeps flowing, but this emits `session-ended` on lock and the headline use case is the map on a wall TV." → became a HIGH.
- "As specified, how do the secondary's REST queries get the user JWT? The signature is a signature, not a mechanism." → became the anon-REST HIGH.
- "Don't take the mutation claims on faith — re-run them yourself." → the test lane found a *new* flaky test at 3/90.

Every brief must include:

1. **Scope fence.** For amendments and fix-deltas: "review ONLY the delta; everything else is reviewed baseline — read for context, don't re-review." Without this they re-litigate merged work and the signal drops.
2. **Cut/milestone boundary.** What is *deliberately* absent because it lands later. Prevents "missing X" findings on a plan that schedules X.
3. **Deliberate choices — don't re-flag.** DVR credentials render in clear (product requirement, spec §3/§7). Agency-wide reads are the V1 posture. Idle lock alters no content. Without this section you get the same three non-findings every round.
4. **Pre-flight payload** (code PRs): actual test/tsc/gate numbers, run by you, with pre-existing failures separated from new ones.
5. **The out-of-lane list**, so lanes don't duplicate.
6. **Ground truth for as-built claims.** When a plan documents shipped code, say so explicitly and point at the files — otherwise lanes review the code instead of the description.

## 4. Verification disciplines that produced the findings

Push these in briefs; they are what separates this pipeline from a careful read.

- **Read installed sources.** `node_modules/@supabase/*`, `@tanstack/query-core`, phoenix. Documented behavior and actual behavior diverged on this project repeatedly — the supabase-js storage layer surprised us three separate times.
- **Mutate to prove a test.** Break the production line, run, confirm red, revert. A claim that a test pins something is unverified until this is done.
- **Measure flake, don't infer it.** The pattern: ~90 scoped runs in background batches. Two flaky tests died this way; both would have passed inspection. Note the *scoped* command can surface what the full suite hides.
- **Probe a proposed type fix** before recommending it — apply, tsc, revert.
- **Open external references.** If a plan cites a path outside the repo, the lane reviewing that plan should look at it. Twice decisive on PR #5.

## 5. Agent mechanics (learned the hard way)

- **Agents do not survive across sessions.** The A1 reviewers were unreachable when A2 arrived — `SendMessage` returned "no agent named X is reachable". Fresh dispatch works fine; write self-contained briefs and never assume resume.
- **Within a session, resume for fix-deltas.** It preserves context perfectly — lanes quote their own original wording verbatim — and is faster than re-deriving.
- **Force `model: "opus"` on every review lane.** Kris's standing instruction; inheritance is not reliable.
- **Naming lanes made the recovery pattern possible.** Lanes frequently go idle *without* delivering a report; `SendMessage` to the name asking for the full text always worked. Expect this on roughly half of all dispatches — it is not a failure, just a handshake. (Note the memory file says "never name agents"; that rule is about *implementation* agents. Confirm Kris's preference for review lanes if it comes up.)
- **Dispatch all lanes in one message.** Parallel is the whole point.
- **Never fabricate a pending lane's result.** If Kris asks before a report lands, say it's still running.

## 6. Aggregating

- **Dedupe by root cause, keep the highest severity, credit every lane.** ~50 raw findings → ~33 deduped is typical.
- **Cross-lane convergence is the strongest signal you have.** Three lanes reaching the same defect from different angles has never been wrong here. Call it out explicitly in the artifact — it tells the implementer what to fix first.
- **Surface genuine disputes at the top.** PR #4 round 1: silent-failure called the cadence closed, database called it a residual HIGH. They were answering different questions (new dishonesty vs false-alarm arithmetic). Adjudicating produced a sharper disposition than either alone — and the losing lane's later recount discharged its own condition.
- **Strict decision rule** — any CRITICAL → BLOCK; any HIGH → REVISE; else APPROVE. Honour it, *and* say when a HIGH has no surface in the current milestone (PR #4's cadence residual rendered nowhere until M5). "REVISE, narrowly, and here's the one-line resolution" is more useful than either a soft APPROVE or a hard block.
- **Write the artifact to be read cold**, by someone who never saw the review. Every finding: file/doc + line, the concrete failure mode, the specific fix. Include a "verified clean" section — what the lanes checked and found sound is as informative as the findings, and it is what makes a later reader trust the rest.

## 7. Fix-delta discipline

The single most important rule: **do not take the fix table on faith.**

- Map each lane's own findings back to it; ask it to verify *its* items.
- Re-run pre-flight yourself before dispatching.
- Ask lanes to re-run their own proofs — re-mutate, re-measure, re-probe, re-open the external tree. On PR #5 the fix commit asserted a verification that hadn't happened, and only re-opening the source caught it.
- Expect new findings; three fix rounds here created a fresh HIGH.
- Watch for fixes that *exceed* their finding — several here volunteered extra correctness (a keychain error surfacing as an error rather than "absent"; a timestamp source clause). Note them in the artifact; they're evidence the implementer understood the finding rather than pattern-matched it.
- When lanes correct the fix commit's own claims — "`recordEvent` moved pre-filter, not post-patch, and that's the right call" — that's the pipeline working. Record it.

## 8. Known review-side failure modes

1. **Reviewing the code instead of the description** on an as-built plan amendment. Fence it in the brief.
2. **Letting the baseline get re-litigated** on a scoped review. Fence it harder than feels necessary.
3. **Accepting "N runs, 0 failures"** as proof a flake is fixed. 24 clean runs against a measured 13% rate is thin; ask for the lane's own N.
4. **Closing a finding because the commit message says so.** See §7.
5. **Missing the sanity gate** and running a code review on a docs-only PR.
6. **Under-brief → generic findings.** If a lane returns only style-level observations, the brief was thin, not the code clean.

---

**The bar you inherit:** five PRs, six review cycles, every cycle closed with evidence, zero open findings, and no defect that reached `main` and had to be found later. The pipeline's value came almost entirely from four habits — read the installed source, mutate the test, measure the flake, open the thing the doc points at. Keep those and the rest is bookkeeping.
