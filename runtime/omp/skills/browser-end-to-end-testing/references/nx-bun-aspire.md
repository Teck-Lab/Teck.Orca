# Nx + Bun + Aspire + Playwright

Use this design for the selected new Nx/Aspire repository. Respect an existing
repository's harness instead of automatically migrating it.

## Responsibilities and Bun

- Bun owns dependency installation and the committed bun.lock (or an existing
  bun.lockb). Pin packageManager and use bun install --frozen-lockfile in CI.
  Do not introduce package-lock.json or pnpm/yarn lockfiles from copied examples.
- Nx owns project dependencies, affected selection and build/lint/test targets.
  Use workspace-installed tooling, e.g. bunx nx run <project>:<target> or its
  existing bun run script. Restore pinned dependencies first; do not let a
  missing local executable silently become an unpinned download.
- Aspire owns the running application and infrastructure resource lifecycle.
- TypeScript Playwright via @nx/playwright owns browser assertions and reports;
  xUnit owns C# unit and integration tests. Keep Nx plugins version-compatible.

Bun as package manager does not require forcing every tool to run under Bun's
JavaScript runtime. Preserve supported executable/shebang behavior for Nx and
Playwright; do not add --bun or replace the Playwright runner with bun test.

For Nx frontend hosting, use CommunityToolkit.Aspire.Hosting.JavaScript.Extensions.
Model the workspace with AddNxApp and each runnable frontend with AddApp. Use
WithBun and WithPackageManagerLaunch; the integration launches Nx through bunx.
Configure endpoints, allocated port mapping and readiness for each app. Verify
APIs against the pinned toolkit package, not an arbitrary example version.
Restore once per workspace: use WithBun(install: false) when CI/setup already
performed the frozen install; use install: true only when Aspire owns restore.

## One startup owner

The E2E invocation must own one bounded Aspire lifecycle and one Playwright run.
Use an existing fixture or supported Playwright setup/teardown integration.
For a new TypeScript suite without a .NET lifecycle owner, use the documented
Aspire CLI with exact AppHost targeting and worktree isolation. Record run
identity and endpoints; do not discover a random globally running AppHost.

Start the stack, wait for required health, resolve the frontend URL, then launch
the browser tests. Keep dynamic endpoint handoff in environment or a per-run
ignored file. Do not read a stale URL at Playwright config-import time before
startup has finished. Capture logs/traces and dispose owned resources on success,
assertion failure, setup failure and cancellation. Use a bounded owner/finally
cleanup path; a detached start or a teardown hook that never ran is not cleanup.

Aspire may invoke nx serve <frontend>. That leaf target must only serve the
frontend, never start Aspire or depend on the E2E task. Disable any generated
Playwright webServer startup that would launch a second copy. Do not have an
E2E wrapper recursively invoke its own Nx target. Validate the actual target DAG.

Reuse one environment for a suite where test data is isolated. Give each concurrent
suite/worktree unique database, queue, identity and artifact namespaces. Limit
full-stack concurrency; Nx task parallelism multiplied by Playwright workers and
shards must fit the machine. Every independently scheduled shard needs a defined
environment owner; do not assume a setup project runs globally across CI agents.

## Affected selection and caching

Represent the .NET services, gateways, AppHost and relevant libraries in Nx's
project graph using the repository's supported plugin/configuration. E2E projects
must depend on the components they exercise, including backend code, auth config,
migrations and deployment inputs where applicable. Use explicit dependency edges
where inference cannot see runtime relationships. Target dependsOn controls task
ordering; it does not replace missing project dependencies for affected selection.

Verify selection using representative changed files: frontend, gateway, service,
shared contract, AppHost and migration. Also verify an unrelated project does
not unnecessarily select every journey. Use the real PR base/head in CI.

Keep build/unit caching with complete declared inputs and outputs. Start/stop,
live-environment probes and the default full-stack E2E target are non-cacheable.
Treat opt-in hermetic test caching as a separate decision with full provenance;
never report a cache replay as a freshly executed acceptance run. Include package
locks, SDK/tool versions and dependency configuration in appropriate task inputs.
Keep auth state/secrets out of cache artifacts. Skip-Nx-cache verification must
still establish that the intended tests ran rather than selecting zero tests.

## Test lanes

Expose separate discoverable targets for unit, service integration, browser E2E
and Kubernetes deployment tests. Testcontainers owns real dependencies for new
service integration tests; Aspire owns application E2E and the KIND test profile.
Do not start Aspire for the service integration lane. Names follow repository conventions. Run fast
checks for each implementation slice, affected integration as boundaries change,
and relevant E2E once the feature is assembled. Use the optional Aspire KIND
profile only when cluster behavior is part of acceptance; see
[KIND deployment testing](../../dotnet-integration-testing/references/aspire-kind-testing.md).

Sources:
- https://aspire.dev/integrations/frameworks/nodejs-extensions/
- https://nx.dev/docs/technologies/test-tools/playwright/introduction
- https://nx.dev/docs/features/ci-features/affected
- https://nx.dev/docs/kb/configure-inputs
