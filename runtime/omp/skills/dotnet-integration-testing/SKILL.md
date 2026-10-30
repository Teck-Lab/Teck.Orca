---
name: dotnet-integration-testing
description: Write and debug .NET integration tests with WebApplicationFactory and Testcontainers, including database migrations, isolation, messaging, container readiness, and cleanup. Use when correctness depends on real infrastructure or application composition.
---

# .NET integration testing

Inspect existing integration projects, shared fixtures, package versions, runner
settings, and CI commands before adding infrastructure. Reuse the repository's
test host and fixture lifecycle. Keep unit tests isolated from containers; do
not replace existing infrastructure just to standardize an example.

Apply the shared [test-first and coverage contract](../orca-feature-workflow/references/testing.md)
at the real boundary: execute the new regression/acceptance scenario before
the fix, establish its behavioral RED, then implement and verify GREEN. A failed
image pull, unready service or missing dependency is not that RED. Preserve
comparable line/branch coverage and reuse fixtures for focused iterations.

## Define the boundary

- Use a real database for SQL translation, constraints, transactions, migrations,
  and concurrency behavior. EF InMemory and SQLite do not establish PostgreSQL
  or SQL Server compatibility.
- Use WebApplicationFactory when routing, authentication/authorization,
  serialization, dependency injection, middleware, or HTTP contracts matter.
  Exercise the application's entry point and override only the external services
  the scenario needs. Apply test configuration before the host starts.
- Direct database/handler tests can cover persistence without an HTTP host. Use
  a real broker when delivery, routing, serialization, or acknowledgement is the
  behavior; a mocked publisher only verifies the local interaction.

## Containers and lifecycle

- Prefer the matching Testcontainers module and the repository's pinned image.
  Avoid fixed container names, fixed host ports, host-path mounts, and latest
  tags. Obtain connection details from the started container's helpers.
- Wait for service readiness rather than sleeping for an estimated duration.
  Use bounded startup/test cancellation. A running process or open TCP port may
  precede a database or broker being ready for the actual operation.
- Give each resource a clear owner. Use the existing xUnit class/collection
  fixture or async disposal pattern; match v2/v3 lifecycle signatures. Keep the
  resource reaper enabled unless a documented environment requirement forbids it.
- Dispose resources even after initialization or assertions fail. Collect
  relevant container logs before disposal when diagnosing startup failures.
- In Orca feature sandboxes, use Docker Engine inside that feature sandbox.
  Test there as the non-root agent. Do not mount the desktop Docker socket or
  disable TLS/resource cleanup to make a test pass. Distinguish blocked image
  pulls and missing Docker permissions from application failures.

## Isolation and realistic state

- Shared containers reduce startup costs but do not isolate test data. Choose
  per-test databases/schemas, transactional rollback, or the existing reset
  helper based on how the application opens connections and commits work.
- Run production migrations when migration correctness matters. EnsureCreated
  does not validate those migrations. Run initialization before requests can
  race with it.
- Do not truncate/reset a shared database while another parallel test uses it.
  Use the fixture's collection serialization or genuinely separate databases.
  Do not disable all suite parallelism to conceal one shared-state problem.
- Give messaging tests separate queues/subscriptions and correlation IDs where
  appropriate. Bound eventual-consistency polling with a useful failure report;
  arbitrary sleeps do not establish message delivery or absence.
- Reuse existing reset utilities. Add Respawn only if the task calls for it and
  dependency changes are authorized; it is not a requirement for Testcontainers.

## Teck.Monorepo discovery hints

When working in Teck.Monorepo, inspect Directory.Packages.props, global.json,
tests/integration/Teck.Platform.IntegrationTests.Shared, and the nearest service
tests. The shared PostgreSQL/RabbitMQ fixture already manages database creation,
migrations, and table reset. Verify its current isolation and collection usage
before extending it. These paths are discovery hints, not requirements for
other repositories.

Use [dotnet-test-execution](../dotnet-test-execution/SKILL.md) for runner and
coverage commands. Report what crossed the real integration boundary, the
result, and cleanup status; discovery alone is not successful execution.

Sources: [Testcontainers practices](https://dotnet.testcontainers.org/api/best_practices/),
[xUnit integration](https://dotnet.testcontainers.org/test_frameworks/xunit_net/),
[ASP.NET Core testing](https://learn.microsoft.com/aspnet/core/test/integration-tests).
