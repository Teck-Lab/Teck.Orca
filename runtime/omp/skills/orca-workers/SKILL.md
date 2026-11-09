---
name: orca-workers
description: Launch and reconcile visible OMP executor/reviewer sessions on an existing Orca feature runtime, and follow an assigned worker Dispatch. Covers worktree ownership, role models, and settled-terminal cleanup; issue decomposition belongs to github-execution-planning.
---

# Orca workers

## Assigned worker

This lifecycle applies to an Orca-dispatched session. A native OMP helper follows
its parent's task brief and native OMP lifecycle instead; it needs no Orca
Task/Dispatch or parent-goal binding. Every role may use native helpers.

The live injected Dispatch is the authority for your task, scope, issue, role,
and reporting command. Implement/test only the assigned work, use its blocking
ask/reply channel, check follow-ups at natural checkpoints and before reporting,
then send worker_done with the actual outcome and idle. The coordinator owns
integration, publication, and terminal release. A verified planner may maintain
the assigned canonical issue subtree; other workers do not create a new issue tree,
abandon ownership of the assignment, close your own terminal, or start another
sandbox/daemon.

A reviewer follows the [review contract](../orca-feature-workflow/references/review-gates.md)
instead of editing. Load that reference only for review work. The live preamble
and execution-host orchestration guide own exact lifecycle flags and heartbeats.

A technical planning/research assignment follows the
[research contract](../orca-feature-workflow/references/technical-planning.md).
A researcher/native planning helper returns read-only evidence. A verified
Orca planner creates/reuses scoped GitHub children and dependencies, then returns
exact IDs, execution waves and read-back evidence. Both use the existing slow
model role; only the verified planner receives planning-write authority. All
roles may delegate natively. A missed blocker is escalated with evidence and
reassessed only for its affected scope; preserve the incomplete goal and checkout.

## Coordinator: dispatch

The coordinator delegates primary implementation through orca_dispatch to a
tracked executor/worktree. Its own native helpers perform scoped read-only
research; the executor owns implementation helpers. Keep the
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
The dispatch tool defaults executors to new-child and rejects current, active,
new-top-level or an existing checkout for a new editing terminal. Integration
workers are executors too: they combine accepted child snapshots in their own
child checkout; review/publication target that resulting checkout. Pass exact
accepted dependency branches/revisions in dependent workers' briefs so they can
incorporate prerequisites in their own checkout before implementation. Never
make the feature checkout a shared editing/integration area.
Use the feature branch as base. Give orca_dispatch an optional concise title
such as "Verify Billing finalize"; otherwise it uses the objective's first line.
The adapter automatically adds the issue number and role to the task label,
generates a readable unique name/display name for a new child, and labels the
verified worker pane. Existing worktrees never receive creation/name flags.
An unshared generic worker tab may also be renamed; custom/shared tab titles
are preserved. Missing desktop routing can prevent pane naming, so a naming
warning never means dispatch failed and never authorizes a replacement worker.
OMP accepts --model, not worker-start
--effort. Do not pass cross-host --on or select the feature recipe again.

The bundled 1.4.248 CLI supports `--surface terminal` on `agent launch` and
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
`ready`, `input_accepted` and a live terminal prove delivery/readiness, not an
executing OMP turn or completed work. Verify a worker transcript/tool action
before describing it as executing. Read identity-bearing machine records with
`--full`; compact JSON omits the ownership and assignment fields. Follow list
pagination when reconciling older Dispatches. A shell-return startup failure,
budget-limited goal or uncertain delivery requires the existing attempt's
recovery path, never an automatic replacement worker. Plugin status/launch
indicators are observations; the native goal and exact Orca Dispatch still own
acceptance and settlement.
Link its assigned GitHub issue with worktree set --issue: in a single-issue run,
both feature and executor may reference the same issue. Issue hierarchy and
Orca child-worktree hierarchy are independent. Correct missing parentage using
the exact feature selector before claiming successful dispatch.

Coordinate concurrent edits per file. Every role may use native OMP task/wait
helpers for its scoped work; unrestricted eval is executor-only. OMP owns their
lifecycle; helpers return results to the parent rather than claiming its Orca
Dispatch. Each Orca worker creates the exact native OMP assignment goal before
work and completes it only with evidence,
then reports through the live worker_done contract and idles.
The structured report action stages a report submitted before native goal
completion and delivers it after that exact goal completes. Finalize the goal
next instead of polling for an undelivered staged report. Failed assignments
record blockers and drop their assigned native goal; they never mark it complete.
A quiet terminal or a timeout does not prove exit. Inspect failed start receipts
before any retry so an uncertain launch cannot create a duplicate editor.
Missing runtime authority is a reported blocker, not permission to switch hosts
or substitute raw Git worktrees.

Follow-up executor reuse requires worktree=id:<exact-child-id> plus that child's
existing terminal. The coordinator must bind the same owning Run first. The
extension checks direct parentage to the coordinator worktree, the same project,
a distinct branch, settled/reclaimable terminal ownership and no active dispatch
in that checkout. Multiple terminal owners, foreign Runs, released resources or
uncertain inventory prevent reuse. Create a new child if reuse cannot be proved;
do not bypass the check with raw worker-start or move active workers/files.
Orca atomically claims the selected terminal when starting the follow-up.

## Executor: native implementation

After binding the exact assignment and creating its native goal, start an
implementation-worker with native task. A small change uses one focused helper;
larger work uses a bounded parallel wave with explicit file ownership, acceptance
and prerequisite ordering. Do not manufacture frontend/backend/database teams or
new GitHub sub-issues for a single sequential change. A task receipt is not actual
execution: wait for a native helper turn/tool step before reporting progress.

The helper owns its scoped RED regression test, code and GREEN evidence. Pass the
existing issue, goal objective, constraints, known context and test commands
explicitly; native children do not inherit the entire conversation. The executor
parent owns integration/glue, independently checks returned changes and acceptance,
and runs the relevant combined verification. The extension prevents direct parent
implementation or successful goal completion before an implementation-worker
actually starts. Helpers do not recursively have to spawn another copy first.

Use task/wait and agent:// reads/messages for helper progress and results. Native
helpers may delegate further while retaining their inherited role boundary. No
helper can claim its parent's Orca lifecycle, and read-only helpers cannot gain
shell/eval/edit/publication rights by spawning another agent. Settle or cancel
owned children before the parent reports.

The implementation-worker enables one configured advisor; its Supervisor checks
scope/evidence every three model turns without waiting for catch-up. It is advice,
not an additional code-acceptance gate. Other helper presets default to no advisor
so fan-out does not recursively create watchdogs. Hindsight aliases the parent's
memory state for native helpers; OMP keeps automatic recall/retain with the parent,
avoiding a separate long recall or exploration retention for every child.

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
