---
name: live-smoke-testing
description: >
  Verify a code change by driving the real running application or binary — with computer-use,
  process tooling, and the program's own logs — instead of trusting tests, benchmarks, or a
  code read. Use this whenever a claim is about RUNTIME behaviour that no unit test can reach:
  process lifetime, OS handles, event ordering, races, startup/shutdown paths, device access,
  or the performance of a shipped artifact. Reach for it during code review before you accept
  "I fixed the race" / "the graceful shutdown works" / "it's fast enough now"; before you
  approve a fix you have only read; when a benchmark number smells wrong; when a test passes
  but you cannot say what would make it fail; and any time you are about to write "verified"
  next to something you only inferred. Also use it before driving a desktop app with
  computer-use tools, so the desktop gets captured and restored properly. Triggers on: "smoke
  test", "verify it actually works", "did the fix work", "run the app and check", "reproduce
  the race", "measure the real latency", "prove the test catches it", "mutation test", "is
  this actually faster", "why is release slower than debug".
---

# Live smoke testing

Tests tell you the code does what the test says. A smoke test tells you the **program** does
what you claim. Those are different claims, and reviewers routinely conflate them.

This skill is for the second one. It is expensive, so spend it where it pays.

## When a live smoke is warranted

Reach for it when the claim is about behaviour that lives **outside** the language:

- process lifetime, zombies, orphans, Job Objects / process groups
- event ordering between threads, tasks, or processes (races)
- startup and shutdown paths (was the graceful path taken, or was it theatre?)
- OS resources: audio/video devices, file handles, sockets, ports
- the performance of the artifact **that actually ships**
- anything where a test would need the real runtime to exist

Do **not** reach for it when a unit test can answer the question. If the decision is a pure
function of its inputs, extract it and test it. A smoke test that could have been an assertion
is a slow assertion. The best review outcome is often "extract this decision into a pure
function so it carries a runnable red→green signal, then smoke only the wiring."

## The one idea

**Verify your repro can fail before you trust it passing.**

A green smoke on a scenario that cannot fail proves nothing, and it launders a guess into a
fact. This is the single most common way live testing goes wrong, and it is seductive because
the output *looks* like evidence.

So before you believe a pass:

1. Read the target's **own runtime log** to learn the actual event ordering. The ordering you
   derived from reading the source is usually wrong, and it is usually wrong in the direction
   that makes your repro impossible.
2. Break the fix — or reintroduce the bug — and confirm the harness goes **red**.
3. Only then does a green run mean anything.

If you cannot make it fail, you have not tested it. Say so, out loud, in the review.

## A/B with exactly one variable

The way to make a narrow window reproducible is to **widen it artificially and hold everything
else constant**.

```
1. Find the interleaving that the bug needs.
2. Force it — inject a sleep, a barrier, a slow path — so it happens every time.
3. Run twice, changing ONE thing: the fix.
4. Both runs, same injected delay. Only the guard differs.
```

The result is a controlled experiment. Anything else is anecdote.

Corollary: when both variants pass, suspect the harness before you conclude the bug is fake.
Something else may be closing the window (a second guard, an early return, an ordering you did
not know about) — which is worth knowing, and is itself a finding.

## Evidence hierarchy

Rank what you're about to believe. Prefer the top.

| | Evidence | Why it's strong |
|---|---|---|
| 1 | **Exit codes** | A killed process and a process that left its own loop are *different numbers*. `TerminateProcess` → non-zero; a clean self-exit → 0. One digit can prove a graceful-shutdown path really executed. No assertion can do that. |
| 2 | **The application's own log** | Redirect to a file (`app > run.log 2>&1`) and grep it. This is where the true event ordering lives. Consult it before believing any theory, including your own. |
| 3 | **External process census** | `Get-Process <name>` with `StartTime`. Start times tell you *which* instance survived, not merely how many. |
| 4 | **On-screen state, screenshotted** | Render the harness's own log into the UI, then screenshot. The screenshot is the artifact, and it doubles as footage if the user is recording. |
| 5 | Source reading | Weakest. When it's all you have, **say so** rather than dressing inference up as verification. |

A number from a build cache, a config file, or a comment is not evidence about the running
binary. Go find the thing the toolchain actually produced and observe it directly.

## Designing the probe

A probe can only reveal variation along the axis it varies.

- A **constant (DC) signal cannot reveal a time shift.** If you're testing alignment, feed a
  step or an impulse and assert the *index* of the transition.
