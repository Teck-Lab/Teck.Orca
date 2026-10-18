# Validation on 2026-10-10

Host: Windows, Node.js 24.18.0, Orca 1.4.224, Docker Sandboxes 0.48.0-rc3, Windows OpenSSH 9.5p2.

The local fork, Teck OMP kits/configuration and alternate worker image sources are present. The matching immutable runtime is installed under the user's `.teck-orca/releases` directory. Docker-managed SSH is configured. OmniRoute and MCPHub global service credential checks pass.

## Checks completed

- 13 Node tests pass, including real PowerShell execution, UTF-8 lifecycle stdin, runtime integrity, project locks, ownership checks, sibling worktree retention, in-flight workspace reservations and failed-create rollback.
- Generated Windows/POSIX recipes and `orca.yaml` match the source runtime; `git diff --check` has no whitespace errors.
- Orca's static recipe doctor parses `orca.yaml` and finds the recipe. Its four command-path warnings are expected because the plugin launches inline PowerShell instead of repo-relative scripts. The actual command dispatch is tested separately.
- The copied workload kit builds; its browser build check validates Chromium launch, page snapshot, JavaScript interaction and PNG screenshot.
- Final disposable live test passes on release `e10129615a27bf940246fdb6255e0b9b5b93bebc11353bf0de7e001769570d5c`: PowerShell create JSON, managed SSH, native Git clone, Node 22.23.3, OMP 18.8.7, placeholder credentials and configuration, repeated create reuse, suspend/resume, retention with a linked child worktree, and final deletion.
- The final test sandbox `teck-orca-p-725a9eeb2def` was removed. It was a test project, independent of the existing Paseo project sandboxes.

## Host storage and startup repair

The Windows C: drive had approximately 513 GiB free. The original shared builder's Docker volume had 3,350,966,272 available bytes (3.12 GiB), 67% usage and approximately 6.04 GB of reclaimable build cache.

The builder was explicitly recreated using `--kit-arg volumeSize=20g`. Its filesystem reports 20,957,446,144 total bytes and approximately 19,380,260,864 available bytes (18.05 GiB) after startup. Builder recreation discards the shared build cache; cached published kit artifacts in the host store remained reusable.

Increasing the builder capacity alone did not resolve the live failure. Docker's host log still showed `failed to initialize diskbuf` while converting an image layer to EROFS. Creating `C:\tmp` also did not clear it. Restarting the Docker sandbox daemon with TMPDIR set to the Windows temp directory cleared the error, after which both disposable lifecycle runs passed. The user's TMPDIR setting was saved using their existing Windows temp directory for future launches. The launcher also supplies a process-local TMPDIR default when absent.

The restart stopped four previously running Paseo VMs. They were explicitly woken again and confirmed running. Recovery of their individual agent processes or client connections was not verified.

## Remaining acceptance checks

The local plugin still needs installation/consent in Orca Settings > Plugins, followed by choosing its Windows recipe for a real workspace. No Orca GUI workspace was created by this validation. GUI cards, an Orca-created child worktree, OMP model requests and MCPHub requests were not tested here. OMP version/startup and configuration were verified; provider requests are a separate acceptance check.

The optional richer `sandbox/image` Dockerfile was copied and adapted but not built. macOS/Linux launchers and their CI matrix are supplied; only Windows execution was exercised locally.

This recipe supplies SSH terminals and linked worktrees. Orca's experimental native chat already supports OMP; this recipe does not enable that structured chat on its SSH host or turn OMP native task agents into Orca workspace cards.

Rechecked the installed `resources/app.asar` implementation after the user pointed out experimental OMP support. Its OMP ACP definition invokes `omp acp` and requires version 17.0.5 or newer. The native-chat preference is `experimentalNativeChat`. The structured launch gate accepts execution-host kinds `local` and `runtime`, but returns blocker `remote-execution-host` for `ssh`. The ACP launch resolver also requires the agent to run on its owning runtime's local host. Therefore a remote Orca runtime can provide native OMP chat, while the current SSH recipe cannot enable it through the experimental toggle alone. This is code inspection; a remote-runtime GUI acceptance test was not performed.
