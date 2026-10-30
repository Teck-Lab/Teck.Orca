# One Teck Orca plugin — 2026-10-30

The native SSH provider is integrated into the existing teck-lab.teck-sbx-recipes plugin as version 0.6.0. Install only plugin/. Its sole Run on recipe is Teck OMP Project; the recipe keeps its established teck-native-ssh-project ID. The independent native preview manifest, package and setup entry are removed. Root build/check/setup now generate and install the native runtime, and root tests include the provider suite.

Existing preview sandbox names, provider IDs, ownership records, project settings and release roots are retained. Old saved workspaces continue to refer to their immutable snapshots. The new main recipe reuses those VMs and installs current managed assets through the existing normal lifecycle. Remove the old Native SSH Preview plugin entry once through Orca Settings after refreshing the main plugin; keep its sandbox, workspaces and state directory. No desktop plugin records are edited by setup.

The original plugin identity and reconnect command remain. Older bundled-daemon project/feature sandboxes keep their records, recovery support and generated compatibility recipes; those recipes are not offered for new workspaces. There is no automatic checkout/profile/data migration between connection modes.

## Validation

Three integration regressions failed before the merge: the main package still exposed the legacy recipe, rebuilding retained that recipe, and root setup had no native runtime installer. After implementation, package refresh removes the obsolete generated recipe and preserves recovery, only one installable manifest remains, the doctor mirror exposes native SSH, and root installation prepares both immutable runtimes. The actual packaged suspend launcher runs through the Windows host shell against the installed native snapshot without provisioning a sandbox. Native provider identity/reuse, ownership, resume, OMP-policy upgrade and Kubernetes tests remain part of the full root suite.

Root build/check and all 181 combined tests pass. Static Orca recipe doctor reports no failures; its warnings are expected: inline Node commands are integrity-checked portable launchers, and destroy is intentionally disabled for a project-shared VM. A new GUI installation/reconnect test and live VM provisioning were not performed for this packaging change. Existing project VM contents and OMP processes were not modified.
