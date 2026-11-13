---
name: browser-end-to-end-testing
description: Write and debug repeatable Playwright browser tests of user journeys through the real frontend, gateway, services and persistence. Use for assembled feature acceptance or browser regressions; use unit or API integration tests for isolated logic and service boundaries.
---

# Browser end-to-end testing

Inspect the repository's browser suite, frontend, authentication, gateway and
startup harness first. Reuse its runner and conventions. For a new Nx + Aspire
repository, prefer TypeScript @playwright/test with @nx/playwright, retaining
Bun as the package manager. Read [Nx, Bun and Aspire](references/nx-bun-aspire.md)
for task ownership, startup and affected selection. Backend tests remain C#.
A .NET-owned browser suite can use Microsoft.Playwright.Xunit.v3 instead;
do not migrate an existing suite or duplicate journeys in both languages.
Confirm package/runner compatibility before adding it.

## Define observable acceptance

Translate the feature into a user action and visible result, including the
material rejection or authorization case. Define this scenario during planning,
implement fast unit and focused integration checks as the feature is built,
and run the whole journey against the assembled candidate before acceptance.
For browser-specific bugs, reproduce the defect in the browser test first.

Example: sign in, change an address, save, reload, and observe the persisted
address. A request completing or a transient success toast alone is insufficient
if durable state is the requirement. Test important roles and tenant boundaries
where the feature changes them; do not exhaust every input combination in E2E.

## Start the real stack

For Aspire applications, use the repository's test-owned lifecycle: a .NET
Aspire.Hosting.Testing fixture or the bounded CLI lifecycle described in the
Nx reference for TypeScript suites. Read
[Aspire test fixtures](../dotnet-integration-testing/references/aspire-testing.md)
when the owner is .NET. Do not start the same stack through both mechanisms.
For exploratory diagnosis of an existing running app, load the official `aspire`
skill and discover the correct AppHost/endpoints. Avoid creating a second stack.

Reach the actual frontend and intended customer/admin gateway over HTTP(S),
with real service/database dependencies for the claimed journey. Do not intercept
API calls or fake auth to claim full end-to-end success. Stub external third-party
services only when outside the acceptance boundary and record that limitation.
If testing real sign-in, exercise the configured identity provider and redirects;
other scenarios can reuse separately verified authenticated storage state.

Use service readiness checks before browser navigation. Keep one stack owner per
suite, discover dynamic endpoints and give parallel workers isolated test data.
Tests must not reset a shared database used by another suite or developer.
An Aspire process environment verifies app behavior; tests of Kubernetes routing,
mesh policies or manifests must also run against the intended cluster environment.

## Write stable tests

- Use role/name/label locators or deliberate test IDs. Prefer user-facing
  semantics over DOM structure, generated CSS classes or pixel coordinates.
- Use Playwright's auto-waiting assertions and bounded navigation/action timeouts;
  avoid fixed sleeps and using network-idle as a universal readiness signal.
- Create a fresh browser context per test. Reuse browser processes where the
  runner supports it. Isolate backend data as well as cookies/local storage.
- Assert visible outcomes, navigation and persisted behavior. Put exhaustive
  business-rule variants and DB internals in unit/integration tests.
- Use the Playwright-supported browser installation matching its package version.
  An arbitrary preinstalled Chrome binary is not proof the test runner is ready.
- Keep regression tests checked in and runnable unattended in CI. Agent-driven
  exploratory clicks or screenshots alone are not the automated acceptance suite.

## Failures and handoff

Capture Playwright traces/screenshots and relevant browser console/network
failures, then correlate with service logs/telemetry. Keep credentials, auth
storage state and sensitive test data out of committed artifacts. Reproduce a
failure and fix its cause; retries must not conceal a flaky acceptance test.

Run the focused journey during development and the affected journey set against
the integration candidate. Report exact revision, environment, executed/passed/
failed/skipped counts, artifacts and mocked/excluded boundaries. Clean up only
owned test resources, including on failure. Follow the shared
[test-first contract](../orca-feature-workflow/references/testing.md).

References:
- https://playwright.dev/dotnet/docs/test-runners
- https://playwright.dev/docs/best-practices
- https://aspire.dev/testing/write-your-first-test/
