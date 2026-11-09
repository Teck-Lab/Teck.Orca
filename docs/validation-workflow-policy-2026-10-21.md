# Workflow policy update 0.5.8

Updated the bundled OMP workflow and installed plugin 0.5.8 for Orca 1.4.237.
Normal sessions retain one Supervisor, using medium reasoning at agent-end with
interval 3 and backlog synchronization off. Specialist background presets are
disabled. The default delivery path uses one independent medium final review;
early specialist reviews require a concrete risk or acceptance dependency.
Correction reviews focus on the correction and affected interactions.

The implementation contract requires behavioral tests for new features and
regression tests for bug fixes, using executed RED/GREEN cycles. Comparable line
and branch coverage must not decrease for affected modules or measured aggregates.
Assertions, thresholds and exclusions cannot be weakened to conceal regressions.
This is workflow guidance using each repository's existing checks; this update
does not install a new CI coverage gate in downstream repositories.

## Local verification

Added the reviewer launch policy test before implementation. Its initial run
failed two assertions because the required session-local overlay was absent.
After implementation, all four focused tests pass, including saved-session
recovery, caller configuration preservation, argument termination and explicit
advisor opt-in. The new policy module has 100% line, branch and function coverage.

The full portable suite passes all 70 tests. With the same Node test runner and
`--test-coverage-include=**/Teck.Orca/runtime/*.mjs` selection before and after:

| Metric | Before (66 tests) | After (70 tests) |
| --- | ---: | ---: |
| Line | 87.53% | 87.80% |
| Branch | 81.95% | 82.61% |
| Function | 76.03% | 76.35% |

None of the eight previously measured modules lost line or branch coverage.
This scope covers runtime modules exercised by the suite, excluding unloaded
entrypoints and other repository source. It is not whole-repository or
Teck.Monorepo coverage. Local reports are in the ignored `.artifacts/coverage/`
directory: `before-policy-0.5.8.txt`, `after-policy-0.5.8.txt` and
`policy-0.5.8.json`.

Build, package check and setup passed. Updated smoke scripts passed syntax checks;
model-based workflow/review smokes were not run. No model requests, agent sessions
or user worktrees were created.

## Existing sandbox verification

Applied the policy and launcher to existing sandbox `teck-orca-p-bc02e0548944`.
Verified all 20 incoming files by checksum. Preserved the saved configuration and
model files by before/after hashes; conversation files were untouched. Previous
files are retained in the guest at
`/home/agent/.local/state/teck-orca/policy-updates/before-0.5.8-1792614120514`.

Read-only checks using OMP 18.11.3's native settings loader confirmed that normal
sessions have advisors enabled and the bundled reviewer overlay disables them.
Native advisor discovery for the actual project/profile found only Supervisor,
with no configuration warnings. The launcher applies the overlay to bundled
advisor model sessions, including recovery, while respecting explicit `--advisor`.

Returned the existing project sandbox to its stopped state. No replacement
sandbox or saved connection was created. Refresh the Dev plugin in Orca to load
the installed host update; desktop GUI acceptance was not run.
