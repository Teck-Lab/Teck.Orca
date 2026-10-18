# Native Docker SSH wake investigation

Investigated with Docker Sandboxes v0.48.0-rc3 and Orca 1.4.224 on Windows.
This is a disposable prototype, not a production recipe migration.

## Docker capability

Docker documents native local SSH at `<sandbox-name>.sbx`. Connecting starts an
existing stopped sandbox. The SSH ProxyCommand uses Docker's local daemon pipe
on Windows, or socket on Unix; it needs no guest SSH server or network SSH port.
SSH can forward a host loopback listener to guest loopback port 6768.

A v3 kit's `com.docker.sandbox/lifecycle@1` startup hook runs on every sandbox
start. A disposable mixin uses that hook to invoke our existing
`manage-daemon.mjs` as the agent user, reading the previously recorded pairing
endpoint. It skips first boot before the checkout and daemon metadata exist.
Its output is private because it contains a pairing offer. Startup hooks run
alongside the agent, so clients must wait for RPC readiness.

Sources:

- [Docker SSH integrations](https://docs.docker.com/ai/sandboxes/integrations/)
- [Kit lifecycle hooks](https://docs.docker.com/ai/sandboxes/customize/author/)
- [Published-port persistence](https://docs.docker.com/ai/sandboxes/workflows/development/)

This is wake on connection, not a local reboot autostart setting. Docker must
be available and signed in. No documented local reboot autostart option was
found in the installed settings. Docker's cloud autoResume is a different
feature and does not apply to these local VMs.

## Orca integration boundary

The installed app supports independent SSH access to an already paired daemon.
Its native `runtimeEnvironments:linkSshAccess` route verifies runtime identity
and pairing authority, retains the old endpoint and adds an SSH tunnel endpoint.
It does not require replacing our bundled daemon with the desktop SSH relay.

However, this is not currently an automatic recipe/plugin integration:

- Recipe results accept either `connection.type: ssh` or `orca-server`; the SSH
  result has no field to link an existing paired daemon.
- The public plugin host API exposes workspace context, terminal text,
  notifications, plugin storage/settings/secrets and event subscriptions. It
  does not expose SSH target registration, paired-server SSH linkage, endpoint
  replacement, workspace resume or a Retry hook.
- Settings has an `SSH access for paired servers` control, but its environment
  selector filters out `source: ephemeral-vm`. Our feature runtimes have that
  source. Therefore this control is not a supported manual shortcut for our
  existing recipe-created runtimes in this build.
- A plain SSH recipe uses a different runtime ownership path. Merely switching
  the result to SSH does not prove our daemon, worktrees or previous CLI
  permissions will remain intact.

These limitations were checked against version-matched installed source,
including the recipe result schema, public plugin host API, Settings environment
filter and native SSH-access coordinator. No internal route was called, and no
desktop store, SSH target or global SSH configuration was modified.

## Validation and proposed next step

The final successful disposable probe stopped a feature VM, then used SSH
alone to wake it. Docker's native startup hook restored the bundled daemon;
the guest `worktree.list` RPC and original host pairing both worked. The fixed
published endpoint and an uncommitted file survived. RPC readiness took 5203 ms.
Managed parent/child worktree IDs and parentage survived. A second cold stop was
woken by SSH local port forwarding alone; a paired client through that tunnel
and the original published endpoint reached the same restored runtime. The
test VM and its ownership record were removed.

Report:
`.artifacts/smoke/teck-native-ssh-d0c9baeb-3d06-4cb0-b7eb-8c979927d6e8/result.json`.

The recommended transport is native Docker SSH to the same bundled Orca daemon.
For automatic built-in Retry, Orca needs to expose paired-daemon SSH transport in
the recipe result or public plugin API, including SSH target ownership and
endpoint refresh. Without that, a plugin-owned transport helper remains needed.
Adding a Docker startup hook alone does not make a desktop WebSocket retry
initiate SSH or fix a previously saved Windows-excluded host port.

This probe is not evidence of full PC reboot recovery, OMP process survival, or
built-in desktop Retry recovery. Workspaces and OMP session records can persist;
processes killed by VM stop require session restoration separately.
