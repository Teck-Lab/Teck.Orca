# Coordinator waiting presentation — 2026-11-10

Agent Office treated an OMP coordinator's finished turn as a human wait. Its
existing supervision logic only linked native helpers through `parentId`, while
Orca Dispatches are independent main sessions linked by Run and host identity.

The Agent Office fork now recognizes recently active main workers in the exact
same Orca Run and host. It shows the yielded coordinator as idle with an
`Awaiting N Orca worker(s)` explanation. When those workers stop reporting active
execution it shows `Awaiting Orca wake-up`, without asserting success or requiring
human input. Explicit approval/input waits take precedence. Launch receipts and
session presence alone do not establish execution.

The scene clears its stale `needsHuman` flag on idle events; both the live UI model
and inspector retain the supervision explanation. The status label displays that
explanation even when the coordinator's remaining acceptance todos are blocked.

Validation: 74 server-state, presentation and scene tests passed, plus TypeScript
checking and the production build. Tests cover late worker arrival, exact Run and
host isolation, excluding helpers/other coordinators, preserving approval waits,
automatic wake-up waiting and clearing the character's needs-you flag.

Deployed through the plugin's immutable Office bundle. Live snapshot confirmed
Run `run_14cd1644929b`: executor `ctx_79cda4d0f6c9` reported `thinking`; its
coordinator reported `idle`, summary `Awaiting 1 Orca worker`. Browser entry:
`/assets/app-GO5LZBM2.js`. No OMP session, worker, checkout or Task was restarted
or changed. No new orchestration polling was introduced.