- A **length assertion cannot reveal a phase error** if the implementation clamps its own length.
- A test that **names the mutation it catches** and does not catch it is worse than no test: it
  advertises coverage that isn't there, and the next maintainer trusts it.

Whenever you write or accept a test, ask: *what mutation is this supposed to catch?* Then apply
that mutation and watch it go red. If it stays green, the test is decoration.

## Mutation testing is how you verify a fix, not a nice-to-have

When reviewing a fix, do not accept "the tests pass." Tests passing is the state *before* the
fix too, if the tests were weak. Instead:

1. **Control first.** Mutate something the suite *should* catch. If nothing goes red, the suite
   is not wired up and every other result is meaningless.
2. Mutate the fixed logic. Expect red, and expect **exactly** the test whose name claims to
   cover it.
3. Restore, re-run, confirm green.

Do this on the real shipping code, not a copy. If the test exercises a duplicate of production
logic, that is itself the finding — the tests pin the copy, not the code.

## Harness design

- **Automate the sequence.** A human clicking takes hundreds of milliseconds; races live in
  single-digit milliseconds. If two calls must be back-to-back, put them in one handler:
  `await stop(); await start();`
- **Render the harness log on screen.** A fixed overlay with timestamps relative to mount turns
  a screenshot into evidence.
- **Know what triggers a rebuild.** A frontend-only harness hot-reloads. A change to native
  source makes the dev-server watcher rebuild and relaunch — which is exactly how to A/B a
  native-side mutation without babysitting the build.
- **Confirm the running binary contains your mutation** before drawing any conclusion. Compare
  the artifact's mtime against the source's, and grep the build log for the rebuild. Otherwise
  you are testing the previous binary and do not know it.

## Working in a tree shared with another agent or a human

If someone else has uncommitted work in the same checkout, their evening is in your hands.

- **Never** `git stash`, `checkout`, `reset`, `clean`, or `worktree`. Not even "just to look at
  main". The urge is strongest exactly when it is most destructive.
- Back up every file you touch **outside the repo**, byte-for-byte. Restore by **rewriting the
  original bytes** (`cp backup orig`) — never by a git command.
- Prefer a **new untracked file** for the harness plus the **smallest possible edit** to one
  tracked file.
- Freeze the other party first (no commits, no builds, no `git add -A`), and **re-arm any inbox
  watcher before you start**, or you will go deaf mid-run.
- Prove restoration, don't assert it: `md5sum` against the backups, `git status --porcelain`
  shows zero tracked changes, `git diff <tip>` is empty, and the suites are green again.

## Teardown checklist

1. Quit the app. On an app with a real graceful-shutdown path (sidecars, Job Objects), post
   `WM_CLOSE` (`taskkill /PID <pid>` *without* `/F`) so the quit doubles as a test of the exit
   path. **On this Tauri app that does not hold** — `WM_CLOSE` gets swallowed and the app keeps
   running, and there are no sidecars to shut down gracefully anyway. Force-kill the dev tree from
   the top instead (`taskkill //PID <npx/cli-pid> //T //F`); see `driving-agent-shell` → Teardown.
2. Process census: app, dev server, orphaned bundlers (vite). All zero.
3. Restore tracked files from byte backups; delete the temp harness.
4. `git status --porcelain` → no tracked changes. `git diff <reviewed-tip>` → empty.
5. Re-run the suites. Green.
6. Restore the desktop to its captured baseline; **screenshot to confirm**. "Restored" is a
   claim; the screenshot is the check.
7. Release the other agent with an explicit note.

## References

Read these when the situation calls for them — they are detail, not prerequisites.

- **`references/environment-traps.md`** — shell and tooling traps that return *wrong answers
  silently* rather than erroring. Read this **before** your first `tasklist`, `sleep`,
  `Get-Process`, or long-running pipe. It will save you an hour.
- **`references/desktop-capture.md`** — capturing and restoring window layout before driving a
  GUI, for when the user is recording or simply wants their screen back.
- **`references/worked-examples.md`** — two real cases from this app, end to end: a graceful quit
  that reported success but never happened, and a `git status` flag that looked like an edit but
  was the build's own footprint. Read these to see the method applied rather than described.

## The honest-reporting rule

You will form confident theories and some will be wrong. That is fine and expected — the method
exists to catch them. What is not fine is publishing the theory as a finding.

When you retract, retract in writing, with the evidence that killed it. A reviewer who says "I
thought X, I checked, X is false" is worth more than one who is never wrong out loud. And when
all you have is a code read, write "traced by inspection" rather than "verified".
