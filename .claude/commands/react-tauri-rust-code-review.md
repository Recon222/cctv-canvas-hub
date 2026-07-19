---
description: Multi-agent review of a code PR (typescript + rust + tests + silent-failure + type-design, strict decision). Two modes — initial (fresh agents, parallel fan-out) and fix-delta (resume previous reviewers via stored agent IDs).
argument-hint: [pr-number | pr-url | blank for current branch PR] [--fix-delta]
---

# /react-tauri-rust-code-review

Comprehensive multi-agent review of a code PR. Modeled on `/react-tauri-rust-plan-review` but tuned for *implemented code* rather than planning docs. Auto-skips lanes based on file types in the diff (e.g., no `.rs` changes → skip `rust-reviewer`).

**Input**: $ARGUMENTS

---

## When to Use

Run this when a PR contains code changes (Rust and/or TypeScript) and you want a structured, multi-perspective review with explicit decision (BLOCK / REVISE / APPROVE). Catches type lies, silent failures, panic surfaces, test gaps, and convention drift while they're still cheap to fix.

Do **not** use this for planning PRs — use `/react-tauri-rust-plan-review` instead. Those PRs contain prose, not implementation; the agents in this command are tuned for code.

---

## Mode Selection

| Input | Mode |
|---|---|
| Number (e.g. `57`) | **Initial — PR mode**: `gh pr view <n>`, fresh agents, parallel fan-out |
| URL (`github.com/.../pull/57`) | **Initial — PR mode**: extract number |
| Blank | **Initial — Current branch PR mode**: `gh pr list --head $(git branch --show-current)` |
| Any of the above + `--fix-delta` | **Fix-delta mode**: read `docs/code-reviews/pr-<n>-review.md`, extract stored agent IDs, resume each via `SendMessage`, scope each to their own findings |

**Fix-delta requires the original review doc to exist.** If `docs/code-reviews/pr-<n>-review.md` is missing or has no `## Agent IDs` section, abort with an instruction to run the initial review first.

---

## Phase 1 — FETCH

```bash
gh pr view <NUMBER> --json number,title,body,author,baseRefName,headRefName,changedFiles,additions,deletions,files
gh pr diff <NUMBER> --name-only
```

If the PR is not found, stop with error.

### Sanity gate

If the PR contains **only** planning artifacts (`docs/**/*.md` with no `.ts`/`.tsx`/`.rs`/`.js` siblings), abort with: "This PR has no code changes. Use `/react-tauri-rust-plan-review` instead."

If the PR is a mix of code and planning docs, that's fine — the agents will scope themselves to the production code surface and ignore the docs.

---

## Phase 2 — TRIAGE

Classify every changed file into a lane. Decide which reviewer agents to dispatch:

| File pattern | Lane | Agent |
|---|---|---|
| `*.rs` | Rust | `rust-reviewer` |
| `*.ts`, `*.tsx`, `*.js`, `*.jsx` (production code) | TypeScript | `typescript-reviewer` |
| `**/__tests__/*.ts`, `**/__tests__/*.tsx`, `src-tauri/tests/*.rs` | Tests | `pr-test-analyzer` |
| `*.sql`, or a TS file with Supabase data access (`.from(` / `.rpc(` / `.channel(` / realtime / RLS) | Data layer | `database-reviewer` |
| Auto-generated (e.g. `src/lib/bindings.ts`) | Skip (orchestrator confirms structural correctness only) |

**Always dispatched** (regardless of file types):
- `silent-failure-hunter` (Rust + TS — errors swallowed anywhere)
- `type-design-analyzer` (Rust + TS — type design across both languages)

