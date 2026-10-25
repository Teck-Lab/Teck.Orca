# Local bootstrap

KIND topology/profile and verified component pins live here. Base startup is a single-node KIND cluster. Install only the optional controllers required by the application: CNPG, Rollouts, or Gateway API/kgateway/TLS. Use Docker build, kind load docker-image and kubectl apply against the local Kustomize overlay. There is no local Argo CD, Kargo, registry or Git server. Definitions remain under apps/local categories and cluster-resources/local. Full remains disabled.
