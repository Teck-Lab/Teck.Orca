# Explicit code review gates

Load this reference when accepting delivered work or reviewing a final change.
Background WATCHDOG advice is useful during
execution, but neither silence nor a worker's success message is a review verdict.
These are dedicated, independent, read-only reviews of completed changes.

## Select the review path

Use one independent final review before publication for both single issues and
features with execution sub-issues. Review the implementation owner's stable
checkout, or the integrated feature checkout when work was delegated. Issue or
worker count alone does not require child reviews or a second full code audit.

Add an early targeted review only for a concrete risk: an authentication or
tenant boundary, a destructive migration, data-loss/concurrency risk, a critical
shared contract, or a required acceptance gate before dependent work begins.
Record its scope and reason once. Other independent work continues while that
checkout is reviewed. In the final review, reuse accepted child evidence and
focus additional attention on integration interactions and subsequent changes.

Risk can require more expertise, deeper tests or additional targeted review
without creating sub-issues. Research/review sessions are Orca tasks referencing
the existing issue; they do not need new GitHub issues. Accepting an executor's
delivery for integration is provisional and never substitutes for final approval.

## Reviewer placement and model

The coordinator creates a bounded Orca review Task and Dispatch on the existing
feature Run. Launch the independent OMP reviewer in the exact existing checkout
for the chosen review. The implementation owner must be settled/idle and that checkout
must remain unchanged while review is in progress. Do not create another child,
editing owner, sandbox, issue tree or PR for review.

Use the live `modelRoles.advisor` selector (bundled default
`omniroute/teck-advisor`) for the reviewer. This selects the advisor model for a
normal, explicitly tasked OMP session; it does not wait for WATCHDOG's cadence.
Use medium reasoning for ordinary reviews. Use high reasoning for an identified
security/auth, migration, data-loss or complex integration risk; name that risk
instead of making high effort universal. Verify the effective model and worktree;
do not substitute the executor as its own reviewer or silently switch providers.
Follow the live CLI's help and official orchestration guide; for example:

```text
orca orchestration worker-start --task <review-task-id> --worktree id:<existing-worktree-id> --agent omp --model omniroute/teck-advisor:medium --json
```

Bundled advisor-model sessions use the launcher's session-local reviewer.yml
overlay to disable their own WATCHDOG advisors. An explicit --advisor request
overrides that default. Keep custom reviewer launches equally free of nested
background reviews; do not edit shared user settings to achieve it.

Reviewers follow the injected Dispatch contract, send `worker_done` with the
review result, then idle. The coordinator accepts the delivered review report
and releases its terminal through the official lifecycle. An accepted review
report containing `request_changes` is a completed review, not code acceptance.
Never turn a missing, failed or timed-out review into approval.

## Review input and evidence

Supply the verified issue/plan and applicable acceptance criteria, exact worktree selector,
base revision, reviewed head revision, changed-file list, complete diff and test
commands/results. Include the requirement-to-test mapping, RED/GREEN evidence,
and comparable baseline/candidate line and branch coverage from the
[testing contract](testing.md). Check any affected module and measured aggregate
for decreases; missing or incomparable evidence is unresolved, not a pass.
Include added/deleted/untracked files that belong to the work.
For uncommitted changes, record their status and a content/diff fingerprint so
the reviewed snapshot can be rechecked; do not require a signed local checkpoint
just to perform review. Preserve unrelated user changes.

Ask the reviewer to inspect the diff and affected surrounding code, evaluate
correctness, acceptance criteria, regression risks and relevant test coverage.
Tests passing are evidence, not a replacement for reading the change. Reviewers
may inspect Git state/diffs and existing test results, but must not edit project
files, change branches, install dependencies, run mutating setup, publish, merge
or fix their own findings. Implementation/testing remain with the executor.

Give one consolidated report of all material findings, with blocking defects
separate from optional improvements. Style preferences, speculative redesign,
unrelated legacy coverage and requests for more agents do not create gates.
Inspect existing test results; request a rerun only for changed inputs, an actual
failure or a specific unresolved concern. Do not repeat an entire suite or
coverage collection simply because review started.

Require an explicit report containing:

- `verdict`: `approve`, `request_changes` or `blocked`.
- Reviewed worktree, base/head revisions and working-tree fingerprint when used.
- Findings with file/line, evidence, consequence and concrete next action.
- Acceptance criteria/test evidence checked and any material validation gaps.

An `approve` with no findings is a valid explicit report; no advisor notes are
not. The lead verifies the report against the supplied snapshot and evidence.
Missing evidence for required acceptance checks prevents approval. Material
correctness/security findings prevent integration/publication; nonblocking
suggestions do not require unrelated redesign. Record the verdict and snapshot
on the Orca review Task and the relevant GitHub execution issue or parent plan.

## Sub-issue integration gate (feature path)

1. Receive the settled executor report and capture its exact changes/evidence.
   Dispose of its terminal through the official settlement contract; accepting
   a delivery or a completed Orca Task does not accept the code or close its issue.
2. Verify behavioral tests, coverage evidence and acceptance checks. Integrate
   provisionally without a child review unless the selected early targeted gate
   actually applies. Independent implementation/review work can continue in parallel.
3. When an early targeted review is required, verify its approval applies to
   the snapshot before crossing that specific gate. Corrections go to the editing
   owner; reviewers remain read-only. Recheck the corrections and affected contract.
4. Integrate accepted changes, run affected checks, reconcile the issue's actual
   acceptance gate and retain its review evidence. Do not close the GitHub issue
   merely because its executor Task settled or a child branch was integrated.

## Final parent publication gate

After the single delivered change or all required sub-issues are integrated, run combined acceptance checks and
dispatch the independent reviewer in the parent checkout. Review the complete
parent delta against the verified PR base, all issue/plan criteria, applicable
targeted review outcomes and combined validation. This is the sole default code
review gate for both single issues and multi-deliverable features. Use prior
review evidence to avoid repeating a full audit of unchanged accepted children;
check their integration and the subsequent delta.

Resolve `request_changes` through the implementation owner and run affected checks.
Reuse the reviewer for an immediate correction round through the supported Orca
follow-up lifecycle. Review the correction delta, original findings and affected
interactions; do not restart a full review of unrelated unchanged code. A new
unrelated issue gets fresh review scope/context. Do not silently widen scope or
turn nonblocking suggestions into another delivery cycle. If review stalls,
inspect the existing worker and report evidence instead of launching duplicates
or treating elapsed time as approval. Do not change an approved snapshot
before publication: recheck revisions/status/fingerprint, and invalidate/repeat
the affected review if code, tests or relevant base changes. Publish the reviewed
content through the existing GitHub MCP/signature workflow and verify that the
remote tree matches it. Record the final verdict and return the canonical PR URL
and outstanding remote CI/review gates. An AI review does not satisfy a required
human GitHub review or authorize merging.
