# Kit builder capacity and lifetime, v0.5.4

The user's first project creation reached the workload's final flattening stage
and failed with `no space left on device`. The shared `sbx-kit-builder` had been
removed during the requested sandbox cleanup. Docker recreated it with its
default 10 GiB engine-store volume. The project sandbox's eight CPUs and 16 GiB
RAM did not increase that separate build disk. Host C: had over 500 GB free.

The build-only sandbox was recreated with `volumeSize=40g`; its `/var/lib/docker`
filesystem reports 41,956,900,864 bytes total. No project sandbox was created.
The repair discards only the failed builder's cache. Its replacement provider
ID is `e4032794-d9bf-4451-a5e3-c3ffe80bd455`.

The first live validation exposed an additional lifetime issue in the manually
created builder. Short diagnostic exec sessions scheduled Docker's 30-second
auto-stop, interrupting BuildKit with exit 137. Daemon logs confirmed automatic
shutdown rather than a disk failure. `sbx run --detach --name sbx-kit-builder`
made the existing builder detached without replacing its new volume or cache.
The repair script now performs that step too.

Before creating a project sandbox, the runtime now serializes builder readiness
across projects. It creates an absent shared builder with a 40g volume, verifies
the built-in builder identity, starts it detached, rechecks the provider ID and
checks actual disk capacity. Existing undersized or full builders are retained
with an actionable error; the runtime never removes or prunes their cache.
Minimum capacity is 32 GiB total and 12 GiB available build headroom. Setup also
checks existing builder capacity without creating a builder. The standalone
repair helper defaults to 40g.

All 65 Node tests pass, including concurrent first-use builder creation,
preservation of existing builders on capacity failure, invalid inventory and
disk-output refusal, confirmed detached ownership and early project creation
refusal before a project ownership record is written. Build and generated
package checks pass. The new readiness function also passed against the live
builder without changing its provider ID.

Setup installed release
`474a6c38640491c506179db7cd029d49c979f0be17ccf5a7130c5a152cfa5a4f`.
Live workload validation uses `sbx kit inspect` against the exact immutable
workload directory from the user's failed recipe. This builds and resolves the
kit without creating a project sandbox or workspace. Logs and descriptor output
are under `.artifacts/builder-repair/`. The previously failing final filesystem
copy passed, and OCI layer export and tarball transfer completed successfully.
The successful workload build took 4m13s. The exported manifest is
`sha256:373922644053dbf0da34043bc17f41bea574f4283b49fc86959cfc9def781217`.
The OmniRoute, MCPHub and Orca daemon mixins also resolved successfully. Final
installed-kit and capacity checks are recorded in the result report.

No desktop control is used. A successful kit build does not claim that the
desktop's entire workspace-creation flow or OMP startup was exercised during
this repair; the user initiates that through Orca.
