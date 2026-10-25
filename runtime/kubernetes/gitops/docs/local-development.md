# Local application development

The local environment follows apps/{environment}/{category}/{application}. bootstrap/local owns KIND and artifact pins; cluster-resources/local owns namespaces and bootstrap RBAC. projects/local adapts the existing category templates for the isolated cluster. The remote category generators explicitly exclude apps/local so merging this tree does not register local tools on remote clusters.

Argo CD takes ownership after initial bootstrap. Helm charts are declared in each app kustomization.yaml, with artifact checksums locked in bootstrap/local/components.lock.json. The local Git mirror carries verified cached charts/CRDs to avoid public fetches from controller pods.

Keycloak lives in apps/local/security/keycloak. Its worktree overlay imports the existing in-cluster realm and client definitions; only the local realm name, redirect URI and generated secret differ. The same realm policies/client settings therefore drive local and deployed definitions. It is included in each isolated worktree Application instead of generating a global duplicate from the platform ApplicationSet.

Local delivery promotion configuration lives beside Kargo under apps/local/system/kargo/teck-cloud. Source repos own deployment/base plus environment overlays. The full WSL2 profile remains disabled until separately validated.
