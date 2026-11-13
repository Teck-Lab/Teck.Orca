# Optional Aspire-managed KIND test profile

Use this layer for deployment manifests, operators, Kubernetes routing and real
CNPG behavior. Keep ordinary unit, service integration and application browser
tests on their faster environments. Select it when acceptance needs a cluster.

CommunityToolkit.Aspire.Hosting.Kind provides AddKindCluster, Helm/chart and
manifest resources, kubeconfig references, and session/persistent lifetimes.
Check compatible pinned versions and installed kind, kubectl, Helm and container
runtime first. Session cleanup is attempted on graceful shutdown; verify teardown
and record orphan ownership after crashes. Persistent clusters require explicit
reuse/data-isolation rules. Do not adopt the sandbox's existing shared cluster
as a disposable test resource.

Deploy the repository's actual manifests/Kustomize overlays and pinned charts,
with the candidate's images available in KIND. Create namespaces explicitly for
manifest application. Wait for CRDs, controllers and the workload's own readiness;
a completed apply command is not proof of recovery or functional behavior.

## Run the candidate application in Kubernetes

This lane tests the application running as Kubernetes pods, not only whether
the cluster starts. Two supported deployment paths serve different purposes:

- For the repository's deployment-manifest acceptance, use AddKindCluster with
  AddManifest (including Kustomize directories) and/or AddHelmChart. Build the
  candidate images, load them into KIND or use a reachable registry, and point
  the actual manifests at those exact images. Keep this as the default when
  validating the deployment/ folder; generated charts would test different input.
- For an Aspire-generated deployment, AddKubernetesEnvironment(...).WithKind()
  configures the publish/deploy target. The documented aspire deploy workflow
  creates the cluster, builds/loads application images and installs its generated
  Helm chart. This is distinct from merely adding AddKindCluster or starting
  an AppHost; neither automatically moves normal app resources into Kubernetes.

Wait for the deployed candidate's readiness, resolve its exposed gateway URL,
then run API tests and the relevant Playwright journeys against that URL. Reuse
assertions where practical with separate environment startup and data isolation.
Verify the endpoints reach the intended pods/revision, not a concurrently running
host application. Include application behavior with operators such as CNPG,
not only resource existence, in acceptance. Record pod logs/events on failure
and clean up resources owned by this run.

## Connectivity and runtime limits

Pass the owned cluster kubeconfig to tests. Cluster references can configure
container networking but do not make pod/ClusterIP services reachable externally.
For gateway acceptance, expose and test the real configured gateway route; a
direct service port-forward cannot establish gateway or mesh correctness.

In Docker Sandboxes, use the guest's container runtime. The hosting package does
not add missing kernel capabilities. Run capability checks in a disposable
environment before promising mesh/CNI support. Use the full WSL2 platform only
when required and available; do not silently downgrade the acceptance criteria.

CNPG scenarios must assert the requested lifecycle: for example real backup,
post-backup WAL writes and restored data, not just an S3 connectivity check.
Keep cluster tests bounded and independently selectable through Nx. Bun remains
the workspace package manager; it does not replace the cluster tools.

Source: https://aspire.dev/integrations/compute/kind/kind-host/