**Conditionally dispatched** based on changed-file categories:
- `rust-reviewer` — only if at least one `*.rs` file changed (excluding `src-tauri/tests/**` which is the test lane's responsibility)
- `typescript-reviewer` — only if at least one production `*.ts` / `*.tsx` file changed (excluding `__tests__/**`)
- `pr-test-analyzer` — only if any test file changed OR any non-trivial production code landed without tests
- `database-reviewer` — only if a `.sql` file changed OR a changed TS file contains Supabase data access (`.from(` / `.rpc(` / `.channel(` / realtime subscriptions / RLS-relevant queries). Reviews query / RLS / realtime correctness against the pinned §3 cloud contract; raises a schema/migration finding only if the PR actually changes the schema (the hub consumes a fixed contract)

**Never dispatched by default** (opt-in via future flags):
- `code-simplifier` — too noisy on feature-work PRs (suggests collapsing intentional slice boundaries)
- `comment-analyzer` — better as a periodic sweep than per-PR
- `security-reviewer` — opt-in only; many features deliberately accept trust boundaries that a generic security reviewer would loud-alarm on

Record the lane decision; report it in the final artifact under "Reviewer lanes."

---

## Phase 3 — PRE-FLIGHT

Run the gates that make sense for the file types changed. Surface pass/fail status as **context** for the reviewers — don't abort the review on infra failures unless tests genuinely don't run. The reviewers can evaluate whether a pre-existing failure is in their scope.

### Rust pre-flight (if any `*.rs` changed)

Use the project's documented test pattern (`docs/developer/testing.md`): pure logic lives in Tauri-free workspace crates under `src-tauri/crates/`, and bare `cargo test` covers them via `[workspace] default-members`. The app crate's own harness is disabled (`[lib] test = false`), so inline `#[cfg(test)]` in `src-tauri/src/` will **not** run — don't expect it to. Run:

```bash
npm run rust:test   # = cd src-tauri && cargo test (workspace crates included)
```

Optional advisory (do not block):
```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

Filter clippy/fmt output to flag findings *new to this PR* (vs pre-existing repo debt) so the `rust-reviewer` doesn't waste a finding on repo-wide warnings.

### TypeScript pre-flight (if any `*.ts` / `*.tsx` changed)
```bash
npx vitest run <changed-test-paths> --reporter=default
npx tsc --noEmit 2>&1 | grep -E "<changed-feature-path>" | head -20
```

Record the count of pre-existing failures unrelated to this PR so the test-analyzer doesn't flag them.

### Pre-flight status payload

Each agent receives a short pre-flight summary:
- `cargo test`: pass/fail counts + any new-to-this-PR findings
- `vitest`: pass/fail counts, separating in-scope failures from pre-existing repo drift
- `tsc --noEmit`: any errors *on the changed surface only*

---

## Phase 4 — DISPATCH (initial mode)

**Send all dispatched agents in a single message with multiple `Agent` tool calls** so they run concurrently. Each agent gets:

1. The list of changed files in their lane
2. A pointer to project rules (`AGENTS.md`, `CLAUDE.md`, `docs/developer/`)
3. The pre-flight status payload
4. PR metadata (number, title, cut/phase context if known from PR description)
5. **Cut/phase boundary briefing** (if applicable): which features are intentionally absent from this PR because they belong to a later cut. This prevents reviewers from flagging "missing UI" or "missing module X" when those land in a later cut. Skip if the PR is a single-cut deliverable.
6. **For language-specialist lanes**: explicit out-of-scope tag for files in other lanes (TS reviewer doesn't review `.rs`, Rust reviewer doesn't review `.ts`)

### Capturing agent IDs for fix-delta

The `Agent` tool returns an `agentId` in its result (visible in the tool output as `agentId: <hex>`). **Capture every agent's ID** and write them into the artifact under `## Agent IDs` so the fix-delta mode can resume them.

If the harness doesn't expose `agentId` for any reason, omit the section and the fix-delta mode will fall back to fresh dispatch.

### Lane briefings

Each agent already carries its full persona via its `.claude/agents/<name>.md` file. The dispatch prompt should be terse:

```
Code review for PR #<N> — <title>.

<cut/phase context line if applicable, otherwise omit>
<one-line out-of-scope note: what's intentionally NOT in this PR>

## Files in your lane
<list of files relevant to this reviewer>

## Out of your lane (other agents handle)
<short list>

## Pre-flight status
<the pre-flight payload from Phase 3>

## Project conventions to load
AGENTS.md, CLAUDE.md, docs/developer/, plus the feature-specific architecture doc if one exists.

Begin. Follow your persona's discipline (Pre-Report Gate, HIGH/CRITICAL proof, zero-findings-is-valid).
```

**Do not run agents sequentially.** The whole point of the fan-out is parallel execution. One message, N `Agent` blocks.

---

## Phase 4-alt — DISPATCH (fix-delta mode)

In fix-delta mode, **skip Phase 4's `Agent` dispatch entirely**. Instead:

1. Read the original review at `docs/code-reviews/pr-<n>-review.md`.
2. Extract agent IDs from the `## Agent IDs` section.
3. For each agent, identify which of their original findings have fix commits.
4. Identify any of their findings that were deferred via a tracking doc (e.g. `docs/working/plans/.../deferred-review-items.md`).
5. **`SendMessage` each agent in parallel** (single message, multiple `SendMessage` blocks) with a focused fix-delta brief:

```
Fix-delta review for PR #<N>.

The implementer landed <N> commits since your initial <VERDICT>. You
raised <N> findings (<breakdown>). <M> have direct fixes; <K> were
deferred to a tracking doc.

## Pre-flight status (already verified by orchestrator)
<cargo test / vitest / tsc counts>

## Your original findings → fix commits
| Finding | Severity | Fix commit | Type |
|---|---|---|---|
<table mapping each of THIS AGENT'S findings to its fix commit SHA, or to "DEFERRED">

## Out of your lane (other agents handle)
<short list of commits handled by other agents>

## What to verify
<per-finding checklist of what to confirm closed / regressed / deferred-justified>

## Deferral assessment (if applicable)
Read the deferral doc at <path>. Assess: cited by ID? specific
rationale? concrete un-defer trigger? Vague deferral → MEDIUM
finding. Specific deferral with trigger → justified.

## Discipline (unchanged)
Pre-Report Gate. HIGH/CRITICAL require proof. Zero findings is valid.

## Output format
Same as initial review. Title it "## <Lane> Reviewer Summary (Fix
Delta)". Per-finding status (closed / regressed / deferral-justified /
new). Summary table + verdict at end.

Begin.
```

If a fix commit touches multiple agents' findings, each agent gets the same SHA referenced in their brief — that's expected (e.g., one commit might close M1 from test-analyzer AND L1 from silent-failure-hunter; the diff is the same but each reviewer evaluates from their own lens).

Resumed-agent context preservation is reliable when validated. Each agent should reference its own original finding wording verbatim.

---

## Phase 5 — AGGREGATE

Once all agents return:

1. **Dedupe** — When two agents independently identify the same root cause from different angles (e.g., typescript-reviewer catches the tsc error; type-design-analyzer catches the design flaw), merge them into one finding and note both perspectives. Cross-lane independent identification is a strong signal — call it out in the artifact's "Pipeline notes" section.
2. **Surface conflicts** — If two agents take opposing positions on the same code, surface that as a top-of-report "Disputed" section. Conflicts are higher-priority than agreed findings.
3. **Rank by severity** — Within each severity, order by file path then line.
4. **Tally** — Count findings per severity per agent for the summary table.

---

## Phase 6 — DECIDE (strict mode)

| Condition | Decision |
|---|---|
| Any CRITICAL findings | **BLOCK** — must revise before merge |
| Any HIGH findings (no CRITICAL) | **REVISE** — address before merge |
| Only MEDIUM / LOW findings | **APPROVE** with comments |
| Zero findings from all agents | **APPROVE** (a clean review is valid) |

The strict rule is deliberate: a HIGH finding under "REVISE" is the cheap version of a production bug.

**Special cases:**
- Draft PR → still issue the decision; soften the framing
- Conflicts between agents → escalate to at least REVISE regardless of individual severities
- Fix-delta with a single new finding from one lane → REVISE on that lane's verdict; the other lanes' APPROVE stands

---

## Phase 7 — REPORT

### Initial mode

Write to `docs/code-reviews/pr-<NUMBER>-review.md`. Create the directory if it doesn't exist.

```markdown
# PR <N> — Aggregate Code Review

**PR:** [#<N>](<URL>) — <title>
**Branch:** <head> → <base>
**Cut / Phase:** <N of M, if applicable>
**Reviewers (fresh fan-out):** <list of dispatched agents>
**Date:** <YYYY-MM-DD>

## Verdict
**<BLOCK | REVISE | APPROVE>.**

<2-3 sentences. Lead with the decision rationale.>

## Pre-flight gates
<table: gate / result>

## Reviewer verdicts at a glance
<table: agent / C / H / M / L / verdict>

## Findings (deduped, ranked by severity)

### CRITICAL
<list, or "None.">

### HIGH
<list, or "None.">

### MEDIUM
<list, or "None.">

### LOW
<list, or "None.">

## Architecture invariants checked & confirmed
<bullet list of positive confirmations from the reviewers — what's working well, not findings>

## Recommended next steps
<contextual suggestions based on decision>

## Agent IDs
<!-- Used by /react-tauri-rust-code-review --fix-delta to resume reviewers via SendMessage. -->
- rust-reviewer: <agentId or "not dispatched">
- typescript-reviewer: <agentId or "not dispatched">
- pr-test-analyzer: <agentId or "not dispatched">
- silent-failure-hunter: <agentId or "not dispatched">
- type-design-analyzer: <agentId or "not dispatched">
- database-reviewer: <agentId or "not dispatched">

## Reviewer pipeline notes (optional)
<observations about the review process itself — cross-lane dedupes, lane coverage gaps, etc. Skip if uninteresting.>
```

### Fix-delta mode

Write to `docs/code-reviews/pr-<NUMBER>-fixes-review.md` (separate file — does NOT overwrite the initial review). Self-contained so the implementing instance doesn't need to reread the original.

```markdown
# PR <N> — Fix Delta Review

**PR:** [#<N>](<URL>) — <title>
**Scope:** Fix delta only — re-review of the <N> commits landed in response to the initial review (`pr-<N>-review.md`).
**Reviewers (resumed via SendMessage, full transcript context):** <list>
**Date:** <YYYY-MM-DD>

> **For the implementing instance:** This document is self-contained. You do not need to reread `pr-<N>-review.md`.

## Verdict
**<BLOCK | REVISE | APPROVE>.**

## Pre-flight gates (re-verified after fixes)
<table>

## Fix commit → original finding mapping
<table: commit SHA / original finding / type of fix / verdict>

## Reviewer verdicts at a glance (fix delta)
<table>

## Closed findings — verification detail
<per-finding detail of what was verified>

## Deferral justifications — verification detail
<per-deferral assessment against the rubric (cited by ID, specific rationale, concrete trigger)>

## New findings introduced by the fixes (if any)
<rare, but possible — fix commit M3 might introduce a regression>

## Architecture invariants — re-verified clean
<bullet list>

## Recommended next steps
<typically "ready for merge" if APPROVE, or "single mechanical commit" if REVISE>

## Reviewer pipeline notes
<observations — esp. cross-lane re-verification, deferral rubric application, resume vs fresh-dispatch performance>
```

---

## Phase 8 — OUTPUT

Report back to the user (terminal turn, not just the artifact):

### Initial mode
```
PR #<N>: <TITLE>
Decision: <BLOCK | REVISE | APPROVE>

Findings: <C> critical · <H> high · <M> medium · <L> low
Lanes dispatched: <list>
Conflicts: <count> disputed

Artifact: docs/code-reviews/pr-<N>-review.md

Top <3> things to address:
  1. <highest-impact finding — file:line + 1-line fix>
  2. <next>
  3. <next>
```

### Fix-delta mode
```
PR #<N>: <TITLE> — Fix Delta
Decision: <BLOCK | REVISE | APPROVE>

Closed: <count> / <original-count>
Deferral-justified: <count>
New findings: <count>

Artifact: docs/code-reviews/pr-<N>-fixes-review.md

<one-line state of the PR — "ready for merge" or "single mechanical commit needed">
```

Keep the terminal output tight — full detail is in the artifact.

---

## Edge Cases

- **No `gh` CLI**: PR mode falls back to instructing the user to check out the branch locally and re-run after `git fetch`.
- **PR contains only planning docs**: Stop. Suggest `/react-tauri-rust-plan-review`.
- **PR contains only auto-generated files** (e.g. `src/lib/bindings.ts`): Stop. Auto-generated files don't need review.
- **No `docs/code-reviews/`**: Create on first run.
- **Agents return errors**: Continue with the agents that succeeded; surface the failure in the report's summary table (mark the lane "not dispatched" or "errored").
- **Fix-delta with no agent IDs in the original review**: Fall back to fresh dispatch and warn the user that context will be re-derived (slower, possibly different verdict).
- **Fix-delta finds new HIGH findings introduced by the fixes**: Verdict goes back to REVISE; the original review's verdict was right but the fixes regressed. Don't paper over.
- **Cross-lane independent identification of the same root cause**: Treat as a strong signal — note it in the Pipeline notes section. Dedupe into one finding but credit both lanes.
- **Mid-cut PR**: Brief each agent with the cut boundary so they don't flag intentional absences.

---

## Confidence Rule (inherited from the persona files)

Every agent dispatched by this command runs with:
- Confidence ≥ 80% before reporting
- Pre-Report Gate: cite exact file:line, name concrete failure mode, prove HIGH/CRITICAL with snippet + scenario
- Zero findings is a valid clean review

If the agents return noise, the fix is to tighten the agent persona file, not to relax the gate.

---

## Pipeline lessons

- **Fresh agents for initial reviews, resume for fix-delta.** Resume preserves context perfectly (validated: agents reference their own original wording verbatim) and runs faster than fresh dispatch.
- **Cross-lane independent identification is a strong signal.** When typescript-reviewer and type-design-analyzer both catch the same conditional-type bug from different angles, they're confirming a real issue. Surface this in the artifact's Pipeline notes.
- **Test analyzer catches false-coverage traps that no other lane sees.** Specifically: tests claiming to pin a contract but with inputs that route through a different code path. The trace-the-input discipline in the persona is load-bearing.
- **Silent-failure-hunter catches end-to-end propagation bugs that need both bindings and feature code in view.** E.g., `Promise.all` + Tauri-rethrow → stuck-forever loader. Don't skip this lane even on small PRs.
- **Skip `rust-reviewer` when no `.rs` files changed.** Skipping is correct, not under-coverage. Same for `typescript-reviewer` when no TS changes.
- **The four-question Pre-Report Gate visibly suppresses manufactured findings.** Pre-flight cargo gates that fail repo-wide should be triaged into "new to this PR" vs "pre-existing debt" before briefing the reviewers, or they'll waste a finding on noise.
