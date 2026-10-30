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
Research, test runs, reviews and revision rounds are native helper assignments or Orca tasks/checklist items
under the same issue unless they are independently scoped deliverables.

Flow: issue -> Orca executor goal with tests and optional native helpers -> relevant combined checks -> one
final independent review -> publication worker -> canonical PR. The coordinator
never implements, including contained work. Delegation does not require a new
GitHub sub-issue. The review reference defines the exact gate.

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

Flow: parent plan -> ready child executors -> integration and combined checks ->
one final independent review -> canonical PR. An early targeted review is added
only for a concrete high-risk boundary or required contract acceptance gate;
sub-issue count alone does not create additional review gates.

## Apply the same workflow within a sub-issue

An executor owns its assigned issue and may plan its local work, use a native
planner, and fan out native helpers for frontend, backend, database, testing or
other useful purposes. Researchers and reviewers can also use native helpers.
The parent accepts their evidence and remains responsible for the complete result.
Canonical execution sub-issues/sub-sub-issues retain an Orca executor and bounded
goal; native helpers support that owner without replacing its tracked assignment.

Apply the splitting decision at any level. A sub-sub-issue is useful when it has
its own acceptance criteria, owner, durable blocker or independently trackable
deliverable. An OMP helper alone never requires a GitHub issue. Executors propose
durable decomposition/dependency changes to the main coordinator so the shared
GitHub plan stays consistent; do not create competing issue trees or PRs.

Parentage describes containment; dependency edges determine execution waves.
For example, 1 -> {2,3} -> 4 runs 1 first, then 2 and 3 concurrently, then 4 once
its actual prerequisites are accepted and available in the execution checkout.
If 4 needs both 2 and 3, record both blockers; if it needs only 2, record only 2.
Several blockers mean all listed prerequisites, not interchangeable alternatives.
Start every independently ready branch within the user's/provider's/runtime's
capacity. Recompute readiness as work is accepted or a new blocker is discovered.

Dependency acceptance requires actual tests/artifact evidence, not merely a
helper's completion message. Within one integration PR, record prerequisite
readiness without closing GitHub issues merely to advance scheduling; issue/PR
closure still follows its agreed delivery gate. A final independent review covers
the deliverable/integration; do not add a full review for each small helper or
wave unless a concrete risk or contract requires that early gate.

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

## When an executor discovers a missed blocker

1. The executor diagnoses the failing layer within its assignment. A restore,
   image pull, test setup or tool error is not automatically a missing feature.
   Use native research helpers for a bounded question when useful; do not keep
   retrying the same failed approach without new evidence.
2. Resolve an ordinary implementation detail within scope using the normal
   test-first cycle. If a prerequisite, contract decision or scope change is
   needed, send a structured escalation/ask to the coordinator with the actual
   failure/evidence path, affected acceptance criterion, suspected prerequisite,
   work already completed and proposed next action. Keep the goal incomplete;
   never report success or quietly broaden scope.
3. The coordinator pauses only dependent work and assigns the smallest useful
   reassessment to a planner and/or read-only researcher. Supply the canonical
   parent and exact affected issue IDs so the existing graph is revised rather
   than replaced. One planner owns those plan edits while the coordinator pauses
   its own edits to that plan.
4. The planner reuses the existing prerequisite or creates a useful in-scope
   deliverable, updates actual dependency edges and reads them back. An external
   prerequisite may be linked without adopting it into this parent or taking
   ownership of another repository. If the needed work exceeds authorized scope,
   return that decision to the coordinator; time passing does not authorize it.
5. The coordinator checks the revised records and evidence, dispatches newly
   ready prerequisites and lets unrelated ready branches continue. Resume the
   existing executor/checkout once its prerequisite is accepted. Preserve issue
   IDs, accepted changes, evidence and the canonical integration PR; do not reset
   the entire plan or order another full review for the blocker alone.

If the attempt cannot continue, use the existing terminal-failure lifecycle:
record the blocker, drop the assignment goal without completing it, report failed
and preserve the checkout for a later Dispatch. The GitHub issue remains open;
an ended attempt is not a completed deliverable. Do not retain unused live
workers just to represent a durable blocked issue.
