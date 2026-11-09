# Shared project sandbox: GUI creation blocker

Status: the recipe integration is unresolved; a supported native SSH-host GUI
path exists, but parity with this setup's guest-owned orchestration is unverified. Investigated
against the installed desktop and guest Orca 1.4.237. No desktop registration,
sandbox, workspace or application binary was changed during this investigation.

## Required behavior

The user creates workspaces through Orca's normal GUI. First use creates one
project sandbox; additional workspaces create independent worktrees and OMP
sessions on that same sandbox and connection. Workspace deletion must retain the
shared project host. A user-facing CLI workflow is not an accepted substitute.

## Verified failure

The owned sandbox is reachable through its saved connection and contains a ready
project setup at `/home/agent/project`. The saved connection has
`source: ephemeral-vm` because Orca created it through the environment recipe.

The installed renderer explicitly excludes ephemeral runtime environments from
ready and not-yet-configured targets in the New Workspace run-target picker.
In the packaged `App-DNLXu91i.js`, `Hue` and `Uue` filter through `VT`; `VT` calls
the imported `isEphemeralVmRuntimeEnvironment` predicate, which checks precisely
that source field. The presence of a saved connection does not make it selectable.

Teck's `assertProjectUnpaired` then rejects another recipe invocation to prevent
the duplicate-connection problem. The advice to select that saved connection in
Run on is therefore impossible in this GUI. This is an integration design error,
not a restriction on the sandbox's ability to run concurrent sessions.

## Public interface limits

The installed recipe result supports a pairing offer or direct SSH connection;
it has no existing-environment selector or project-lifetime connection contract.
The plugin host API has no worktree-composer navigation, existing-host reuse or
environment-promotion method. Declarative command aliases also do not expose
workspace creation with a preset host.

Re-adding the same pairing cannot convert it: Orca's
`assertPairingReplaceableByAdd` explicitly rejects an environment owned by an
ephemeral workspace. Merely changing its source flag outside that API would
leave the recipe's workspace/runtime ownership and cleanup relationship
unresolved. Such a private metadata edit is not a supported migration.

## Supported native SSH-host route

The initial conclusion that GUI use required an Orca change was too broad.
[Docker's Orca integration](https://docs.docker.com/ai/sandboxes/integrations/orca/)
explicitly documents parallel agents in separate worktrees on an ordinary SSH
host. [Orca issue 13665](https://github.com/stablyai/orca/issues/13665) and
[documentation PR 25892](https://github.com/stablyai/orca/pull/25892) describe the
same path without product code changes. The PR is documentation, not a prerequisite
for this existing SSH transport support.

For the existing sandbox, the target is
`teck-orca-p-bc02e0548944.sbx`, username `_default_user_`, default port 22 and no
identity file. `ssh -G` confirms that Docker's managed SSH block resolves that
target through `sbx.exe ssh proxy %n` and its managed known-hosts file. This is
configuration inspection; a new native Orca SSH target was not created or tested.

The user adds the target in Settings > SSH > Add Target, tests and saves it, and
uses it in Run on. Orca installs its normal SSH relay and manages worktrees and
agent terminals on that host. This differs from Teck's current Docker SSH tunnel
to a separately paired, recipe-owned Orca server. Conflating those two paths led
to the incorrect global limitation claim.

The current design already uses Docker SSH. Its actual path is the desktop's
project loopback listener, OpenSSH via Docker's managed `.sbx` ProxyCommand,
guest loopback port 6768 and the existing guest Orca daemon. The guest `orca`
wrapper explicitly binds CLI calls to that daemon's private profile. This keeps
existing worktrees, terminal ownership and orchestration state in the sandbox.
The workload's separate Docker Engine is used for application containers and is
not the Orca orchestration service.

Do not replace that guest-owned runtime with the ordinary SSH relay merely to
make a picker entry appear. First verify orchestration, CLI routing and session
parity, or retain the current guest Orca daemon and Docker SSH transport while
addressing persistent host registration. The documented native SSH integration
establishes a GUI path, not completed migration/parity for this custom runtime.

Existing guest files, OMP conversations and active orchestration records must be
retained. Merely removing the guard or changing the saved connection's source
flag does not resolve ownership transfer. On-demand provisioning and the existing
metadata migration still need an implementation; do not claim the plugin or
migration is already fixed.
