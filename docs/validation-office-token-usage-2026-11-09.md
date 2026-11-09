# OMP token usage in Agent Office

The observer did not publish usage, and external ingestion discarded the
existing delta `tokens` property. This left OMP workers at zero in the inspector.

The usage reader consumes finalized assistant-message metadata and restores
historical assistant usage through OMP's read-only session API. It uses normalized
`usage.totalTokens`, which already includes cache buckets, reasoning within
output, and any provider-side orchestration tokens. It does not add those
components again. Missing totals fall back to the disjoint normalized buckets;
context size and cost are never treated as token usage.

OMP's aggregate session stats include task-result usage, so they would count
helpers again on the parent desk. Those aggregate tool results are excluded.
Ledgers are separate for each session and native agent ID. Inherited history
before a fork's own header timestamp is excluded. Advisor callbacks on a parent
runner do not inherit the parent's historical usage.

Finalized response identity combines timestamp, provider/model and response ID.
The configured gateway reuses response IDs, so response ID alone was shown to
undercount actual usage. Repeated snapshots of one response contribute at most
its highest reported total, while separate retry responses still count.

The external event protocol supports a metadata-only `usage` event and cumulative
`tokenTotal`. Server/browser counters apply the monotonic total without changing
the agent's pose, tool counters or recent-action history. Existing delta-token
producers remain compatible. Browser high-water marks prevent an old total being
added again when the same session leaves and resumes.

Validation covers six reader regressions, server ingestion/replay bounds,
separate parent/helper counters, browser pose/history preservation and resumed
worker totals. Existing state/link/remote/browser suites passed 69 tests, and
fork typecheck passed. Live validation reads only session-header identities and
usage metadata, prints aggregate counts, and makes no model requests or writes
to sessions. No running OMP process was restarted or attached to.

Usage absent from provider metadata is not invented. Auxiliary `model_usage`
entries for memory or advisors without their own finalized assistant callback
are not attributed speculatively to a worker.
