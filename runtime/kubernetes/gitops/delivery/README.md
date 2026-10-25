# Local promotions

Kargo discovers Git commits from each worktree branch in the project-local apps
repository. Each commit contains rendered manifests with immutable application
image digests and source-content metadata. There is no independent newest-image
selection. The helper validates manifest/image binding before creating a Promotion.

The pipeline updates the local GitOps Kustomize source URL to that exact app
commit, commits/pushes only to the project-local Git service, then synchronizes
the separate promotion Application. All source/destination identities are supplied
by the verified worktree helper. Never substitute GitHub or remote Argo endpoints.

The first promotion replaces an empty local overlay, rather than deploying an
unselected release or an invalid placeholder revision. Failed Rollouts remain
failed even when stable traffic recovers.
