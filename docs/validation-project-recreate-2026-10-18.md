# Deleted project sandbox recreation, v0.5.3

The user deleted the project sandbox, closed and reopened Orca, then selected
the project recipe for a new workspace. Docker's inventory was empty and Orca's
saved host list contained only the local machine, but Teck's ready ownership
record still referenced the deleted provider ID. The previous guard refused
both resume and explicit new-workspace creation.

New-workspace creation now permits recreation when a successful provider
inventory confirms that both the project sandbox name and its recorded provider
ID are absent. It archives the old metadata directory under
`~/.teck-orca/projects/retired/`, then follows normal first-use provisioning.
The archive is excluded from startup recovery. A renamed provider ID, foreign
sandbox under the same name, changed clone URL or malformed inventory remains
refused. Stopped sandboxes remain present and are reused normally.

Resume never grants recreation and passes its original provider ID into the
provisioning lock. This prevents an old workspace from adopting a new sandbox,
including when recreation races the initial resume identity check. Missing
ownership records produce an actionable new-workspace message. Old listeners
close when their project metadata is retired or its provider identity changes.
Transport ownership records also include the provider ID.

Validation:

- All 60 Node tests pass. New regression cases exercise concurrent recreation,
  metadata archival, renamed/foreign providers, failed recreation rollback,
  malformed inventories, old-workspace resume and the resume/create race.
- A real local transport helper released its loopback listener after archival
  while its simulated desktop owner remained alive. This uses mocked provider
  data and does not create or wake a sandbox.
- Build and generated package checks pass.
- For the user's deleted Monorepo sandbox, the exact provider ID was checked
  against Docker inventory. Its stale helper process was matched to the recorded
  PID, port and installed transport executable before being stopped. Only that
  project's metadata was archived. No Orca connection removal was needed; its
  host list was already local-only and its historical VM records were cleaned.
- Setup installed release
  `305be93507de0876cf0f1f5158007db64bf9b97f719ec23f16673d9f48e39d03`.
  The runtime retains the eight-CPU/16-GiB defaults, OMP fresh-pane fix and the
  approved registry/download network rules.

No replacement sandbox or workspace was created during this fix, and no desktop
control was used. The user refreshes the plugin and initiates a new workspace
through Orca. Archived metadata contains diagnostics and ownership information,
not the deleted VM's files, worktrees or conversations. A new sandbox is a fresh
clone and runtime; this change does not recover deleted sandbox data.
