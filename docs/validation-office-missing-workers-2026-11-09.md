# Missing Office workers: broken reverse forwarding

The #873 planner had a valid live planner contract and was executing real tool
calls, but did not appear in the Office backend snapshot. Its guest Office URL
refused new connections with Node fetch, Bun fetch and node:http. Existing
connections continued carrying coordinator events, which concealed the failure.

A separate native Windows OpenSSH reverse-forward probe reproduced it: four
fresh HTTP connections returned 200, ECONNREFUSED, ECONNREFUSED, ECONNREFUSED.
The SSH client stayed alive while the guest listener disappeared. This is a
measured behavior of the installed Docker SSH path, not a claim that every
OpenSSH server behaves this way. Process liveness was insufficient evidence.

Office now uses Docker's documented host-service route:
https://docs.docker.com/ai/sandboxes/workflows/development/#accessing-host-services-from-a-sandbox

The existing SSH exec starts a small guest HTTP relay bound only to 127.0.0.1.
It forwards only Office health and ingestion requests to one fixed
host.docker.internal port through the sandbox HTTP proxy. The host Office stays
bound to loopback, with its existing per-sandbox bearer authentication. Policy
allows only GET /healthz and POST /api/ingest on localhost at that exact port,
scoped to the owned sandbox. Other host ports, control APIs and browser-origin
requests are not relayed. Requests/responses and concurrency are bounded.

The relay lifetime belongs to the SSH helper. Closing its stdin closes the
guest listener; only that owned helper is recycled on a failed fresh health
check. Active OMP processes, goals, worktrees, the sandbox and Orca daemon are
not restarted. Loaded observers and MCP clients keep the same guest-loopback
URL format, re-read their configuration and retry through the new relay.

Validation covers successive fresh clients, concurrent producers, authentication,
endpoint restrictions, size bounds, activation integrity and recovery from a
live helper whose listener is dead. The full plugin suite passes 279 tests.
Live Node and Bun requests now return 200 and an authenticated empty producer
batch returns 202. The actual running #906 executor reappeared in cloud with
its exact Run/Task/Dispatch while the coordinator remained in the office.
The reported #873 planner had completed and exited by repair time; it was not
resurrected as a synthetic live worker. No task input was sent to user agents.
