---
name: orca-workers
description: Launch and reconcile visible OMP executor/reviewer sessions on an existing Orca feature runtime, and follow an assigned worker Dispatch. Covers worktree ownership, role models, and settled-terminal cleanup; issue decomposition belongs to github-execution-planning.
---

# Orca workers

## Assigned worker

The live injected Dispatch is the authority for your task, scope, issue, role,
and reporting command. Implement/test only the assigned work, use its blocking
ask/reply channel, check follow-ups at natural checkpoints and before reporting,
then send worker_done with the actual outcome and idle. The coordinator owns
integration, publication, and terminal release. Do not create a new issue tree,
redelegate the whole assignment, close your own terminal, or start another
sandbox/daemon.

A reviewer follows the [review contract](../orca-feature-workflow/references/review-gates.md)
instead of editing. Load that reference only for review work. The live preamble
and execution-host orchestration guide own exact lifecycle flags and heartbeats.

A technical planning/research assignment follows the
[research contract](../orca-feature-workflow/references/technical-planning.md).
Return evidence and a proposed plan to the coordinator; preserve read-only scope.
Use a visible Orca researcher Dispatch with the existing slow role; native
technical-planner/task helpers are disabled in this workflow.

## Coordinator: dispatch

The coordinator never implements. Every implementation issue, including a
contained fix, receives a task-role executor through orca_dispatch. Keep the
existing issue unless separate deliverables warrant sub-issues. Every implementation owner follows the
[test-first and coverage contract](../orca-feature-workflow/references/testing.md)
and supplies its test/coverage evidence with delivery.

Resolve the executable through [orca-cli](../orca-cli/SKILL.md). Before the first
Orca operation, load that executable's version-matched compact orchestration
guide; reuse it thereafter. Load placement-and-remote only for placement/routing
questions, coordinator-loop for DAG/reuse details, and recovery-and-cleanup when
a receipt or uncertain lifecycle action requires it. Bundled official snapshots
are fallback references; verify unsupported flags with the same CLI's help.

From the feature's own Orca terminal, use orca_dispatch(role=executor,
worktree=new-child) with the objective, issue and acceptance criteria. The tool
uses public worker-start and the live configured modelRoles.task selector.
Use the feature branch as base, with shared prerequisites committed by an
executor/integration worker before fan-out. Names/display names identify the
execution issue and short task title. OMP accepts --model, not worker-start
--effort. Do not pass cross-host --on or select the feature recipe again.

The installed 1.4.237 CLI supports `--surface terminal` on `agent launch` and
agent-backed `worktree create`. For a direct OMP terminal launch in an existing
checkout, use `orca agent launch --agent omp --surface terminal --model <role-model> --json`
with the exact worktree selector when needed. This starts OMP through
Orca's launcher and keeps its terminal session recovery. Do not launch OMP again
after Orca has already started it.

`orchestration worker-start` has no `--surface` option. Keep its supervised launch
path and follow the execution host's guide and returned receipt; read output
through `worker-read --source auto` rather than assuming every worker handle is
a terminal. Do not add the direct-launch flag to worker-start or bypass Dispatch
to force a terminal.

Verify readiness, exact worktree id, execution host and feature parentage.
Link its assigned GitHub issue with worktree set --issue: in a single-issue run,
both feature and executor may reference the same issue. Issue hierarchy and
Orca child-worktree hierarchy are independent. Correct missing parentage using
the exact feature selector before claiming successful dispatch.

Keep one editing owner per checkout. All scouting/research also uses Orca
Dispatches; native OMP task/eval helpers are disabled. Each worker creates the
exact native OMP assignment goal before work and completes it only with evidence,
then reports through the live worker_done contract and idles.
The structured report action stages a report submitted before native goal
completion and delivers it after that exact goal completes. Finalize the goal
next instead of polling for an undelivered staged report. Failed assignments
record blockers and drop their assigned native goal; they never mark it complete.
A quiet terminal or a timeout does not prove exit. Inspect failed start receipts
before any retry so an uncertain launch cannot create a duplicate editor.
Missing runtime authority is a reported blocker, not permission to switch hosts
or substitute raw Git worktrees.

## Coordinator: completion and cleanup

Use the authoritative orchestration mailbox and Dispatch states for questions,
follow-ups and completion. An accepted delivery is not code approval; load the
[review gates](../orca-feature-workflow/references/review-gates.md) at acceptance.
Reviews/research use existing worktrees and issues, without new execution
sub-issues simply to account for helper sessions.

After an accepted settlement, choose immediate follow-up reuse or worker-release.
Use worker-retain only for an explicit user request to keep that terminal alive,
citing the request. Preserving worktrees, read-only tasks, or inspecting results
do not request live retention; release preserves the checkout and archived output.
Workers report and idle; the coordinator performs disposition.

Before completion verify disposition receipts and that worker-list --run <id>
--terminal-state reclaimable is empty. Unjustified retention cannot satisfy this
gate. Follow official recovery receipts for uncertain/protected releases; do not
substitute terminal close. Preserve the coordinator and unrelated user terminals.
