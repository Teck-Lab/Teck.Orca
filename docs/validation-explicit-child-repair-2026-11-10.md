# Explicit child dispatch repair — 2026-11-10

The existing sandbox had the current orchestration extension and issue-worktree
router, but an older `lib/orca-policy.mjs`. Its early placement validation rejected
an explicit child without a terminal before ownership reconciliation could run.
Supplying the released terminal instead correctly failed the later liveness check.

The host Office observer staged the orchestration extension without its complete
dependency set. The source fix already adds `orca-policy.mjs`,
`github-plan-scope.mjs`, and `issue-worktree.mjs` to that payload and requires the
complete set before installing the guard. This fix was deployed to the installed
host runtime as well as the sandbox; no image rebuild was required.

Validation:

- Orchestration, issue-worktree and Office-manager suites: 69 tests passed.
- Added a regression covering three legacy children, rejected automatic selection,
  rejected released-terminal reuse, rejected uncertain occupancy, and one successful
  exact-child launch without a terminal or new-worktree creation flags.
- All five orchestration module/dependency hashes matched the repository in the
  existing sandbox; importing the extension succeeded.
- A read-only live routing probe accepted the preserved #873 integration checkout
  without a terminal. The probe used a temporary copy of ownership records and did
  not call `begin`, `worker-start`, or alter the real ownership records.
- OMP's supported `/restart` command refreshed the waiting coordinator in the same
  terminal, preserving session `01a1bfd2-d0e1-740b-b7ad-833ae188d4f6` and its todos.
  OMP pauses the native goal during restart; continuing remains a user action.
- The installed Orca plugin returned to `running`, zero restarts, with no outstanding
  consent or integrity error.

No Teck.Monorepo source, existing checkout, or Task/Dispatch record was modified.
The feature's implementation and acceptance gates were not run by this repair.
