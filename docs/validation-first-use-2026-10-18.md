# First-use project recipe and fresh reset

Teck.Orca 0.5.1 corrects the v0.5.0 pre-provisioning flow. The plugin contributes
`teck-sbx-project`, shown as **Teck OMP Project** in Orca's **Run on** selector.
Orca invokes creation when the user first chooses that recipe for a workspace.
Later invocations reuse the project-derived sandbox, clone and daemon. The
recipe returns pairing data to Orca; it does not register a separate environment
or project host through a setup command. Shared sandbox deletion is disabled.

Installation, plugin activation and `npm run project` do not provision or pair
anything. The old project command is now informational. The existing SSH
transport and per-user login recovery companion are retained.

At the user's explicit request, all nine Docker sandboxes, five saved remote
connections and five stale Teck VM runtime records were removed. This included
the previously pre-created Monorepo sandbox and Docker's kit-builder sandbox.
Recovery helpers were stopped first, and old project/feature ownership state
was cleared. The saved connection list and VM feature sidecar are empty. Local
project folders and project registrations were retained. Cleanup used the CLI
and Orca's schema-validated VM store removal function; no desktop control was
used during this correction.

Validation:

- All 54 Node tests pass, including deferred first-use creation, reuse across
  distinct workspace instances, no-op sleep/deletion, foreign-payload refusal,
  desktop/instance requirements and host-shell dispatch to the project lifecycle.
- Build and generated package checks pass. Static recipe doctor reports no
  failures. Its warnings concern inline Node launchers and intentionally disabled
  sandbox destruction; these are deliberate for the portable persistent recipe.
- Setup installed release
  `f7758da351f198dff38b8e81866bb43ed1fd1d95a3dd659dd69c630a2cece530`.
- After tests, installation and the informational project command, independent
  inventories still showed zero sandboxes, zero saved remote connections and
  zero VM records. The local host remained present.

No new real sandbox was provisioned during this correction. First-use provider
tests use mocks; the earlier disposable SSH cold-wake validation remains relevant
to the transport, not proof of a live desktop first-use flow. The user handles
plugin refresh/approval and initiates the first real workspace themselves.

At the user's request, new shared project sandboxes now default to eight CPUs
and 16 GiB RAM. The host has 20 logical CPUs and about 64 GiB RAM. Environment
overrides remain available, and the limit change does not provision a sandbox.
