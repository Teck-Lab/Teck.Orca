# OMP 18.12.5 update

Updated the existing Teck.Monorepo sandbox `teck-orca-p-bc02e0548944` from
OMP 18.11.3 to 18.12.5. Its provider identity remains
`0af8fa44-d946-41ad-84c3-cec655a7c5a5`. Bun remains 1.4.2; the package declares
Bun >=1.3.14. No project sandbox, worktree, connection or agent session was created.

Installed the exact npm release into a separate prefix, validated it as the
agent user, then switched the existing `/opt/paseo-omp` installation. The original
installation is retained at
`/opt/paseo-omp.before-18.12.5-1792616723347`. Both the direct staged binary and
the real `/usr/local/bin/omp` wrapper returned `omp/18.12.5`.

The first install waited on ONNX Runtime's automatic CUDA download. Cancelled
only that staged installer and retried with its supported
`ONNXRUNTIME_NODE_INSTALL_CUDA=skip` setting. The retry completed successfully.
Applied the same setting to image build paths to avoid this unused GPU download;
it does not disable the CPU runtime. Restored agent ownership of npm cache files
created by the update. No active OMP processes were present during the switch.

Before/after hashes confirmed preservation of saved configuration, models,
RULES, WATCHDOG, reviewer overlay and the launcher/session extension files.
Conversation files were not modified. Native read-only OMP settings/advisor APIs
confirmed the single active Supervisor, normal advisors enabled, reviewers'
advisors disabled and no configuration warnings. CLI help confirms support for
the model, session, extension and configuration flags used by the launcher.
These checks made no model requests and did not exercise an interactive TUI.

Plugin 0.5.9 pins 18.12.5 in the workload, retained OMP mixin and legacy image
build/smoke paths. Build, all 70 portable tests, package check and setup passed.
Rebuilt and checked again after adding the CUDA download setting; no application
logic changed. A complete workload image build was not run. Local update logs
are retained in the ignored `.artifacts/omp-update-18.12.5/` directory.

Returned the existing project sandbox to its original stopped state. Refresh
the Dev plugin in Orca to load the future-provisioning pin; the existing sandbox's
OMP update is already installed.
