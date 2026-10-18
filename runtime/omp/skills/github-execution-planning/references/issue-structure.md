# Issue structure and blockers

Load when a lead chooses or revises the GitHub plan. This is the canonical
decision rule; worker count, review sessions and Orca worktree parentage do not
by themselves determine GitHub hierarchy.

## Default: one issue

Keep one implementation issue with a concise plan, acceptance criteria and
validation. It covers the implementation, associated tests and directly related
documentation. One Orca execution Task/worker can link directly to this issue;
a child checkout does not require a GitHub sub-issue.

Use this path for one coherent deliverable, even if it spans several files,
requires research, has multiple implementation steps, or is high risk. Risk
determines investigation, test depth and review expertise, not issue count.
Research, test runs, reviews and revision rounds are Orca tasks/checklist items
under the same issue unless they are independently scoped deliverables.

Flow: issue -> executor -> integration and combined checks -> final independent
review -> canonical PR. The review reference defines the exact gate.

## Use a parent with execution sub-issues when useful

Split only when BOTH are true:

1. There are distinct deliverables with their own observable acceptance criteria.
2. Separate tracking provides a concrete benefit: separate ownership, useful
   parallel execution, an explicit dependency/stage, or independent tracking of
   blocked and unblocked work.

A contract change followed by independently owned service updates can qualify.
A calculation fix and its regression tests normally do not. File count, elapsed
time, uncertainty, perceived complexity, and a desire for more agents are not
sufficient splitting criteria on their own. Do not create a placeholder child
whose entire scope merely repeats its parent.

Create/reuse children only for actual deliverables, preserve an already agreed
issue graph, and use one canonical integration PR unless the user asks otherwise.
An existing assigned sub-issue remains executable as assigned; do not create a
new parent or nested issue tree merely to apply this default.

Flow: parent plan -> ready child executors -> child reviews -> integration and
combined checks -> final independent review -> canonical PR.

## Blockers

| Situation | Action |
| --- | --- |
| The entire deliverable is blocked | Keep one issue; record evidence, prerequisite/decision, next owner and the condition for resuming |
| One distinct deliverable is blocked and another can proceed | Split when separate acceptance/ownership makes the distinction useful; dispatch only ready work |
| Resolving the blocker is independently scoped work | Reuse or create an authorized prerequisite issue, then add a blocking dependency |
| A test, restore, network, or tool invocation fails | Diagnose the failing layer first; do not automatically manufacture another issue |

Parentage means "part of this feature"; blocked-by means "cannot proceed until".
A prerequisite may live outside this parent or repository. Reuse its existing
issue and link the real dependency rather than adopting it as a child or
expanding the current assignment without authorization.

Missing sub-issue tooling does not block a single-issue plan. Missing a required
dependency edge blocks its dependent execution, not unrelated verified ready
work. Record partial progress accurately rather than marking an entire feature
blocked when accepted in-scope work can still proceed.

## Record and revise the choice

After diagnosis, record a short rationale in the canonical issue's managed plan,
for example "One issue: one deliverable with implementation and regression tests"
or "Sub-issues: separate contract and consumer owners; consumer waits on contract".

Choose once, not on every turn. Reassess on evidence of new deliverables, changed
ownership, or a material blocker; do not split merely because an initial attempt
failed. Promote the existing issue to the parent if needed, preserving its
investigation, accepted work, existing IDs and agreed acceptance criteria.
Reconcile the work map so exactly one current Dispatch owns each editing scope.
