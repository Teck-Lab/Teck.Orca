# Technical planning and research

Use investigation for uncertainty that could materially change the approach:
unfamiliar APIs, a failure mechanism, a shared contract or an architectural
tradeoff. Research is conditional, not a mandatory phase or another approval gate.

## Choose the assignment

- For read-only investigation, use the native `technical-planner` helper or
  `orca_dispatch(role=researcher)`. Return findings to the owning session.
- To maintain an authorized execution plan on GitHub, use
  `orca_dispatch(role=planner, issue=<canonical parent issue URL>)`. The verified
  Orca planner owns a bounded native goal and uses the existing `slow` role.
  This is an assignment role, not a new model alias or a model remapping.
- Every role may use native helpers. A native planning/research helper stays
  read-only and returns its findings; the assigned Orca planner owns GitHub writes.
  A model name, helper name or copied prompt does not confer writer authority.

Supply the parent issue, repository, authorized milestone/delivery scope,
requirements/non-goals, relevant worktree, existing child/dependency IDs, known
facts, needed output and a stopping condition. Read the current plan first.
Do not replace the main model, infer a model from an alias name, or remap the
existing default/plan/task/slow/advisor/smol roles.

## Investigate the decision

Inspect actual source/tests and version-specific primary documentation. Use the
configured GitHub MCP reads for GitHub evidence. Cite material findings and
separate verified behavior from inference and assumptions. Compare alternatives
only when they affect the decision. Reuse prior evidence while its inputs remain
valid; do not repeat a full investigation for every implementation turn.

Return the recommendation/rationale, affected boundaries and sequence, real
prerequisites, observable acceptance criteria, test-first cases, validation and
coverage approach, relevant risks and exact unresolved questions. A narrow lookup
needs only the supported behavior, its source and its consequence. Never invent
executed tests, coverage or implementation results from research.

## Planner creates the canonical execution plan

The coordinator explicitly delegates plan writing and pauses its own edits to
that plan until the planner reports or the assignment is reconciled. There is
one writer per canonical plan; independently owned work continues. No extra
human approval round is required for children within the already authorized scope.
Planning-only, brainstorming and explicit no-write assignments remain read-only.

Follow `github-execution-planning` and its issue-structure/classification rules.
Default to one issue; create children only for useful independent deliverables,
not per helper, test run, failure or review. Read existing children and reuse
verified records before creating anything. Preserve human text, accepted work,
ownership, existing IDs and the canonical PR.

Use the configured App MCP's real tools. The current server exposes
`create_issue` with `parent_issue_number`, `update_issue_body`,
`update_issue_title`, `add_sub_issue`, `reprioritize_sub_issue`,
`issue_read` and `issue_dependency_read/write`. Parent links use database IDs
where the schema asks for them; issue numbers are not interchangeable with IDs.
Create under a verified parent, then read back the returned issue. Read existing
child lists recursively before editing those descendants. Reused candidates must
be read by exact identity before linking; never force-reparent an existing issue.

Each child records its bounded scope, acceptance criteria, test expectations,
validation approach, parent context and real prerequisites. Record only actual
blocking dependencies; several blockers mean all must be accepted. Read back
both parent links and required edges before declaring the plan executable.
Return the root/child URLs and IDs, proposed execution waves, changed edges,
read-back evidence and unresolved blockers. Root milestone/Project changes,
issue closure, implementation dispatch and publication stay with their owners.
The planner cannot edit project files, run tests/shell commands, publish or merge.

After a lost/partial mutation receipt, inspect the existing parent/children and
related edges; reconcile by known IDs before retrying. Never create another child
merely because a response timed out. The extension retains admitted issue scope
across resume; a new Dispatch receives a fresh scope. Unknown records are not
assumed writable.

## Coordinator checks the plan and dispatches

The orchestrator checks returned issue records, scope, acceptance and dependency
read-back evidence. It reconciles the shared issue -> Task -> Dispatch -> worktree
map, applies the selected milestone/Project metadata and dispatches ready
executors. It does not redo the specialist's source investigation. The planner
neither dispatches implementation nor approves delivery.

## Reassess a missed blocker

Follow the missed-blocker loop in
`github-execution-planning/references/issue-structure.md`. Reopen only the affected
question or dependency. Give the planner/researcher the executor's actual failure
evidence and current issue graph. Diagnose before creating an issue, preserve
accepted work, and allow unrelated verified ready work to continue. Reuse the
result in implementation and review instead of commissioning the same research
again.
