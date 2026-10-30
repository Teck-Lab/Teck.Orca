# Official KIND workflow validation

The tracked official-kind.mjs fixture refuses real project IDs. Run it only in a new recorded scripts/kubernetes-lab.mjs sandbox. It verifies bare base startup, opt-in CNPG installation, two independent PostgreSQL/app environments, directly loaded images, dirty-source isolation, failed Job detection and UID-safe cleanup. It builds a small SQL client fixture; it is not the Monorepo application acceptance suite.

No Argo CD, Kargo, Git service, OCI promotion artifacts or local registry are installed. The host wrapper must verify the exact sandbox ID before each operation and remove only that owned test VM. Keep kubeconfigs and Secret values in the guest. Record sanitized receipts under ignored .artifacts/kind-direct. Cold restart should use the installed interactive startup hook and verify retained node/namespace/database/Secret identities and database contents.
