# Dedicated child and parent reviews

Version: Teck.Orca 0.4.3. Host: Windows; Orca 1.4.224; OMP 18.8.7.

## Change

Every completed execution sub-issue now requires a dedicated read-only OMP
review in its existing child checkout, using the configured advisor model.
The final integrated change requires another dedicated reviewer in the parent.
The lead records the reviewed revisions/diff and validation evidence, checks an
explicit approve/request_changes/blocked verdict, and re-reviews changed
snapshots before integration or publication. Findings go back to an executor;
reviewers do not implement their own fixes. Review terminals follow the official
settlement and release contract, preserving the existing worktrees.

The configured default is `omniroute/teck-advisor`, with high reasoning for these
explicit review tasks. Background WATCHDOG advisors remain available for
execution guidance. Their cadence, notes or silence cannot supply the dedicated
review verdict. OMP documents that background advisors inject advice rather than
approving actions in its
[version-matched advisor guide](https://github.com/can1357/oh-my-pi/blob/v18.8.7/docs/advisor-watchdog.md).

Teck's background Final reviewer now follows the shared automatic-PR workflow
for top-level fixes in the user's own repositories, respecting narrower task
scope. It verifies completion claims without acting as the code-approval gate.
All official Orca guide files remain unchanged.

## Validation scope

`npm run smoke:review` uses one generated disposable feature and a synthetic
local repository. A real Orca coordinator Dispatches three independent OMP
review sessions into the existing child/parent worktrees. The first fixture
contains a regression that its weak existing test misses. The coordinator then
supplies a corrected implementation and broader tests, requests a new child
review, integrates only after approval and requests final parent review.

The harness checks exact reviewed heads, unchanged project files, explicit
verdicts, effective advisor-model launch receipts, review settlement/release,
preserved parent-child linkage and an empty reclaimable-worker inventory.
It creates no GitHub records and does not test the complete automatic GitHub
planning/publication sequence or the lead's automatic selection of this workflow.

All 22 lifecycle, packaging and release regression tests passed. The installed
Orca plugin validator accepts the generated v0.4.3 package: three files and
7,958 bytes. All 12 official guide files match their original snapshot hashes.
The runtime is installed as immutable release
`eb8dd86622b1c56d4fe7eb7919791aed20220e1b2051ed91d7bd5ef50cf4ec4c`.

## Live results

The live test passed on the generated feature
`teck-orca-review-1419313c-9013-4551-925e-2f271b079334`:

- The defective child received `request_changes`: its clamping calculation
  returned the upper bound for ordinary inputs, while its weak test only checked
  inverted-range rejection.
- The corrected child received `approve` after implementing correct clamping
  and expanding the acceptance tests.
- Only then was that child integrated into the parent. A separate reviewer
  approved the complete parent change and combined validation.
- The reviewers ran through three real Orca Dispatches with effective launch
  selector `omniroute/teck-advisor:high`. The provider transcript confirmed
  `omniroute` / `teck-advisor` during review.
- All three reviewed heads and project-file states stayed unchanged. All three
  reviewer terminals were released, the reclaimable list was empty and the
  child-parent link remained present before test teardown.
- The host removed only its generated disposable sandbox; cleanup succeeded.

The retained local report is under `.artifacts/smoke/` for that feature ID.

Active user sandboxes, terminals, desktop settings and GitHub records were left
untouched. Refresh the `plugin/` package and create a new feature to load v0.4.3.
