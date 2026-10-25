# Native SSH preview 0.1.4 Kubernetes pilot - 2026-10-25

The native provider suite passes 21 tests, including shared project reuse,
non-blocking Kubernetes startup failures, and new VM disk sizing. The managed
workspace profile was bootstrapped through the actual native installer in a
separate mountless test VM. See [local Kubernetes validation](../docs/validation-local-kubernetes-2026-10-25.md)
for controller, concurrent application, delivery, successful cold restart and
cleanup evidence and limitations. Both test VMs were removed after validation.
This does not establish a new Orca GUI or OMP session recovery acceptance result.

## Native SSH Run on preview validation ? 2026-10-24

Preview 0.1.1 restores the required GUI workflow. The installed plugin remains
`teck-lab.teck-native-ssh-preview`; it contributes the recipe
**Teck OMP SSH Project (Preview)**. The earlier 0.1.0 Prepare commands and manual
SSH-host instructions have been removed. Refresh/reinstall the preview plugin.
All changes are under `native-ssh/`; the original plugin/runtime is untouched.

The missing Run on contribution was reproduced with a failing regression test.
The corrected preview suite passes **18/18** tests, including real Windows
host-shell invocation of the generated launcher, UTF-8 lifecycle input, strict
exit codes and rejection of a modified runtime. Provider calls are mocked.
An immutable checksum-verified snapshot is installed in the separate
`~/.teck-orca-native-ssh/releases/<digest>` store. No sandbox is provisioned by
build, check, tests, setup, plugin enablement or this investigation.

Behavioral checks cover: concurrent create/reuse, one physical VM and clone per
project, direct SSH recipe results, no pairing/daemon launch by the provider,
original provider identity on resume, no provider stop/delete on workspace sleep
or deletion, no OMP configuration overwrite on reuse, foreign-ownership refusal,
inventory failures, deleted-VM recreation, interrupted setup, invalid URLs and
resources, builder storage headroom, and preserved Orca environment/PATH.
A fresh VM receives a local `Teck OMP <teck-omp@agents.invalid>` Git identity
only if missing, for Orca project preflight. Publication remains governed by
the bundled GitHub MCP policy; no human host identity is copied.

The installed Orca 1.4.237 manifest/recipe/result validators accept the generated
plugin and native SSH connection shape. Live GUI registration has not been
executed. The earlier repository suite passed 70/70 and its generated assets
passed check; none of that source has changed during this preview correction.

Reference: https://github.com/mattjohnson/orca-sbx-recipes documents the
project-shared Run on recipe pattern and N hidden workspace-owned SSH records
for a shared VM. Its macOS/Linux sshd provisioning was not copied. This preview
uses the existing Node workload and native Docker `.sbx` SSH on Windows.

**Live acceptance is pending:** create two worktrees from Run on, confirm one
preview VM and the managed daemon/connection behavior, exercise OMP orchestration
and worker settlement, then restart Orca and test stopped-sandbox reconnect and
exact OMP continuation. Orca creates workspace-owned SSH targets itself; this
preview does not claim a single shared SSH target or prove cross-workspace
orchestration/reconnect behavior from mocked provider tests.

No desktop automation was used. No sandbox, SSH target, connection, worktree,
agent or model request was created. No existing sandbox was stopped or modified.
