# Aspire application E2E fixtures

This reference belongs to assembled application E2E, including API-only journeys.
New service integration tests use Testcontainers for dependencies and, where
needed, WebApplicationFactory; do not start Aspire at that layer. Keep an existing
repository harness intact unless a migration is part of the task.

Aspire orchestrates processes and dependencies; it does not replace the test
framework or browser driver. Inspect the project's SDK/package pins and existing
AppHost before selecting APIs. Consult the official testing documentation for
the installed version. The bundled official `aspire` skills cover interactive
app lifecycle, wiring and diagnostics. .NET-owned test AppHosts use the testing
API. TypeScript Playwright suites can instead use an exact-target CLI lifecycle;
see [Nx, Bun and Aspire](../../browser-end-to-end-testing/references/nx-bun-aspire.md).

## Choose the smallest useful environment

- One service and real persistence: WebApplicationFactory plus a Testcontainers
  database/broker is usually sufficient. Verify committed state using a fresh
  connection/DbContext, not merely the entity still tracked by the request.
- Assembled API E2E across services/gateway: a .NET-owned suite can use
  Aspire.Hosting.Testing to build and start the intended AppHost. Assert actual
  HTTP/message outcomes; do not replace the
  very service boundary under test with a fake.
- Browser journey: the same Aspire fixture can provide reachable frontend and
  gateway endpoints to Playwright. WebApplicationFactory's default in-memory
  TestServer is not a network endpoint that an external browser can reach.
- Kubernetes/operator correctness (for example CNPG recovery): keep a real
  isolated cluster test. An Aspire-managed PostgreSQL container cannot verify
  Kubernetes resources, CNPG reconciliation, Istio or gateway manifests.
  Aspire can also own the cluster through its optional
  [KIND testing integration](aspire-kind-testing.md).

## Fixture lifecycle

1. Use `DistributedApplicationTestingBuilder.CreateAsync<Projects.AppHost>()`
   with the actual generated AppHost type, then `BuildAsync` and `StartAsync`.
   Reuse the repository's fixture and match the installed test framework's
   async lifecycle. Do not also run `aspire start` for this test-owned stack.
2. Configure test parameters and dependency isolation before building/starting.
   One owner creates and disposes each dependency. Do not independently start
   matching Aspire and Testcontainers copies of the same resource. Existing
   mixed harnesses are valid when ownership is explicit.
3. Wait for required resource health with bounded cancellation using the
   supported ResourceNotifications API (such as WaitForResourceHealthyAsync).
   Discover endpoints from the running application via CreateHttpClient or
   GetEndpoint; do not hardcode dynamic ports or copy an endpoint from another
   worktree. Apply production migrations where persistence is under test.
4. Exercise the selected boundary. Bound eventual-consistency assertions with
   useful diagnostics; arbitrary sleeps and HTTP 200 alone do not prove the
   committed business outcome. Capture logs/traces for failed requests.
5. Dispose the test-owned application on success, failed setup or assertion
   failure. Do not stop another developer/agent's AppHost. Avoid persistent
   development volumes in an ephemeral test fixture unless deliberately isolated.

The CLI's `--isolated` is a CLI option, not a guessed testing-builder API.
For test fixtures, explicitly isolate database/schema, broker queues, identities,
container/volume names and filesystem outputs using supported AppHost parameters.
Separate browser contexts do not isolate backend data. Share suite startup only
when tests cannot reset or overwrite one another's state. Bound heavy-stack
concurrency across workers to the sandbox's resources; unit tests can stay parallel.

## Evidence and scope

Record candidate revision, selected AppHost, test command/counts, resource
readiness and relevant failures. Use `dotnet-test-execution` for the runner and
coverage contract. Coverage of the test harness does not establish coverage of
out-of-process services; configure collection for those processes or report the
limitation. MCP inspection is useful diagnosis, not a substitute for test assertions.

Official references:
- https://aspire.dev/testing/overview/
- https://aspire.dev/testing/write-your-first-test/
- https://aspire.dev/testing/manage-app-host/
