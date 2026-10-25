# Local bootstrap

KIND/profile and artifact pins live here. Install Argo CD from argo-cd/, seed the local Git mirror, then apply root.yaml. The local root renders projects/local, which adapts the existing category ApplicationSets to apps/local and the local Git endpoint. Apps live in apps/local/{network,platform,security,system}; cluster prerequisites live in cluster-resources/local. Full remains disabled. No remote controller/credentials or Terraform is used.
