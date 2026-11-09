# Sandbox panel: storage, agent detail and maintenance

Implemented in the existing plugin; Orca remains pinned to 1.4.248 and OMP to
18.16.0. No application repository was changed.

## Product behaviour

- Overview separates root storage from Docker/KIND image/container/volume
  storage, with percentage-used meters and explicit used/free/total figures.
  Usage of 85% or higher raises a warning. These readings do not prune anything.
- Agents groups native helpers under their parent and reports workspace,
  current-state duration, last reported tool and report age. An old report is
  called out without claiming the process is stalled.
- Issue URLs come from an exact live Orca Dispatch/Task assignment or an explicit
  workspace issue. Dispatch ownership, terminal incarnation and task association
  must match. Child inheritance and workspace links are labelled separately;
  no issue is guessed from prose, a branch or a display title. Issue lookup has
  a bounded time budget and partial failures do not hide agent activity.
- Updates starts an asynchronous operation for the selected owned sandbox.
  Duplicate clicks share its job. The plugin rechecks ownership/running state,
  and both host and guest refuse maintenance while OMP processes are open.
  It never stops an agent, KIND or the sandbox and does not restart the daemon.
- The guest stages and verifies a pinned OMP npm installation when necessary,
  retains the old runtime and activates the chosen prefix through the managed
  launcher. It applies the same managed workflow set as normal recipe reuse,
  atomically replaces managed files, and restores their previous bytes on error.
  Model/MCP configuration, credentials, conversations and project files are
  excluded. Reopening OMP loads the new version and guidance.
- Orca server updates remain desktop-managed. Image packages and resource/disk
  limits are identified as requiring a separate recreation; this action never
  recreates a sandbox.

## Validation

- All 201 repository tests passed, including payload checksums/path restrictions,
  process detection, ownership fencing, shared workflow digests, async update
  deduplication, input isolation, issue-link projection and state freshness.
- Six native Orca SDK interaction tests passed. Eight render scenarios cover
  normal, fresh, unavailable, stopped, agents, updates, updating and low-storage
  states with no SDK warnings. Strict TypeScript and generated package checks
  passed.
- Three separately created disposable workloads exercised a real versioned npm
  install, repeat maintenance and preservation of sentinel model/MCP config,
  saved conversation and project files. All refused maintenance with an OMP
  process open. The final test deliberately placed a symlink at a managed target
  late in the apply operation and verified rollback of every previously changed
  managed file, preservation of the project sentinel, and release of the lock.
- All disposable workloads were removed and pre-existing sandbox identities
  were retained. Their ignored reports are
  `.artifacts/smoke/teck-orca-f-d24fee67aeac/result.json` and
  `.artifacts/smoke/teck-orca-f-fcffe9e307c9/result.json`.
  The final launch-fencing check is recorded under
  `.artifacts/smoke/teck-orca-f-8eb81b7019ea/result.json`; it also verified that
  the original shell wrapper refuses a new OMP launch while maintenance is active.
- A read-only probe of the running project verified separate root/Docker disks,
  actual OMP process counts, current server/OMP versions and agent metadata.
  Maintenance was not run against the user's project.

The shared managed-file definition is `runtime/workflow-assets.mjs`, mirrored
by build into the native SSH runtime. CLI skills, daemon version and the user's
running sessions were not changed by these panel checks. Visual artifacts and
the isolated desktop test profile are ignored under `.artifacts/`.
All three views were inspected in a separate hidden desktop at narrow width,
using fixture agents/issues and a mock updater. Test controls were confined to
an ignored copy of the plugin. Hidden-window captures sometimes returned a
previous frame/theme; matching captures were inspected rather than treating the
API's success response alone as visual proof. The live user's Overview was also
inspected. The production profile and active sessions were not used for UI actions.
