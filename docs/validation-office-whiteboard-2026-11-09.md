# Native OMP whiteboard

The Agent Office fork now has a pixel whiteboard in a dedicated wall bay left
of the elevator, aligned with the TV. The annex extends the rendered room; the
elevator, TV, worker pods and worktree ownership retain their positions.
Clicking the board, the Whiteboard button or B opens a read-only native dialog.
Its selector keeps concurrent orchestrators separate. Auto-fit includes the
board; no hover popup is required to read it.

The observer rehydrates goals from native mode/tool records and todos from
canonical successful todo results or user_todo_edit records on the active
branch. It observes goal_updated and native result events. A lifecycle-scoped
five-second branch refresh also picks up human todo edits while idle. It never
sends model input, creates a goal, edits a task or queries GitHub to populate
the display. Failed todo calls and view-only results cannot replace a plan.

Each session owns its plan; helpers inherit room placement, not the parent's
goal/todos. Connected Orca assignments match an exact Run and sandbox host,
never just a project name. Native goal status, native todo completion and
session activity are displayed separately. The panel does not claim to be the
complete historical Orca Task inventory, a GitHub milestone mirror or evidence
of acceptance/issue closure. Issue links come from the existing verified
assignment metadata and open GitHub separately.

The authenticated loopback observer API accepts the new plan metadata event.
Labels are redacted, schema fields allowlisted, and the preview is capped at
12 phases, 60 tasks and 24 KiB with an explicit truncation notice. Prompts, tool
arguments/output and arbitrary records are not transmitted. Plan events retain
the last activity/pose/tool count; browser snapshots and server reannouncement
preserve the plan across reconnects without inventing work.

The role guard now checks exact live Dispatch ownership before releasing the
startup presentation role. Unassigned fresh panes wait through the existing
startup assignment-recovery window, covering Dispatches attached after the pane
starts. The observer waits during that check, so a worker
does not first announce the coordinator fallback and then move to Docker. An
unavailable lookup does not mint an office role. The plugin stages the matching
observer, sanitizer and role guard atomically for subsequent OMP loads without
restarting running sessions. Existing loaded extensions need their normal OMP
reload/session restart to adopt the new observer; no user session was interrupted.

Validation includes 275 passing plugin tests, generated package checks, Agent
Office typechecking and its full Linux/Node 24 suite (523 passed, two skipped).
The Linux test directory is disposable and outside any user project. The normal
Windows full-suite attempt encounters upstream Unix/symlink assumptions; it is
not presented as a passing Windows suite.

An isolated real OMP 18.18.3 RPC process used the installed observer and role
guard. Its first event placed the coordinator in the office. Native RPC goal
creation, todo editing with a blocker and goal pause produced three matching
plan updates with zero model turns. The probe intercepted only its own Office
metadata requests so no test goal/worker appeared in the user's live office.
The host Office build and served browser entry matched the approved bundle,
and the installed guest assets matched their source hashes.
