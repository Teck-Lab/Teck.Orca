# Readable dispatch names

The bundled Orca 1.4.248 implementation explicitly creates supervised terminals
with `worker-${taskId}`. Passing a useful `--task-title` alone therefore did not
fix generic terminal names. Public `worker-start`, terminal-list, rename and
set-pane-title help, plus the bundled topology implementation, were inspected.

The managed dispatch adapter now derives an 80-character task label from issue,
role and an optional concise title (falling back to the objective's first line).
New worktrees receive a readable, bounded ASCII name with a unique suffix and a
human display name. An explicit useful name remains supported. Existing
worktrees receive no creation/name flags. Explicit retry identities produce a
stable generated suffix.

After launch, a bounded metadata pass checks the exact live Dispatch and its
terminal before labeling it. Terminal tab renaming requires complete topology,
one worker in that tab and a generic existing title; custom/shared tab names are
preserved. Pane and tab updates are independent so headless desktop-routing
failure does not prevent supported tab updates. Label failures preserve the
original Dispatch receipt and never turn a successful launch into a failure or
start a replacement worker.

The live API shape was verified read-only: worker-show returns
`terminal.worktreeId`, and terminal-list returns totalCount, truncated,
visualLayouts and terminal handles/tab IDs. Tests use that actual shape.
The extension suite passed 40 tests covering label generation, Unicode/control
characters, safe bounded slugs, new/existing placement flags, verified ownership,
custom/split/truncated topology and partial labeling failure.
The full repository suite passed 238/238 tests, and `npm run check` passed.

A one-time metadata repair renamed the three active worker tabs for #872, #905
and #906 through verified Dispatch/terminal identities. Tab updates succeeded;
pane updates were unavailable through the sandbox's current desktop routing.
No workers were launched, moved, interrupted or sent input, and no branch or
application file was changed. Browser/computer control was not used.

Future naming defaults ship in the plugin's managed workflow update. Existing
OMP processes must close and load that update through the GUI before they use
the new dispatch code.
