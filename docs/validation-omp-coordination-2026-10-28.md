# Coordinated OMP goals validation — 2026-10-28

The KIND/native SSH preview now carries the coordinated OMP workflow. Existing
modelRoles are retained: default/plan coordinate, task implements and publishes
through separate assignments, slow researches when needed, and advisor reviews.
GitHub issues/Projects/milestones remain the shared plan; Orca owns execution;
native OMP goals and phased todos keep each session within its assigned scope.

The extension denies coordinator source inspection, editing, tests and code
publication, and denies native task/eval delegation. Worker authority comes from
the live Task, Dispatch, pane, process incarnation and configured role, rather
than a prompt marker. Native goal creation is bounded to that assignment;
successful reporting requires the same goal ID/objective/Dispatch. Reports
submitted before native finalization are staged, then delivered after completion
or failed-goal drop with a persisted replay identity. An incomplete goal is never
reported as successful. These are OMP tool boundaries, not OS isolation from
trusted project extensions or a human launching another process.

## Automated checks

- Preserved development checkout: 143 root tests passed.
- Scoped PR snapshot: 142 root tests passed.
- Native SSH preview: 22 tests passed, including managed policy installation,
  retained model/config settings, idempotence and recipe reuse/resume.
- Fifteen orchestration tests cover role resolution, effective tool transitions,
  spoofed ownership, exact-goal binding, failed completion, staged report recovery,
  retry identity, native delegation denial and structured command restrictions.
- New policy/extension coverage: 89.62% lines and 79.58% branches at the measured
  snapshot. These new modules have no prior baseline; repository-wide coverage
  non-regression is not inferred from this targeted measurement.

## Live disposable acceptance

OMP 18.12.5 and Orca 1.4.237 were exercised in a separate sandbox,
`teck-orca-f-8bde3f0cbbdd`, provider ID
`ca3063a9-8461-4988-8f5d-fc0043c6be3c`. No production sandbox profile was changed.

Run `run_1d2f2002f86d` completed without manual steering. The coordinator created
its native goal/todos and dispatched an executor into a child worktree. The
executor added a regression test, observed the expected missing RangeError RED,
implemented the guard, passed both tests with 100% fixture line/branch/function
coverage, completed its exact native goal and delivered worker_done. A separate
reviewer inspected that exact child and returned REVIEW_VERDICT=approve. The
coordinator released both workers and completed its own goal. The host independently
reran the actual fixture tests/coverage; the coordinator used no implementation,
test, source-inspection or native subagent tool.

A separate negative Run, `run_074b9491c9b1`, deliberately supplied an unavailable
acceptance dependency. Its real executor staged a failed report and dropped its
native goal. Orca recorded Task `task_7a808deb4ec5` as failed, with worker_report
provenance and failed outcome, and released the settled worker. No source work
was performed and no false success was recorded.

An actual interactive OMP launch used `--no-extensions` and a conflicting config
that disabled goals. The policy extension remained loaded, the native goal tool
was available, coordinator implementation tools were absent, and the enforced
overlay was last in effective config order. Trusted custom extensions remain
outside the isolation claim.

The real managed upgrade applied once, skipped its second invocation, preserved
the SHA-256 values of models.yml/config.yml and retained the github-projects MCP
binding. The disposable sandbox was removed and all three pre-existing sandbox
names/provider IDs were preserved.

Earlier characterization runs caught startup delivery, role override, filtered
tool restoration and report ordering defects; those runs were not accepted as
passing. The corrected end-to-end run above passed. The final small allowance
for read-only worktree current/show is covered by the portable command test.
The publisher also accepts the configured App MCP's split PR body/title/draft
tools; tests deny those operations to coordinators and implementation workers.

An independent source delta review in a separate disposable sandbox,
`teck-orca-f-aadddb582cc8`, returned VERDICT=approve for the corrected exact-goal
binding, restoration, staged reporting/retry and worker metadata permissions.
Its reviewer Dispatch `ctx_ed254ecb9eac` was released. That sandbox was also
removed with all existing provider identities preserved.

## Rollout and limits

Preview 0.1.8 installs the managed workflow on normal GUI recipe reuse/resume
without replacing user models, credentials or sessions. Refresh the plugin after
installing its immutable runtime. Restart an OMP process to load the new extension;
already-running sessions keep their loaded policy. Setup creates no sandbox.

The previous KIND/CNPG/gateway acceptance remains documented in the existing
KIND and web gateway validation records. This change does not claim another full
application deployment, GUI reconnect acceptance, remote milestone-to-merge run,
fleet-wide token budget or production mesh validation. Native goal completion,
review approval, publication and GitHub issue/milestone closure are separate gates.
