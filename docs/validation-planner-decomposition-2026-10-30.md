# Planner-owned decomposition and missed-blocker recovery — 2026-10-30

Plugin 0.5.15 / native SSH preview 0.1.10 adds an explicit Orca planner assignment.
It uses the existing OMP `slow` role, as research already does; verified live
Task/Dispatch ownership distinguishes planner authority from a researcher or a
native helper. No model alias/mapping, active sandbox or desktop state is changed.

## Resulting workflow

The orchestrator supplies the canonical parent issue, scope, acceptance and
existing graph. The planner investigates, creates/reuses useful execution
children, writes acceptance/test expectations and records real dependencies.
It returns exact issue IDs, execution waves and relationship read-back evidence.
The orchestrator pauses its plan edits while the planner owns that assignment,
then checks the returned graph and dispatches ready execution work. It retains
delivery acceptance, Project/milestone management and issue closure.

Every role may still use native helpers. Native technical-planner helpers and
researchers remain read-only; the assigned Orca planner owns canonical metadata
writes. File editing, shell/test execution, publication, merging, issue closure
and forced reparenting are outside planner permissions.

When an executor finds a missed blocker, it diagnoses first, then escalates
actual evidence and the affected criterion without claiming completion or
broadening scope. The orchestrator sends only the affected question to a
planner/researcher; the planner revises actual prerequisite edges and reads them
back. Newly ready prerequisite work runs while unrelated work continues. Keep
accepted work, issue IDs, checkout and evidence; do not reset the whole feature
or create an issue merely for a failed command. A terminally failed attempt
leaves the issue open and preserves its checkout for later redispatch.

The standalone [HTML diagram](../issue-flow.html) includes this recovery loop.

## Implementation and scope

The current App MCP exposes split tools including `create_issue` with
`parent_issue_number`, `update_issue_body`, `update_issue_title`, `add_sub_issue`,
`reprioritize_sub_issue`, `issue_read` and `issue_dependency_read/write`.
The role guard now recognizes those real names for the coordinator and the
planner's narrower subset, while retaining older combined-tool compatibility
for existing coordination clients.

The planner needs a valid parent issue URL and exact active assignment goal.
Its scope starts at that parent in one repository. Successful created records
and child-list read-backs admit descendants, including nested sub-issues; it
cannot invent writable issue IDs in a prompt. Exact candidate reads provide
IDs for reuse, and successful non-forced linking admits them. Scope survives
resume and resets for a new Dispatch. Unknown records stay outside write scope;
missing/uncertain receipts require read-back before retrying.

Compact MCP records may omit database IDs or report a string ID plus an issue
URL. The tracker can recover the issue number from a verified repository/issue
URL; database IDs remain necessary only for tools that explicitly require them.
It ignores PR/foreign URLs, failed records, and JSON embedded in issue bodies or
unrelated metadata. This is a tool boundary within trusted OMP extensions, not
OS isolation or backend GitHub authorization.

Managed native profile upgrades include the new scope module together with the
extension, planner preset and guides; custom models/settings/sessions remain
untouched.

## Validation

New regression tests first failed for missing split-tool support, absent planner
authority, writable native planning helpers and missing upgrade-module copying.
They pass after implementation. Additional cases cover compact MCP responses,
nested children, exact candidate admission, foreign/body-injected IDs, failed
mutations, resumed scope and the existing slow-role dispatch.

The configured App MCP's live tool schemas were inspected, and an existing
record was read through `issue_read` to verify its compact response format.
No test GitHub issues, comments, dependency edges or Project records were
created or edited. The updated HTML/SVG views were rendered with headless Edge
using separate profiles and visually inspected.

Full build/check/test results are recorded after final scoped validation. The
previous runtime/delegation live acceptance remains in
[the runtime validation](validation-orca-omp-2026-10-30.md); it is not a live
GitHub planner-write acceptance test. The previously observed unavailable
`teck-researcher` provider alias was not remapped or repaired by this change.

Final scoped validation passed: root build/check and all 151 tests; native preview build/check and all 22 tests. Plugin 0.5.15 and preview 0.1.10 were prepared locally without creating a sandbox or updating the active project's profile/processes.
