# Executor worktree isolation

The live Run inspection found three dispatched Orca executors (#905, #872 and
#906) in `CaptainPowerTurtle/subscription-purchase`, the coordinator's feature
checkout. The old skill requested `new-child`, but `orca_dispatch` forwarded any
worktree selector. Running workers, files, branches and assignments were left
untouched during this change.

## Managed dispatch behavior

- A new executor defaults to `new-child`; explicit shared/existing/top-level
  placement is rejected before worker-start. Integration workers follow this
  same rule and combine accepted snapshots in their own child checkout.
- Follow-up reuse requires an exact child ID plus a settled, reclaimable terminal
  owned by the coordinator's bound Run. Checks verify direct parentage, project,
  a distinct branch and current terminal/resource ownership. Active, released,
  foreign or ambiguous multi-terminal ownership is refused.
- Reuse reads the full paginated inventory. Incomplete/repeating pages cannot
  authorize a launch. Concurrent reuse requests in the same extension are
  serialized; Orca's terminal claim remains the final authority at worker-start.
- Reviewers and other non-editing roles can target explicit existing snapshots.
  Native OMP helpers continue sharing their owning executor's checkout, with
  file ownership and dependency ordering.
- Final review and publication target the exact integrated child checkout.
  The coordinator does not edit or merge code in its own checkout.

These checks cover the managed OMP dispatch tool, including its mounted XDev
transport. They are behavioral workflow enforcement, not an OS restriction on
manual shell commands or an already-running older extension.

## Validation and activation

Two behavioral regressions failed before the guard and passed after it. Added
coverage includes unsafe selector rejection, default child placement, valid and
invalid reuse, cross-Run/branch/parent ownership, hidden active occupants on later
pages, incomplete/repeated cursors, simultaneous reuse and metadata-read failures.
Read-only review placement remains covered. The extension suite passed 36 tests;
the full repository suite passed 234/234 and `npm run check` passed.

Dispatch/metadata tests use controlled Orca receipts; this change did not launch
real application workers or provision a sandbox. No validation ran against the
active Monorepo checkout. The public worktree record field names were inspected
read-only against the active Orca runtime.

`npm run deploy:local` published the immutable workflow assets before updating
the watched plugin entry. The plugin was reloaded with its unchanged approved
capabilities and reports running. To activate the new workflow in the existing
sandbox, finish current work, close OMP sessions, use Teck sandbox → Updates →
Update Teck.Monorepo, and reopen/resume OMP. Existing mixed changes are not moved,
reverted, committed or attributed to individual workers automatically.
