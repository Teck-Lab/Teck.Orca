# One floor per project

Each project/repository has one floor, combining all its Orca Runs, coordinators,
workers and native helpers across execution hosts. Runs and hosts do not create
additional floors. Overview is an aggregate view of all projects. Coordinators
remain in the office and dispatched sessions in the sandbox cloud on that floor.

Project identity uses the project label supplied by the observer. Distinct repos
must have distinct labels; the current event contract has no canonical repo ID.
Native descendants follow their root session, including late parent discovery.
Existing host-specific project and Run selections migrate to their project floor.

The global stream continues updating hidden projects. Scene, feed, whiteboard,
meetings and counters follow the selected project. Host health follows the hosts
observed for that project and remains visible if its selected floor becomes empty.
Changing a Run within a project does not move the family to another floor.
Switching floors clears selection and resets the camera without controlling agents,
worktrees or sandboxes. Disconnected views remain disconnected after switching.

Validation: 92 focused tests passed, including 13 floor tests for cross-host/Run
grouping, saved-selection migration, native families, hidden activity, meetings,
offline hosts, reconnect/replay and safe DOM text. Typecheck and production build
passed. No visual browser inspection was performed. Refresh an open Office page.
