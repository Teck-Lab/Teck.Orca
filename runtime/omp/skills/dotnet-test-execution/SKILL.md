---
name: dotnet-test-execution
description: Run and diagnose .NET test suites and collect compatible coverage reports. Detect Microsoft.Testing.Platform versus VSTest, choose supported filtering/reporting options, and distinguish restore, build, discovery, infrastructure, and test failures.
---

# Execute .NET tests

Find the repository-owned test command first: CI, task runner, scripts, and
contributor instructions. Inspect global.json, the selected SDK, test project
references, inherited build properties, runsettings, and runner configuration.
The test framework and test runner are separate choices. An xUnit v3 project
may run with VSTest or Microsoft.Testing.Platform (MTP).

## Choose the command from evidence

| Runner | Scoped command shape | Filtering |
| --- | --- | --- |
| VSTest | dotnet test path/Tests.csproj | --filter 'FullyQualifiedName~Scenario' |
| Native MTP on .NET 10+ with test.runner configured | dotnet test --project path/Tests.csproj | Installed extension options, e.g. xUnit --filter-method '*Scenario*' |
| MTP bridged through older dotnet test | dotnet test path/Tests.csproj -- <runner options> | Confirm bridge support and runner help |

Use the repository's wrapper in preference to these examples. Check dotnet test
--help and the test executable's --help if runner options are unclear. Do not
assume VSTest --filter/--collect options exist in native MTP or that the --
separator is appropriate for every SDK. Some xUnit versions add a VSTest-syntax
--filter extension; use it only when the installed runner supports it. Preserve
SDK pins and runner selection. xUnit package 4.x uses --report-xunit-xml and
--report-xunit-xml-filename; older examples use --report-xunit. Unsupported
options can appear as a zero-test run, so inspect executable help before
treating that outcome as a test discovery defect.

Run the smallest affected project/scenario first. Verify discovered/executed
test counts, exit status, skips, and reports: a filter matching zero tests is
not evidence of correctness. Broaden to the affected suite after focused checks
pass when the change affects shared behavior. Reuse --no-build/--no-restore only
when the matching configuration and sources have already built/restored.

## Coverage is collector-specific

- With VSTest and an existing coverlet.collector reference, the usual shape is
  dotnet test path/Tests.csproj --collect:"XPlat Code Coverage".
- With native MTP and an installed Microsoft.Testing.Extensions.CodeCoverage
  extension, use the supported --coverage and --coverage-output-format options
  (for example cobertura). Older bridged MTP passes runner arguments after --.
- MTP-compatible Coverlet packages have their own options. Inspect package
  references and help; coverlet.collector alone is not proof of MTP support.
- Respect repository results directories and filters. Parse the actual emitted
  report, including GUID subdirectories, and establish source/run provenance.
  Never substitute guessed percentages or equate an omitted target with 0%.
- A missing collector is a tooling prerequisite. Do not migrate the runner,
  suppress tests, install global tools, or add packages to bypass it without
  task authorization. Reuse a repository-provided converter for binary coverage.

## Diagnose the failed layer

Separate restore/network/certificate failures, compilation errors, discovery or
runner incompatibility, Docker/image/readiness failures, and executed assertion
failures. Preserve the useful log and report from each failed attempt. Retry a
transient failure after checking its cause; stop repeating an unchanged failure.
Do not disable TLS, silently skip container tests, or broaden network policy as
a test-run workaround.

Report command and working directory, SDK/runner, executed/passed/failed/skipped
counts, report paths, and remaining blockers. Partial or failed runs can still
emit useful coverage, but must be described as partial or failed.

Sources: [dotnet test runners](https://learn.microsoft.com/dotnet/core/testing/unit-testing-with-dotnet-test),
[xUnit MTP options](https://xunit.net/docs/getting-started/v3/microsoft-testing-platform).
