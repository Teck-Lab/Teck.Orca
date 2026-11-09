# Reusable OMP helpers and Office cleanup

OMP 18.18.3 keeps finished helpers registered as idle/parked so they can receive
follow-up work. The old Office observer retained and heartbeated their seats
until session_shutdown, which can be much later than task completion.

The observer now retires a native helper's seat on a terminal agent_end. It
uses the documented willContinue/awaitingAsyncWork flags to preserve helpers
awaiting continuation or background work. Top-level coordinators/executors are
not retired on a turn ending. A new before_agent_start/agent_start reannounces
the same helper identity and parent; the native helper is never released,
cancelled or killed by this presentation policy. Late usage/plan callbacks and
idle refreshes cannot resurrect a retired seat, and idle reporters stop
scheduling presence requests once their final event is delivered.

Already loaded observers cannot be replaced without reloading their OMP
session. The Office backend therefore also parks plain waiting helper seats
after 60 seconds of no actual activity, even when an older observer keeps
heartbeating them. It acknowledges dormant heartbeats to prevent constant
reannouncement, preserves plan/usage metadata, and reopens a seat on real new
activity. Explicit approval/continuation waits and helpers supervising busy
descendants stay visible. No coordinator is aged out by this helper policy.
This is quiet-seat presentation, not a claim that an assignment is accepted
or that the native helper has been destroyed.

Reconnect snapshots omit workers already departing. A helper reused during its
departure animation cancels that departure rather than disappearing midway
through its new turn. Both changes keep worker IDs and native family ownership
stable and avoid duplicate seats on fast reuse.

Regression coverage exercises completion, late callbacks, reuse, heartbeat
quiescence, legacy idle cleanup, protected waits, nested supervision, reconnect
snapshots and reuse during departure. No user agent input/reload or task
cancellation is needed for the backend compatibility cleanup.

Validation passed 281 plugin tests and generated-asset checks. The full Office
Linux/Node 24 suite passed 526 tests with two skips using serial test-file
concurrency; typechecking passed. The initial parallel run hit two unrelated
existing cloud/PTY timing tests, both covered by the clean serial run.

Live snapshots confirmed an older waiting implementation-worker disappeared
after its quiet grace, while the same coordinator and executor identities
continued reporting activity. Newly active helpers and nested scouts remained
visible in their parent's Office/Docker location. No user prompt, helper
cancellation or OMP restart was sent during that verification.
