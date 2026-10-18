# Explicit code review gates

Load this reference when accepting delivered work or reviewing a final change.
Background WATCHDOG advice is useful during
execution, but neither silence nor a worker's success message is a review verdict.
These are dedicated, independent, read-only reviews of completed changes.

## Select the review path

Use the issue structure already recorded by the lead; reviewers do not invent
an issue hierarchy. For a single issue, integrate the executor's delivered
change into the feature checkout, run combined checks, and obtain one dedicated
final review there before publication. A separate child review is not required
by default. For a feature with execution sub-issues, review each completed child
before integrating it, then review the complete integrated parent change.

Risk can require more expertise, deeper tests or additional targeted review
without creating sub-issues. Research/review sessions are Orca tasks referencing
the existing issue; they do not need new GitHub issues. Accepting an executor's
delivery for integration is provisional and never substitutes for final approval.

## Reviewer placement and model

The coordinator creates a bounded Orca review Task and Dispatch on the existing
feature Run. Launch a separate OMP reviewer terminal in the exact existing child
worktree for a sub-issue review, or the parent worktree for the final integration
review. The implementation owner must be settled/idle and the reviewed checkout
must remain unchanged while review is in progress. Do not create another child,
editing owner, sandbox, issue tree or PR for review.

Use the live `modelRoles.advisor` selector (bundled default
`omniroute/teck-advisor`) for the reviewer. This selects the advisor model for a
normal, explicitly tasked OMP session; it does not wait for WATCHDOG's cadence.
The reviewer should use high reasoning when the live model selector supports
its `:high` suffix. Verify the launch receipt's effective model and worktree;
do not substitute the executor as its own reviewer or silently switch providers.
Follow the live CLI's help and official orchestration guide; for example:

```text
orca orchestration worker-start --task <review-task-id> --worktree id:<existing-worktree-id> --agent omp --model omniroute/teck-advisor:high --json
```

Reviewers follow the injected Dispatch contract, send `worker_done` with the
review result, then idle. The coordinator accepts the delivered review report
and releases its terminal through the official lifecycle. An accepted review
report containing `request_changes` is a completed review, not code acceptance.
Never turn a missing, failed or timed-out review into approval.

## Review input and evidence

Supply the verified issue/plan and applicable acceptance criteria, exact worktree selector,
base revision, reviewed head revision, changed-file list, complete diff and test
commands/results. Include added/deleted/untracked files that belong to the work.
For uncommitted changes, record their status and a content/diff fingerprint so
the reviewed snapshot can be rechecked; do not require a signed local checkpoint
just to perform review. Preserve unrelated user changes.

Ask the reviewer to inspect the diff and affected surrounding code, evaluate
correctness, acceptance criteria, regression risks and relevant test coverage.
Tests passing are evidence, not a replacement for reading the change. Reviewers
may inspect Git state/diffs and existing test results, but must not edit project
files, change branches, install dependencies, run mutating setup, publish, merge
or fix their own findings. Implementation/testing remain with the executor.

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
2. Dispatch the dedicated reviewer in that child checkout and await its report.
3. Verify `approve` applies to the current snapshot before integrating into the
   parent. `request_changes` goes to an executor follow-up Task in the same child;
   the reviewer does not implement the fix. `blocked` preserves work and reports
   the missing evidence/capability. Re-review the corrected snapshot.
4. Integrate accepted changes, run affected checks, reconcile the issue's actual
   acceptance gate and retain its review evidence. Do not close the GitHub issue
   merely because its executor Task settled or a child branch was integrated.

## Final parent publication gate

After the single delivered change or all required sub-issues are integrated, run combined acceptance checks and
dispatch the independent reviewer in the parent checkout. Review the complete
parent delta against the verified PR base, all issue/plan criteria, applicable
child review outcomes and combined validation. This is the sole default code
review gate for a single issue, and checks cross-deliverable interactions for a
feature. Individual child approvals do not replace it.

Resolve `request_changes` through a scoped executor follow-up and repeat affected
child checks plus final integrated review. Do not change an approved snapshot
before publication: recheck revisions/status/fingerprint, and invalidate/repeat
the affected review if code, tests or relevant base changes. Publish the reviewed
content through the existing GitHub MCP/signature workflow and verify that the
remote tree matches it. Record the final verdict and return the canonical PR URL
and outstanding remote CI/review gates. An AI review does not satisfy a required
human GitHub review or authorize merging.
