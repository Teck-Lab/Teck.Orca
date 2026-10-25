# Teck.GitOps — Agent Instructions

GitOps delivery layer. ArgoCD (app-of-apps) + Kargo (image promotion) + Kustomize (overlays). Canonical rules: [`.github/copilot-instructions.md`](file:///workspaces/Infrastructure/Teck.GitOps/.github/copilot-instructions.md) + [`.github/instructions/`](file:///workspaces/Infrastructure/Teck.GitOps/.github/instructions). This file is a **codemap**.

## Core Rules

- **Never hard-code image tags** — Kargo manages them.
- **Never hard-code environment-specific values** — use Kustomize overlays.
- YAML must be valid Kubernetes manifests or Kustomize resources.
- ArgoCD sync-waves control ordering — always set `argocd.argoproj.io/sync-wave` annotations.

## Repository Layout

```
bootstrap/                — cluster bootstrap chain (manually applied once)
├── root.yaml             — root ArgoCD Application (app-of-apps entry)
├── argo-cd.yaml          — ArgoCD self-management Application
├── argo-cd/              — ArgoCD chart + bootstrap ExternalSecrets + kargo repo registration
├── cluster-resources.yaml
└── essentials.yaml       — points ArgoCD at cluster-resources/ + essentials/

bootstrap.yaml            — single-file kickoff (apply this first on a fresh cluster)

projects/                 — ArgoCD AppProject + ApplicationSet definitions (one per workload group)
├── hosting.yaml          monitoring.yaml   network.yaml      platform.yaml
├── preview.yaml          security.yaml     system.yaml       teck-cloud.yaml
└── kargo.yaml

apps/
├── development/          — development stage overlays (see apps/AGENTS.md)
├── production/           — production stage overlays
└── in-cluster/           — cluster-local tooling (ArgoCD + Kargo themselves, plus shared infra)

cluster-resources/        — raw K8s resources applied outside ArgoCD
├── development/   in-cluster/   production/

essentials/               — empty placeholder (only .gitkeep)
                            — platform tools actually live under apps/{env}/{category}/

docs/                     — human-readable docs (apps.md, bootstrap.md, projects.md, …)
```

## Stage Environments

| Stage | Overlay path | ArgoCD target | Notes |
|-------|--------------|---------------|-------|
| development | `apps/development/` | `development` cluster context | full overlay including `teck-cloud/teck-cloud-core/` |
| production | `apps/production/` | `production` cluster context | network / platform / security only (no teck-cloud workload yet) |
| in-cluster | `apps/in-cluster/` | `https://kubernetes.default.svc` | hosts ArgoCD, Kargo, and shared DBs / brokers |

## Categories under `apps/{env}/`

| Category | Contains |
|----------|----------|
| `network/` | cloudflared, external-dns, gateway-api, kgateway, kgateway-crds, gateway routes |
| `platform/` | cert-manager, cnpg-operator + cnpg-cluster, rabbitmq + rabbitmq-cluster, redis-operator + redis-shared |
| `security/` | eso (External Secrets Operator), keycloak (in-cluster) |
| `teck-cloud/` | `teck-cloud-core/{service}/` overlays (dev only currently) |
| `monitoring/` | metrics / observability (in-cluster only currently) |
| `system/` | kargo, system-level controllers (in-cluster only) |

## Where things live

| If you need to… | Go to |
|---|---|
| Promote a new image | (nothing — Kargo Warehouse + Stages drive promotion automatically) |
| Adjust Kargo subscription / freight policy | [`apps/in-cluster/system/kargo/teck-cloud/warehouse.yaml`](file:///workspaces/Infrastructure/Teck.GitOps/apps/in-cluster/system/kargo/teck-cloud/warehouse.yaml), [`stages.yaml`](file:///workspaces/Infrastructure/Teck.GitOps/apps/in-cluster/system/kargo/teck-cloud/stages.yaml) |
| Add a new Teck.Cloud service overlay | `apps/development/teck-cloud/teck-cloud-core/{service-name}/`, register in parent `kustomization.yaml` |
| Add a platform tool | `apps/{env}/{network\|platform\|security\|system}/{tool}/` + matching `projects/{group}.yaml` ApplicationSet entry |
| Change cluster RBAC / namespaces | `cluster-resources/{env}/` |
| Bootstrap a new cluster | apply `bootstrap.yaml` once, then `bootstrap/root.yaml` |

## Anti-patterns

- Do not put platform tools under `essentials/` — that directory is empty scaffolding. Real tools live under `apps/{env}/{category}/`.
- Do not register applications outside an `ApplicationSet` in `projects/` — the app-of-apps generator owns them.
- Do not use the `in-cluster` overlay shape for development/production — `in-cluster/teck-cloud/` is flat (`basket-api/`, `catalog-api/`, …) while `development/teck-cloud/` nests through `teck-cloud-core/`.

## Key instruction files

- [`.github/instructions/argocd.instructions.md`](file:///workspaces/Infrastructure/Teck.GitOps/.github/instructions/argocd.instructions.md) — ApplicationSet generators, app-of-apps, project scoping
- [`.github/instructions/kustomize.instructions.md`](file:///workspaces/Infrastructure/Teck.GitOps/.github/instructions/kustomize.instructions.md) — overlay structure, patch types
- [`.github/instructions/kargo.instructions.md`](file:///workspaces/Infrastructure/Teck.GitOps/.github/instructions/kargo.instructions.md) — Warehouse, Freight, Stage CRD patterns
- [`.github/instructions/bootstrap.instructions.md`](file:///workspaces/Infrastructure/Teck.GitOps/.github/instructions/bootstrap.instructions.md) — bootstrap ordering and separation

## Local environment

Local follows the existing category hierarchy under apps/local/, with prerequisites
in cluster-resources/local/, initial setup/profile pins in bootstrap/local/, and
category ApplicationSets adapted through projects/local/. Remote generators exclude
apps/local. Keycloak is under security and reuses in-cluster realm/client definitions;
its worktree-scoped overlay is included by the worktree Application. See docs/local-development.md.
