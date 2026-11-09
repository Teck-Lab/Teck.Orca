# Portable plugin and v3 kits — 2026-11-09

Implemented source version 0.8.0. The installed/watched plugin and the active
Teck.Monorepo sandbox were not changed or restarted.

## Source and packaging

- `npm run validate`: isolated build, generated package checks and **328 tests
  passed**, with no skipped or failing tests. Log:
  `.artifacts/validate-v3-final.log`.
- Orca's installed CLI accepted the portable package and a fixture catalogue.
  The fixture used a deliberately synthetic test lock and is not installable
  release evidence. Real releases require actual signed OCI receipts.
- Portable packaging fits Orca's size/file limits, verifies bundled bytes and
  runs its native lifecycle from an empty runtime cache. Tests exercise the
  extracted prerequisite script and workflow assets without provisioning.
- Provisioning tests cover signature failures, missing/incomplete locks,
  immutable references, existing-sandbox reuse and retained ownership.
- Office role-guard refresh includes its complete relative helper dependencies;
  regression coverage prevents updating a guard without its required helpers.

## Actual amd64 image checks

All nine v3 component descriptors built successfully with Docker's v3 frontend
inside the separate `sbx-kit-builder` sandbox. Build contexts and logs are under
`.artifacts/kit-build-1794256620104` and `.artifacts/build-*-1794256620104.log`.
The base build exposed an absent upstream npm prefix; the component now uses an
explicit temporary build prefix and initializes the agent's runtime prefix.

An isolated smoke image assembled the built base and runtime mixin files. As
UID 1000, it verified:

- OMP 18.18.3, Bun 1.4.4, KIND 0.33.0 and kubectl 1.35.8.
- C#, TypeScript, C++, Python, Go and Java compilation/execution.
- All 15 configured language servers initialized, including Tailwind and OmniSharp.
- .NET and JavaScript debug adapters stopped at entry, verified breakpoints,
  exposed stack frames and evaluated a local variable correctly under Bun.
- Chromium launched, interacted with a local page and produced a valid PNG.
- Office's initialization script registered its MCP binding as the agent user.

The compiler smoke's Docker probe used only the isolated builder daemon. An
initial harness run omitted that socket; the corrected run passed. A redundant
debugger invocation used Node instead of Bun; rerunning it with Bun passed.
These were test harness corrections, not sandbox runtime changes.

Buildx image-rootfs tar export was verified against the workflow image. Unlike
container export it includes no injected Docker runtime device/hostname files;
the release audit uses this exporter without hiding genuine system paths.

## Release gates still outstanding

The release workflow has not been published/run against a source tag. Therefore
GHCR publishing, OIDC signing, arm64 builds, the real registry-backed composed
set and its complete filesystem audit remain unverified live. No real release
lock or installable catalogue entry has been generated.

The assembled smoke image does not prove Docker Sandboxes set installation,
credential injection, native SSH, fresh KIND/K3s startup or OMP/Office lifecycle
behavior. Validate those in a disposable sandbox from the signed candidate before
catalogue promotion. No active project should be recreated for that test.
