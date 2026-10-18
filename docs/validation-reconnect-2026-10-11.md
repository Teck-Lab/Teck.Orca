# Plugin reconnect command, v0.4.4

The plugin now contributes **Teck: Reconnect sandboxes** in Orca's command
palette. Select it after reopening Orca when sandbox connections are broken,
then select Retry in the disconnected terminal. This is a desktop plugin
command, not a command typed into the guest terminal or PowerShell.

## Recovery behavior

The plugin's Node entry verifies its installed immutable runtime before
registering the command. Activation alone starts no recovery process and makes
no changes. Explicit command invocation starts a local companion for the
desktop app's lifetime. It survives Orca's idle reaping of plugin workers and
exits after its desktop owner exits; it installs no login task or OS service.

The helper reads the default Orca profile's saved environments and ephemeral
runtime records and Teck's feature ownership records. It considers only owned
daemon-backed Teck features whose runtime records are `running` or
`resume_failed`, and whose recipe-owner lease is still present. Explicitly
suspended features, released owners, SSH recipes and manual environments are
excluded. Missing VMs are not recreated.

For an available saved connection port, the helper binds only IPv4 loopback.
A connection attempt wakes the exact existing sandbox, starts its installed
daemon if needed, discovers Docker's current published port and forwards the
opaque connection stream. Concurrent attempts for one feature share its wake
operation. Ownership is rechecked before waking; no configuration, skill or
image sync takes place. Forwarding does not decode or log websocket frames,
and does not replace pairing credentials. The existing saved pairing remains
valid against that feature's persisted Orca data.

If Docker already owns the feature's saved port, the command checks/starts that
daemon directly. Other occupied listeners are never replaced. A repeated
invocation can therefore report an existing bridge as occupied; the earlier
bridge keeps running. Diagnostics go to the plugin logs and a private bounded
temporary log. No Orca JSON store is edited. Guest writes are limited to the
daemon's normal readiness, log and runtime data during startup.

## Validation

- All six recovery regression tests passed: exact ownership and scope,
  credentials excluded from bridge inventory, stores unchanged, coalesced
  wake, no replacement provisioning, byte forwarding, occupied ports retained,
  direct-port ownership rechecks, and listener exit with its owner without VM
  lifecycle calls. The full suite passed before the final direct-port guard
  refinement; the complete recovery suite passed after that refinement.
- The installed Orca manifest/artifact/tree validator accepts the four-file
  v0.4.4 plugin package (9,142 bytes).
- Orca's actual installed plugin worker loaded the pinned plugin entry and
  registered its declared command. The activation-only probe invoked no
  command and made no host API call.
- A separate live test executed the command through that installed worker
  against an isolated desktop profile and generated feature VM. Notifications
  were acknowledged by the test harness, without showing a desktop notification.
- The test's original saved environment, including its previously observed
  daemon runtime ID, connected after a real VM stop. Its connection attempt
  woke the VM through the production helper. No fresh pairing code was given
  to that client.
- Docker's port changed from 60118 to 60119. The bridge preserved the saved
  address and the isolated Orca environment store remained byte-for-byte
  unchanged by the plugin command.
- Both worktree IDs, the child's parent link and branch, and an uncommitted
  marker survived. The new daemon process had a new runtime ID, as expected.
- The generated VM and recipe ownership record were removed. The companion
  exited with the test process. The user's existing VM stayed stopped, and
  its desktop environment/runtime records were not modified.
- All 12 official Orca guide files retain their original snapshot hashes.

Full-command evidence:
`.artifacts/smoke/teck-orca-restart-0b5ab97f-1089-4669-aebe-173f8cba44b4/result.json`.
The generated VM was `teck-orca-f-1b2a1abf2487`. Runtime release:
`02affa1f6c6283646101c9a65f0a3c5b83c408224bef160f3f9f6f2b056ce153`.
The final installed release is
`85faac9ec3c197c18d439302243451ab295a545489f7ca6814e52e49d7a74d9e`.
It adds a locked ownership recheck to the occupied/direct-port path and reports
its actual failure reason. The regression suite covers that refinement; the
live command test exercised the bridge path on the earlier release. The final
entry also passed the installed worker-loader and plugin validation checks.

## Limits

Orca 1.4.224 exposes no reconnect/startup event or environment-resume method in
its public plugin host API. Its worker controller activates plugins on demand.
Consequently the command must be selected once after reopening the desktop
when recovery is needed; this is not unattended recovery immediately after a
PC reboot. After listeners are established, native Retry traffic can wake the
covered VMs automatically. New features or direct connections can need another
invocation after a later stop.

The command currently reads the default desktop profile and default Teck
feature state location. Custom profile/state overrides are not supported.
Live validation was on Windows; platform path selection and Node networking
are implemented for macOS/Linux, but no live macOS/Linux run is claimed.

The test verifies the backend path used by saved-environment connections. It
does not click the terminal's Retry button, prove the GUI rematerializes every
old terminal pane, or resume an interrupted OMP turn. VM stop destroys live
PTY processes; preserved session files are a separate recovery layer.
