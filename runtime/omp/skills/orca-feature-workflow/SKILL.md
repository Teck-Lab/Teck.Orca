---
name: orca-feature-workflow
description: Coordinate GitHub-tracked implementation and repair on a feature's existing Orca sandbox. Route planning, visible executors, review, publication, and cleanup; default to one issue and use sub-issues only for separately tracked deliverables.
---

# Feature workflow

One top-level feature owns one sandbox and Orca daemon. Its execution workers
use parent-linked child worktrees on that same runtime. Preserve ORCA_* routing
and feature identity; do not select the recipe again for a child or start a
second daemon. Another feature gets its own sandbox.

## Route by role and stage

Read only the guidance needed for the current role/action; do not preload every
linked skill and reference. Reuse already-loaded guidance during this session.

| Role or next action | Read |
| --- | --- |
| Lead: diagnose and plan | [GitHub execution planning](../github-execution-planning/SKILL.md) |
| Lead: launch or reconcile workers | [Orca workers](../orca-workers/SKILL.md) and the execution-host CLI's compact orchestration guide |
| Lead: accept/integrate/review | [Review gates](references/review-gates.md) |
| Lead: publish verified changes | [GitHub publication](../github-publication/SKILL.md) |
| Assigned executor | Its live Dispatch and [Orca workers](../orca-workers/SKILL.md); do not repeat lead planning |
| Assigned reviewer | Its live Dispatch and [Review gates](references/review-gates.md); do not create issues or editing workers |

## Lead's delivery flow

Diagnose read-only, confirm the repository, and create/reuse a GitHub issue before
implementation. Select issue structure using the planning skill's
[decision rule](../github-execution-planning/references/issue-structure.md).
A single issue remains sufficient for a contained change, including its tests.
Risk changes verification depth; it does not itself require sub-issues.

Research/planning stay in the feature worktree. Bounded OMP internal scouts or
same-worktree Orca research terminals are optional; keep project code read-only
during this phase and keep one canonical plan writer.

The lead coordinates; the configured OMP executor implements and validates in a
visible Orca child checkout. This separation also applies when the executor and
feature refer to the same GitHub issue. Record issue -> Orca Task -> Dispatch ->
worktree. Create/reuse one Run and tasks with acceptance criteria; dispatch only
ready work and keep GitHub dependencies aligned with actual execution gates.

Follow the selected review path: one final independent review for a single
issue, or child reviews plus final integration review for multiple deliverables.
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
publication. Use Orca, never raw filesystem cleanup. Feature deletion can retain
the sandbox while linked children remain; later host cleanup uses the documented
Teck.Orca cleanup command. Guest workers must not delete their own sandbox.
