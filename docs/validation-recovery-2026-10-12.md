# Recovery validation, v0.4.10

The reported saved ports 60128 and 60129 were inside the host's Windows TCP
exclusion range 60092-60191. An ordinary Node bridge cannot bind those addresses.
The old command reported EACCES without explaining that Retry cannot change a
saved endpoint. Recovery now reports the needed native Orca connection refresh.
It does not alter OS exclusions or edit desktop stores.

New features publish sandbox port 6768 at an available fixed IPv4 loopback port
in 20000-39999. Recovery starts an owned fixed-port sandbox directly instead of
binding a bridge that would block Docker from publishing the same address.
Older features keep their original mapping and bridge compatibility. A reserved
old address still requires Orca's native workspace suspend/resume flow to refresh
the saved endpoint; this is not an in-place sandbox migration. This native flow
was confirmed in installed source, not executed against user workspaces. It can
still be blocked if Orca cannot confirm shutdown of an offline terminal.

Plugin activation checks the pinned release manifest and its three executable
recovery dependencies. Full release verification remains in installation and
recipe execution; unused SDK archives are not read on the ten-second worker
startup deadline. Tests reject tampering in every verified dependency.

Validation on Windows:

- All 36 regression tests passed, including denied/occupied port selection,
  direct fixed-port wake, ownership refusal, EACCES diagnostics and activation
  without archive reads.
- A disposable feature used port 30816 before and after a real VM stop.
  The production command ran through Orca's installed plugin worker against an
  isolated profile. Worker readiness took 137 ms; command result was one
  recovered feature, zero blocked.
- The original saved pairing connected after recovery. Parent/child worktree
  IDs, parentage, branches and an uncommitted marker survived. The isolated
  desktop environment store remained unchanged by the plugin command.
- The disposable sandbox and its ownership record were removed. No user
  sandbox was started, stopped, reconfigured or deleted by this validation.

Local report:
`.artifacts/smoke/teck-orca-restart-261d598f-51b8-41ce-bf9d-e80ab8592aa3/result.json`.
