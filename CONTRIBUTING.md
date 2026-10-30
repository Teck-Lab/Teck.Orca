# Contributing

The bundled .NET testing skills live under `runtime/omp/skills/dotnet-*-testing`,
`dotnet-test-execution`, and `dotnet-test-quality`. Keep their sibling links valid
and follow each target repository's existing frameworks, fixtures, and runner.
Build refreshes their hashes and includes them in the runtime release.

For explicit live testing, run `npm run smoke:dotnet-tests -- --sandbox <running-sandbox>`.
This copies a pinned .NET 10/xUnit v3/NSubstitute/Testcontainers probe into a unique
sandbox temporary directory. It checks PostgreSQL connectivity and rollback,
then deliberately fails one test to verify cleanup on failure. The wrapper
expects that failure; success requires matching test counts and no leaked probe
containers. Reports go under `.artifacts/smoke/`. Project checkouts and OMP
sessions are not modified. This live check requires NuGet and Docker image access
and is separate from the portable Node CI suite.

`npm run smoke:workflow-policy -- --sandbox <running-sandbox>` is an explicit
model evaluation of issue selection and review routing. It sends the current
workflow guidance and nine synthetic scenarios to the configured OmniRoute
orchestrator model. Run it only with authorization for that transfer. It uses
an isolated temporary OMP profile with tools, extensions, rules, skills, memory,
and session persistence disabled; it creates no issues or Orca workers. Results
are saved under `.artifacts/smoke/`. It tests policy interpretation, not full
GitHub-to-PR delivery.

Edit the native provider in `native-ssh/src/`, the retained recovery lifecycle in `scripts/lifecycle.mjs` and shared source assets in `runtime`. Run `npm run build`, `npm test` and `npm run check`. Recipe commands and the doctor mirror are generated and should not be edited manually. No dependency installation is required for these checks.

Current provisioning lives in `native-ssh/src/provider.mjs` and is emitted by the main plugin. Root build/check/setup include its immutable runtime, and root npm test includes its provider suite. The independent preview package was removed; install only `plugin/`.

Older bundled-daemon project provisioning lives in `runtime/project-sandbox.mjs`; project ownership,
native SSH forwarding and login supervision are separate modules beside it.
`runtime/project-recipe.mjs` is invoked by Orca on first workspace use.
`scripts/project.mjs` is informational and must never provision or pair anything.
`npm run smoke:project` creates and removes a uniquely named disposable sandbox
to test cold SSH wake, the original pairing, OMP startup and persistent worktree
identity. Never run that stop/delete sequence against an existing user project.
Legacy feature recipes remain generated for existing snapshots but are no longer
offered by the v0.5.1 plugin. Do not convert feature records in place or add a
worktree destroy callback to a persistent project sandbox.

Keep recipe stdout restricted to the final JSON result. Route provider logs to stderr without pairing credentials. Preserve feature ownership verification and fail safely when worktree inventories cannot be read. Test the universal Node launcher through the Windows host shell and preserve UTF-8 stdin and exit codes. Bundle only distribution files, never an initialized Orca runtime profile.

Run setup and reinstall the generated `plugin/` folder, or refresh its Dev entry, after runtime changes. Point Orca to `plugin/`, never the repository root: Orca hashes the entire plugin tree with a 50 MiB limit, and the runtime binaries exceed that limit. Build and check validate that the package contains only its manifest, license and declared recipes; keep generated package files in source control. Record separately any live sandbox and Orca GUI tests. Do not add service tokens, private keys, host agent-home state, or a previously initialized Orca runtime to an image.
