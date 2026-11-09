# Agent Office MCP, usage and OMP icon

The fork ships five tools in its native stdio MCP server. OMP's checked global
and workspace configurations did not yet include that server. The plugin now
bundles the upstream MCP API behind a small stdio adapter and registers a missing
`agentoffice` connection automatically. Existing Office connections, other MCP
servers and credentials are preserved. No additional URL/token is requested.

Native handlers keep their own schemas, sanitization, emoji parsing, cooldowns
and peer briefing. An async request scope adds only the intentional public signal
to successful structured results. OMP 18.16's native MCP bridge preserves this
in result details. The observer associates it with the calling worker/helper;
raw prompts, arguments and general tool output are not relayed. Failed/cooldown
responses cannot produce a flip or other animation.

The five exact Office tools are allowed and advertised across coordinator,
worker and read-only/native-helper roles, before goals and while waiting. No
other Office/unknown MCP tool receives that exception. Repository permissions,
goal acceptance and Orca lifecycle authority remain separate. The shared Office
skill covers meaningful status/peer/milestone calls, scoped verified wins, optional
rare flips, privacy, untrusted peer text and nonblocking unavailability.

Peer snapshots use the existing authenticated loopback tunnel and exact
server-owned host IDs, preventing cross-project reads even for colliding source
ID prefixes. The MCP dependencies and MIT license install before the observer
entry; GUI managed updates carry these files and the skill together.

Token work was delegated independently. The observer now reports cumulative own
assistant token totals, and the server/browser accept replay-safe totals without
changing activity. Real metadata samples exposed reused gateway response IDs;
deduplication therefore includes the required message timestamp. See
validation-office-token-usage-2026-11-09.md for accounting details and limitations.

Icon work was delegated independently. It uses the official OMP pi path from
https://omp.sh/favicon.svg with currentColor, visible sky-blue scene ink and
crisp 5/7/9-pixel marks for monitor/TV rendering and the top-right legend.

Validation includes the native MCP stdio entry, all five native handlers,
concurrent/batched call attribution, peer transport, source isolation, role and
goal boundaries, configuration preservation, cumulative token replay and OMP
icon rendering. An isolated real MCP → observer → HTTP Office test delivered all
four visual signals, queried peers, updated tokens, survived server restart
without replacing a waiting pose, and removed its worker on shutdown.

Existing user OMP sessions are not interrupted. Their loaded extension/MCP set
requires reopening after the GUI workflow update; refresh the Office browser
page to load the new icon and counter code. No browser/computer control was used.

Final checks: 256/256 Teck.Orca tests and 82/82 focused Agent Office server,
external transport, hierarchy, scene and icon tests passed. Generated runtime
asset checks also passed.
