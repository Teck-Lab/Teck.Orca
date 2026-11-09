# Sandbox agent activity correction

The desktop plugin's `agents.list` returned no agents while the project's remote
Orca runtime reported a working OMP terminal and a live OMP subagent. In Orca
1.4.248 the API projects the focused workspace against the desktop hook server's
local status store. It does not provide the remote runtime's full child reports.
The original worker also refreshed this list only on events, leaving manual and
timer refreshes unable to correct it.

The plugin now reads the public `orca worktree ps --limit 1000 --json` on each
owned running sandbox. A fixed guest script projects only agent identifiers,
display labels, state, workspace and child observations before returning data.
Prompts, terminal output, tool inputs, transcripts and credentials are not sent
to the panel. It rechecks the exact sandbox ID and running state before exec,
does not execute in stopped/missing/replaced VMs, and does not provision anything.

Activity covers the project sandbox workspaces, explicitly labelled in the panel,
with a workspace column and distinct subagent rows. It refreshes on every manual
refresh, timer and workspace/status event, independently of version/KIND probing.
Failed reads produce a warning instead of an apparently successful empty list.
Children without live observations are unconfirmed rather than shown working.

Validation:

- All 196 repository tests passed, including ownership fencing, parent/child
  projection, stale child reports, partial failure, polling and manual refresh.
- All three Orca SDK panel tests and four render scenarios passed without issues
  or warnings. Strict TypeScript checking against the 1.4.248 declarations passed.
- The source collector successfully read the existing live project runtime.
- The installed development plugin was refreshed with its existing access grants;
  no capability, command or hook was added. A real `sandbox.status` request returned
  both working OMP agents in `jiaolong` and no activity error.
- A real settled panel screenshot was inspected and showed both working rows and
  their workspace. The earlier subagent observation had ended by this capture;
  child rendering was verified by the SDK interaction test and its source shape
  was confirmed against the remote CLI's earlier live response.

Ignored evidence files include `.artifacts/activity-panel-after.json`,
`.artifacts/activity-panel-live.png`, `.artifacts/activity-unit-tests.log` and
`.artifacts/plugin-ui-check.json`. No agents or sandbox processes were restarted,
and no application repository was modified.
