---
name: dotnet-unit-testing
description: Write and repair .NET unit tests using the repository's test framework, with xUnit v3 and NSubstitute guidance. Use for isolated behavior, boundary cases, and test doubles; use dotnet-integration-testing for databases, HTTP hosts, and containers.
---

# .NET unit testing

Inspect the nearest tests, project references, central package versions, and
repository instructions first. Preserve the established framework and assertion
library. An xunit.v3 package can have a 4.x package version; do not infer the
framework generation from the package major alone. Do not migrate frameworks or
add a mocking/assertion package just to follow an example.

## Choose a useful test

- Use unit tests for decisions, calculations, validation, and orchestration
  whose behavior can be observed without starting infrastructure.
- Identify an observable failure before writing the assertion. Cover relevant
  boundaries and failure paths rather than duplicating every implementation
  branch. For a bug, reproduce the actual defect when practical.
- Assert results or externally visible effects. Assert collaborator calls when
  the interaction is the contract, such as publishing a message once; avoid
  asserting internal call sequences merely to match the current implementation.
- Keep arrangements specific and readable. Prefer the repository's builders and
  fakes; avoid shared mutable test data and unnecessary fixture hierarchies.

## xUnit v3 and test doubles

- Use Facts for individual scenarios and Theories for meaningful input variants.
  Follow local naming and Arrange/Act/Assert conventions without forcing comment
  markers into every short test.
- Await asynchronous work and asynchronous exception assertions. Do not use
  async void, .Wait(), or .Result to drive asynchronous production code.
- Match lifecycle signatures to the installed framework. xUnit v3 IAsyncLifetime
  uses ValueTask initialization and disposal; v2 examples use Task. Inspect an
  existing fixture before copying either pattern.
- Use TestContext.Current.CancellationToken where supported by the installed
  xUnit version. Use fake time or the existing TimeProvider abstraction for
  time-sensitive behavior instead of wall-clock sleeps.
- When NSubstitute is already used, substitute interfaces at external boundaries,
  configure only relevant results, and verify received calls only where behavior
  requires them. Account for cancellation tokens in call matching. Prefer real
  value objects and collections over substitutes for every type.
- Use existing assertions; xUnit Assert is sufficient unless local conventions
  require something else. Do not introduce FluentAssertions, Moq, or MSTest into
  an xUnit/NSubstitute project as an incidental testing change.

## Validate and report

Read [dotnet-test-execution](../dotnet-test-execution/SKILL.md) to identify the
runner and run the smallest affected tests. Check that the intended tests were
discovered and executed. Broaden to the affected suite when integration risk
requires it. Report the command, counts, failures/skips, and any untested scope.

For SQL semantics, migrations, real transport behavior, or application wiring,
use [dotnet-integration-testing](../dotnet-integration-testing/SKILL.md). For a
coverage or behavioral-gap audit, use
[dotnet-test-quality](../dotnet-test-quality/SKILL.md).

Sources: [xUnit v3](https://xunit.net/docs/getting-started/v3/getting-started),
[NSubstitute guidance](https://nsubstitute.github.io/help/getting-started/).
