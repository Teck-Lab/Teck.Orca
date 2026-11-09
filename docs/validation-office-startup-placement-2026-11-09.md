# Fresh terminal placement

OMP discovers the office observer before the launcher explicitly loads Teck's
Orca role guard. The observer handled session_start immediately, before the guard
appended its role contract. It therefore announced a fresh coordinator as main
with null orchestration and cloud placement. A terminal waiting for its first
prompt sent only heartbeats, which preserved that incorrect first announcement.

The observer now uses OMP's lifecycle-scoped zero-delay timer to announce the
session after the role guard's startup handler. It still reads the guard's role
contract rather than guessing from a model alias, terminal title or prompt.
Generation fencing prevents delayed callbacks from reviving a switched-away or
closed session. Coordinator placement is office; verified dispatched worker
placement remains cloud. Native helpers retain their parent's placement and
the real sandbox host remains attached to the metadata.

An isolated OMP 18.18.3 RPC startup probe reproduced the original bug with the
same ambient-observer/explicit-role-guard load order as the interactive launcher.
Before the fix it reported guardRole=coordinator, officeRole=main, placement=cloud.
After the fix its first announcement was guardRole=coordinator,
officeRole=coordinator, placement=office. No prompt or model request was sent.
The probe intercepted only its own office metadata requests inside its process;
it did not change a user session or create an Orca workspace/Dispatch.

Regression tests cover first announcement while idle, verified worker cloud
placement, delayed session-switch callbacks, role revocation and helper
inheritance. The corrected observer file was staged through the plugin's normal
office reconnect setup and its guest hash matched the local source. Running OMP
processes retain their loaded module; the previously opened idle terminal's next
prompt/tool event re-reads its initialized contract and corrects its placement.
New terminals use the fixed observer immediately.

All 269 plugin tests and generated-asset checks passed. The run also exposed
Orca 1.4.254 regenerating its ignored .orca SDK directory in the watched plugin
folder. Package validation now excludes that development metadata while still
rejecting unrelated distribution files and preserving the SDK archive behavior.
