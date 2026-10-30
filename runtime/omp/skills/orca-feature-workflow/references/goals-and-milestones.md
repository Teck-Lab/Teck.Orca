# Native goals, milestones and role boundaries

GitHub is the durable shared plan; Orca owns parallel execution; native OMP
goals and todo phases keep each session focused. These are connected records,
not three independently editable copies of worker status.

## Coordinator

Use the existing default/plan roles. Confirm the user's selected repository,
Project and milestone; do not invent a milestone or broaden an authorized issue
into a whole release. A single issue works without a milestone. State the exact
completion gate: reviewed PRs, landing or another explicitly authorized outcome.
PR creation never authorizes merging.

Before dispatch, create one native OMP goal matching that authorized scope. Use
native todos for planning/dispatch/evidence/review/publication checkpoints. OMP
keeps one active todo, so it identifies the next coordination action; Orca's
Task/Dispatch graph remains authoritative for concurrently running workers.
Keep priority, dependencies and acceptance criteria on GitHub. Use the existing
official GitHub MCP for issues/fields/dependencies and github-projects for
Projects/milestone CRUD. No PAT, raw remote Git transport or new MCP is needed.

Canonical execution issues/sub-issues retain tracked Orca executors and bounded
native goals; native helpers support their owner without replacing that record.
Use orca_dispatch with role, objective, issue URL where applicable, observable
acceptance criteria, constraints and explicit worktree placement. It resolves
task/slow/advisor from OMP's live configuration; publisher uses task. The wrapper
adds the assignment contract to Orca's Task spec. Native OMP task/eval helpers are
allowed for every role, including researchers and reviewers, without separate
Orca records. Use existing model roles and let OMP own helper lifecycle. Dispatch
as much independently ready work as the user's concurrency budget and actual
provider/runtime capacity allow. Review/research and nested helpers consume that
same finite capacity; avoid overlapping file writers or redundant investigation.

The coordinator cannot inspect implementation code, edit, run tests, integrate
or publish code. Assign investigation to researcher; implementation/testing and
integration to executor; verification/review to independent reviewer; canonical
App-backed snapshot/PR publication to publisher. Inspect reports, metadata and
explicit verdicts; missing technical evidence becomes another bounded assignment.

## Worker

The live Orca Task/Dispatch supplies authority and lifecycle IDs. The assignment
objective becomes that session's exact native OMP goal. Create it before work;
use phased todos for the acceptance criteria, implementation/TDD and evidence.
Do not invent a new issue, goal scope, milestone or PR. Executor owns code/tests;
researcher and reviewer stay read-only; publisher may inspect the approved
checkout and use App-backed MCP but must not edit it or merge.

All roles may create native helpers as needed. The parent is accountable for
scope, permissions, editing coordination and evidence. Helpers use their native
OMP agent preset and task brief, not the parent's Orca identity or exact native
goal. They return results to the parent, which retains final acceptance and
Orca settlement. Native task/eval execution is permitted; role boundaries are
behavioral instructions rather than isolation from delegated code execution.

Only complete a goal once every assigned criterion has current evidence. A
review assignment is complete when its report/verdict is ready, including
request_changes; this is not implementation approval. Send worker_done using
the structured report action and idle after delivery. If submitted before native
completion, the adapter stages the report and sends it after the exact goal
completes; finalize the goal next, without waiting for an undelivered report.
While waiting on a blocker, leave the goal
incomplete and use the live ask/reply channel. For terminal failure, record the
blocker, drop the native goal without completing it, report failed and idle.
Dropping the failed assignment ends automatic continuation; its failed Orca
attempt and native tool history remain the recovery record. A blocker is never
permission to mark success.

Publication must compare the exact reviewed base/head and working-tree snapshot,
verify the remote tree/signature and report outstanding gates. A changed snapshot
returns to the coordinator for the affected review; never silently publish it.

## Recovery and completion

Persist issue/milestone URL, Run, Task, Dispatch, worktree, native goal and PR
identity in the coordinator records. On resume read back the native goal/todos,
GitHub scope and existing Orca state before new dispatch. Never retry an uncertain
launch with a new identity. Native goal continuation must wait through Orca's
mailbox while work runs; no polling loop, duplicate executor or extra review.

Worker completion, reviewer approval, publication, issue closure and milestone
closure are distinct. Close GitHub records only at their agreed acceptance gate.
Native goal budgets are per session; they are not a fleet-wide cost cap. Do not
invent budgets or treat exhaustion as completion. Paused goals require resume;
completed goals do not authorize more edits. Same-terminal reuse receives a new
bounded Dispatch/goal after the previous assignment settles.

The extension verifies roles against the exact live pane/Dispatch and configured
model, exposes native goal/todo tools, denies
off-role calls before execution and replaces shell-based coordination with a
structured Orca action tool that generates shell-free argv. Worker native goal
creation is normalized to the verified assignment objective and its explicit
budget, if any. Idle startup recovery uses that same live Task/Dispatch and OMP's
queue, never another worker. This is an OMP behavioral boundary, not OS isolation from
trusted project extensions or a human launching another process. Goal-mode
instructions about reading files/running tests never override the coordinator
boundary: technical verification is provided by the assigned workers.
