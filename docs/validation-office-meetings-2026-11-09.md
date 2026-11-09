# Meeting room and main-session participation

The existing whiteboard annex is now a conference room left of the elevator.
The board retains its TV-aligned wall position and live native OMP goals/todos.
Eight table seats are available; clicking the room or the Meeting room button
opens its agenda, decision and attendee display alongside the whiteboard.
Simultaneous meetings have a selector and retain separate membership.

The Office MCP exposes `office_meeting` actions `list`, `start`, `join`, `update`,
`leave`, and `end`. The identity-aware OMP adapter returns a scrubbed structured
signal. Only the actual main session's observer can publish it; direct and mounted
tool calls from native helpers are blocked. Server ingestion additionally requires
a registered live main identity, with no parent. Orphan helpers cannot promote
themselves through a later event. There is no arbitrary worker/participant argument.
Invitations use existing Orca coordination and each attendee joins itself.

Only a host updates or ends its meeting. A main session can host one meeting and
attend one, with four meetings per source and eight participants per meeting.
Session exit or producer expiry removes attendees and ends hosted meetings.
Meeting IDs and MCP snapshot visibility are source-scoped. Event replay cannot
repeat actions. Queued MCP responses explicitly require a `list` readback before
claiming attendance. Generic standalone MCP actions fail clearly when the
identity-aware adapter is unavailable.

Meetings affect presentation only. Activity, usage, execution host, desk allocation,
native helpers, goals, assignments, branches, worktrees and coordination authority
are preserved. Leaving returns a character to its own desk. No extra planning,
review, approval or completion gate is introduced. No new port, network endpoint,
Orca capability, provider or external message channel was added.

Validation:

- 283/283 Teck.Orca tests, including structured MCP signals, main/helper identity,
  mounted tool rejection and staging the updated Office skill.
- Agent Office's complete isolated Linux Node 24.18.0 suite: 532 passed, 2 skipped,
  zero failures. Source was rebuilt before the serial test-file run. Includes real
  authenticated HTTP ingestion, source isolation, host-only updates, helper/orphan
  rejection, replay, reconnect, membership cleanup, room geometry, safe DOM text and
  returning main characters to the same desks without moving helpers.
- Agent Office TypeScript and Teck.Orca generated/vendor checks passed.
- Installed host build and served browser entry match the bundled hashes; the live
  sandbox's stdio MCP advertises all six Office tools, including `office_meeting`.

The host Office and plugin were reloaded through their managed lifecycle. Matching
observer, role guard, MCP libraries and Office skill are staged into the running
sandbox for future loads. Existing OMP processes were not restarted or prompted;
they need their normal `/reload` or a new terminal to load the new observer hooks.
No user worker was dispatched, cancelled, released or moved to test the room. No
browser/computer automation or screenshots were used. Changes target only the two
Teck-Lab fork PRs.

Visual follow-up: the meeting table reuses the existing OMP office chair renderer.
Warm plaster/wood partitions replace the glass outline, and the room bottom stays
inside the smallest office floor (198 art pixels), preventing the protruding wall.
