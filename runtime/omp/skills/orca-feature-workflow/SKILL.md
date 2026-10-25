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
| Lead: diagnose and plan | [GitHub execution planning](../github-execution-planning/SKILL.md) |
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

Research/planning stay in the feature worktree. Use `technical-planner` on the
configured slow role when technical uncertainty could change the implementation;
follow the [research contract](references/technical-planning.md). Fast codebase
scouting uses `scout`; the main agent handles clear tasks directly. Keep project
code read-only during investigation and keep the lead as canonical plan writer.

For contained work the lead can implement and test directly in its worktree.
Delegate to the configured OMP executor when ownership, useful parallelism or
specialist work warrants it. Each editing worker uses its own visible checkout.
When supervising workers, record issue -> Orca Task -> Dispatch -> worktree;
create/reuse one Run and dispatch ready work against actual dependencies. Direct
implementation does not need a synthetic executor or a second orchestration layer.
Code changes follow the [test-first and coverage contract](references/testing.md).

Use one final independent review by default, including multi-deliverable features.
Add an early targeted review only for a concrete high-risk boundary or a required
contract acceptance gate. Reviewed child code does not need another full audit;
the final review covers the final delta, tests and integration interactions.
Resolve findings through an executor follow-up, verify the reviewed snapshot,
then publish one canonical PR through GitHub MCP. Honor narrower user scope and
repository-required checks; creating a PR never authorizes merging.

Read back the PR URL, head/base, remote contents/signature and outstanding gates.
Report precise planning, validation, review or publication blockers; do not
claim success from worker completion alone. The planning skill owns issue
status/closure rules; the workers skill owns terminal disposition.

## Scope and ownership

An implementation/fix request in the user's repository includes the tracked
issue plan and canonical PR creation/update, subject to explicit read-only,
planning-only, local-only or no-publication instructions. Respect human closure,
existing ownership, and the user's concurrency budget. An assigned executor uses
its supplied issue/plan and Dispatch; it does not recursively plan/delegate the
assignment or publish a competing PR.

Removing worktrees requires the user's cleanup scope and accepted integration/
publication. Use Orca, never raw filesystem cleanup. Feature/worktree deletion
retains the persistent project sandbox. Guest workers must not delete it or run
the legacy feature-sandbox cleanup command against it.
