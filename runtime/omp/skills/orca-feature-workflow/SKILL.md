---
name: orca-feature-workflow
description: Coordinate GitHub-tracked implementation and repair on a feature's existing Orca sandbox. Route planning, visible executors, review, publication, and cleanup; default to one issue and use sub-issues only for separately tracked deliverables.
---

# Feature workflow

One project shares one persistent sandbox and Orca daemon across its features.
Each feature's execution workers use parent-linked child worktrees on that same
runtime. Preserve ORCA_* routing and project identity; use the saved project
connection for additional features. Do not select the recipe again for a child
or start a second daemon.

## Route by role and stage

Read only the guidance needed for the current role/action; do not preload every
linked skill and reference. Reuse already-loaded guidance during this session.

| Role or next action | Read |
| --- | --- |
| Lead: plan from issue/worker evidence | [GitHub execution planning](../github-execution-planning/SKILL.md) and [goals and milestones](references/goals-and-milestones.md) |
| Technical uncertainty or substantial design work | [Technical planning and research](references/technical-planning.md) |
| Lead: launch or reconcile workers | [Orca workers](../orca-workers/SKILL.md) and the execution-host CLI's compact orchestration guide |
| Implementation: code, tests and coverage | [Test-first implementation](references/testing.md), then the relevant repository/testing guidance |
| Lead: accept/integrate/review | [Review gates](references/review-gates.md) |
| Lead: publish verified changes | [GitHub publication](../github-publication/SKILL.md) |
| Assigned executor | Its live Dispatch and [Orca workers](../orca-workers/SKILL.md); do not repeat lead planning |
| Assigned reviewer | Its live Dispatch and [Review gates](references/review-gates.md); do not create issues or editing workers |
| Assigned technical planner | Its bounded question and [Technical planning and research](references/technical-planning.md); return a read-only recommendation |

## Lead's delivery flow

Diagnose read-only, confirm the repository, and create/reuse a GitHub issue before
implementation. Select issue structure using the planning skill's
[decision rule](../github-execution-planning/references/issue-structure.md).
A single issue remains sufficient for a contained change, including its tests.
Risk changes verification depth; it does not itself require sub-issues.

The coordinator plans from GitHub metadata and helper/worker evidence. Use native
OMP task/eval helpers or an Orca researcher on the configured slow role for source
investigation and design questions; follow the [research contract](references/technical-planning.md).
Every role may delegate natively as needed. For GitHub plan writing, assign
`orca_dispatch(role=planner,issue=<canonical parent URL>)` on the existing slow
role. The planner creates/reuses useful execution children, acceptance/test
expectations and actual dependencies; the orchestrator checks its returned IDs
and read-back evidence. Keep one plan writer at a time and project code read-only.
For missed blockers, follow the affected-scope reassessment loop in the issue-structure reference.

Assign canonical execution issues/sub-issues to Orca executors on the configured
task role, with bounded native goals. Executors may use native helpers for any
scoped implementation work and retain acceptance ownership.
Record issue -> Orca Task -> Dispatch -> worktree;
create/reuse one Run and dispatch ready work against actual dependencies. Direct
implementation needs no synthetic GitHub sub-issue or second orchestration layer.
Native helpers keep their OMP lifecycle and return results to their parent; they
need no separate Orca records. For visible Orca workers use orca_dispatch with an explicit
objective, acceptance criteria and constraints; it resolves existing model roles.
Code changes follow the [test-first and coverage contract](references/testing.md).

Use one final independent review by default, including multi-deliverable features.
Add an early targeted review only for a concrete high-risk boundary or a required
contract acceptance gate. Reviewed child code does not need another full audit;
the final review covers the final delta, tests and integration interactions.
Resolve findings through an executor follow-up. Dispatch snapshot verification
and publication to a task-role publication worker, then reconcile its evidence
and the canonical PR returned through GitHub MCP. Honor narrower user scope and
repository-required checks; creating a PR never authorizes merging.

Require the publication report's PR URL, head/base, remote contents/signature and outstanding gates.
Report precise planning, validation, review or publication blockers; do not
claim success from worker completion alone. The planning skill owns issue
status/closure rules; the workers skill owns terminal disposition.

## Scope and ownership

An implementation/fix request in the user's repository includes the tracked
issue plan and canonical PR creation/update, subject to explicit read-only,
planning-only, local-only or no-publication instructions. Respect human closure,
existing ownership, and the user's concurrency budget. An assigned executor uses
its supplied issue/plan and Dispatch, may use native helpers as needed, and remains
responsible for acceptance rather than publishing a competing PR.

Removing worktrees requires the user's cleanup scope and accepted integration/
publication. Use Orca, never raw filesystem cleanup. Feature/worktree deletion
retains the persistent project sandbox. Guest workers must not delete it or run
the legacy feature-sandbox cleanup command against it.
