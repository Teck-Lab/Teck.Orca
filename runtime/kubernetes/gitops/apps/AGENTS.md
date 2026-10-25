# `apps/` — Stage Overlay Index

Four stages × six categories. Not every category exists in every stage — the table below is the **current truth**.

## Stages

| Stage | ArgoCD target | Cluster purpose |
|-------|---------------|-----------------|
| `development/` | `development` cluster context | full app stack including teck-cloud services |
| `production/` | `production` cluster context | platform-only at the moment; teck-cloud overlay not yet onboarded |
| `local/` | isolated KIND in each project sandbox | optional local operators/dependencies, direct kubectl, no mesh |
| `in-cluster/` | `https://kubernetes.default.svc` | hosts ArgoCD + Kargo themselves + shared DBs / brokers |

## Category × Stage Matrix

| Category | development | production | in-cluster | Owners |
|----------|:-----------:|:----------:|:----------:|--------|
| `network/` | cloudflared, external-dns, gateway-api, kgateway, kgateway-crds | same | gateway | network team |
| `platform/` | cert-manager, cnpg-cluster, cnpg-operator, rabbitmq, rabbitmq-cluster, redis-operator, redis-shared | same | — | platform team |
| `security/` | eso | eso | keycloak | security team |
| `teck-cloud/` | `teck-cloud-core/{admin-gateway,basket-api,catalog-api,customer-api,order-api,yarp-gateway}` | — (not yet) | flat: `admin-gateway/`, `basket-api/`, `catalog-api/`, `customer-api/`, `kargo/`, `order-api/`, `postgres/`, `rabbitmq/`, `redis/`, `teck-cloud/`, `teck-cloud-core/`, `yarp-gateway/` | teck-cloud team |
| `monitoring/` | — | — | (scaffold) | monitoring team |
| `system/` | — | — | kargo | platform team |

## Overlay Shape Conventions

**`development/` and `production/`** use a nested workload-group path:

```
apps/{env}/teck-cloud/teck-cloud-core/{service-name}/
  ├── kustomization.yaml
  ├── deployment.yaml | -patch.yaml
  └── (config / external secrets)
```

**`in-cluster/`** is flatter — workloads sit directly under their category:

```
apps/in-cluster/teck-cloud/{service-name}/    — no teck-cloud-core nesting
apps/in-cluster/system/kargo/teck-cloud/      — Kargo Warehouse + Stages live here
```

## Shared Files at `development/teck-cloud/teck-cloud-core/`

These apply to all services in the group and must be referenced by the parent `kustomization.yaml`:

| File | Purpose |
|------|---------|
| `config.yaml` | shared ConfigMap (DB / MQ endpoints) |
| `external-secret-github-pull-shared.yaml` | image-pull credentials |
| `external-secret-rabbitmq-shared.yaml` | RabbitMQ credentials |
| `migrations-serviceaccount.yaml` | ServiceAccount used by migration Jobs |

## Anti-patterns

- Do not copy a service overlay from `in-cluster/teck-cloud/` into `development/teck-cloud/` verbatim — the path structure differs (`teck-cloud-core/` nesting).
- Do not add a new service to `production/` before it lives in `development/` and Kargo has promoted Freight there.
- Do not put Kargo CRs under `apps/{env}/system/` for dev/prod — Kargo runs only in-cluster.

## Local environment

Local follows apps/local/ categories with prerequisites in cluster-resources/local/
and topology/artifact pins in bootstrap/local/. Agents use kubectl directly against
KIND; operators are optional, shared add-ons. There is no local ApplicationSet or
delivery service. Remote generators exclude apps/local. See docs/local-development.md.
