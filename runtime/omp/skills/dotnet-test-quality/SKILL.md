---
name: dotnet-test-quality
description: Assess .NET behavioral test gaps, coverage evidence, and test effectiveness; prioritize regression and boundary cases. Use for test-quality or coverage audits, not routine test execution or a named-method CRAP calculation.
---

# .NET test quality

Start from the requested behavior, changed code, and existing tests. Follow the
repository's framework and test conventions. Scope the audit to the requested
feature, project, or repository; do not turn every implementation task into a
suite-wide coverage campaign.

## Evaluate evidence

- Map important observable behavior to assertions, including relevant rejection,
  boundary, cancellation, idempotency, concurrency, and error-recovery cases.
  Pick cases that matter to this code rather than requiring every category.
- Ask whether a plausible defect would make a test fail. A test that invokes a
  method without asserting its outcome, or mocks the behavior being tested,
  contributes little evidence even when it executes many lines.
- Separate missing tests from weak assertions, overmocked integration boundaries,
  unstable shared state, and infrastructure failures. Prioritize by impact and
  likelihood rather than uncovered line count alone.
- Use real infrastructure where provider/transport semantics matter and isolated
  unit tests where they suffice. Do not duplicate an identical assertion at
  every layer merely to increase test counts.

## Coverage and mutation analysis

Use [dotnet-test-execution](../dotnet-test-execution/SKILL.md) to collect or
interpret compatible reports. Distinguish line and branch coverage; check
filters, generated code, target mapping, and whether the data matches current
source. Coverage is an execution measure, not proof of effective assertions.

Enforce the shared [non-regression contract](../orca-feature-workflow/references/testing.md):
compare verified base and candidate reports with the same collector, test/source
scope, configuration and filters. Neither line nor branch coverage may decrease
in changed modules or measured project/repository aggregates. Meaningful new
feature tests are required even if the total percentage increases. Missing or
incomparable evidence is unresolved; never hide decreases with exclusions,
weakened assertions, skipped tests or a lowered baseline/threshold.

Use existing mutation tooling when requested or useful for an ambiguous gap.
First establish a passing baseline, scope the mutation run, and inspect surviving
mutants for meaningful behavior versus equivalent changes. Do not install or
run an expensive repository-wide campaign by default. A manual counterexample
is a hypothesis until executed and must not be reported as a mutation score.

For a CRAP calculation on a named method/class/file, use
[crap-score](../crap-score/SKILL.md). Do not estimate coverage to manufacture a
score or present a project average as the answer to a named-method request.

## Produce an actionable result

For each material finding, identify the behavior at risk, the existing evidence,
the missing/weak assertion, and the smallest test that would expose the defect.
If asked to implement, use [dotnet-unit-testing](../dotnet-unit-testing/SKILL.md)
or [dotnet-integration-testing](../dotnet-integration-testing/SKILL.md) and run
the affected tests. State what was executed versus inspected, report blockers,
and avoid arbitrary coverage quotas or a test-count target.
