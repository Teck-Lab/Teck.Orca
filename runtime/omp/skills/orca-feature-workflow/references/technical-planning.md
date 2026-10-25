# Technical planning and research

Use `technical-planner` for a decision that could materially change the
implementation: an unfamiliar library/API, uncertain failure mechanism,
cross-cutting design, or meaningful architectural tradeoff. The main agent handles
clear bugs and straightforward features; the fast `scout` collects codebase facts.
Research is conditional, not a mandatory phase or a new review/approval gate.

## Assign a bounded question

The bundled OMP task agent `technical-planner` resolves `@slow` through the live
`modelRoles.slow` setting (default `omniroute/teck-researcher`). Invoke it by agent
name with OMP's native task tool, following the live tool schema. Do not replace
the main session model or remap all planning to the specialist. `plan`, `default`,
`task`, `advisor` and `smol` retain their existing assignments. The concrete model
behind the researcher alias is configured in OmniRoute; do not infer it from its name.

Supply the decision/question, user requirements and exclusions, existing issue
and relevant worktree, known evidence, applicable versions, constraints and the
needed output. Set a reasonable investigation budget or stopping condition;
ask for the smallest useful investigation rather than "research everything".
Reuse prior research while its assumptions and inputs remain valid. Investigate
new uncertainty during implementation when it could change the next step.

Default to one bounded internal task on the current execution host. Follow the
user's concurrency limit; no recursive research delegation. If separately visible
supervision is needed, use an Orca research Task/Dispatch in the existing checkout
and the resolved slow-role model, carrying this same read-only contract. Such a
terminal follows the worker reporting/release lifecycle, without a new issue,
editing checkout, sandbox or parallel orchestration layer.

## Investigate and return a proposed plan

Ground the recommendation in repository source/tests and version-specific primary
documentation. Use the existing search/page reader and GitHub MCP reads. Cite
links or file locations for material findings. State evidence gaps honestly and
separate verified behavior, inference and assumptions. Compare alternatives only
where they affect the decision; identify compatibility and operational costs.

For technical planning, return:

- The decision/recommendation and the evidence supporting it.
- Material alternatives and why the recommendation fits the stated constraints.
- A scoped implementation sequence, affected boundaries and real dependencies.
- Observable acceptance criteria, test-first cases and the validation/coverage
  approach using the repository's existing tooling.
- Concrete risks, rollout/migration considerations where relevant, and unresolved
  questions that require more evidence or a user decision.

Scale the report to the assignment. A narrow API lookup needs the supported
behavior, source and consequence, not a full architecture document. Do not
invent executed tests, coverage reports or implementation results from research.
Keep project files and GitHub state read-only; return findings to the parent.

## Execution owner adopts and updates

The main orchestrator checks applicability, resolves material open decisions and
records the adopted plan in the existing canonical issue when implementation is
authorized. Planning-only/brainstorming work needs no new issue or publication.
The specialist does not create issue trees, dispatch implementation, or approve
delivery. Independent ready work can continue while a question is investigated.
Revisit only the affected part of the plan as implementation produces new facts;
reuse the findings in review rather than ordering the same research again.
