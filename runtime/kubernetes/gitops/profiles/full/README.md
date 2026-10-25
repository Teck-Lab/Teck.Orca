# Full local target

Optional shared KIND cluster on a dedicated compatible Linux/WSL2 runtime.
Not provisionable yet: first validate Cilium, ambient, STRICT mTLS, default-deny,
Gateway API compatibility, real agent-to-WSL ingress/API routing and restart.
The workspace image/manifests must be deployable here without an app manifest fork.
No remote Argo CD/Kargo or production credentials. Do not enable based only on
compiled kernel features. The Orca runtime must reject this target until validated.
