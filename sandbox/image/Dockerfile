# syntax=docker/dockerfile:1.7

ARG SANDBOX_BASE_IMAGE=docker.io/docker/sandbox-templates:shell-docker@sha256:5fc81bc7a127e59d81b244a06831ae3212a0310b2e5a0349c54e29249e45e919
FROM ${SANDBOX_BASE_IMAGE}

ARG BUN_VERSION=1.4.4
ARG OMP_VERSION=18.14.0
ARG TYPESCRIPT_VERSION=5.9.3
ARG TYPESCRIPT_LANGUAGE_SERVER_VERSION=4.4.1
ARG NEXT_DEVTOOLS_MCP_VERSION=0.4.0
ARG BIOME_VERSION=2.5.14
ARG VSCODE_LANGSERVERS_EXTRACTED_VERSION=4.10.0
ARG TAILWINDCSS_LANGUAGE_SERVER_VERSION=0.16.0
ARG PYRIGHT_VERSION=1.1.414
ARG BASH_LANGUAGE_SERVER_VERSION=5.8.0
ARG YAML_LANGUAGE_SERVER_VERSION=1.24.0
ARG DOCKERFILE_LANGUAGE_SERVER_NODEJS_VERSION=0.15.0
ARG OMNISHARP_VERSION=1.40.0
ARG MARKSMAN_VERSION=2024-12-18
ARG TERRAFORM_LS_VERSION=0.39.0
ARG HELM_LS_VERSION=0.5.4
ARG DOTNET_SDK_VERSION=10.0.401
ARG DOTNET_INSTALL_SHA256=0eeb52c76e35a5431ca707ad2bc75e38006a05393045d8532ae44c15d9474523
ARG GOOGLE_CHROME_VERSION=153.0.8010.36-1
ARG GOOGLE_CHROME_SHA256=9bb44e33031c2f2857cf36b4343051a12f93058e4b781e3c76313df87f6c8d32

USER root
COPY devtools.json kubernetes-tools.mjs /usr/local/lib/teck-kubernetes/
RUN node /usr/local/lib/teck-kubernetes/kubernetes-tools.mjs --install
ENV ONNXRUNTIME_NODE_INSTALL=skip \
    ONNXRUNTIME_NODE_INSTALL_CUDA=skip \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates curl unzip \
    && chrome_deb="google-chrome-stable_${GOOGLE_CHROME_VERSION}_amd64.deb" \
    && curl --fail --show-error --silent --location "https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/${chrome_deb}" -o "/tmp/${chrome_deb}" \
    && echo "${GOOGLE_CHROME_SHA256}  /tmp/${chrome_deb}" | sha256sum --check \
    && apt-get install -y --no-install-recommends "/tmp/${chrome_deb}" \
    && rm -f "/tmp/${chrome_deb}" \
    && curl --fail --show-error --silent --location https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh \
    && echo "${DOTNET_INSTALL_SHA256}  /tmp/dotnet-install.sh" | sha256sum --check \
    && chmod 0755 /tmp/dotnet-install.sh \
    && /tmp/dotnet-install.sh --version "${DOTNET_SDK_VERSION}" --install-dir /usr/share/dotnet --no-path \
    && ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet \
    && rm -f /tmp/dotnet-install.sh \
    && rm -rf /var/lib/apt/lists/* \
    && command -v g++ \
    && test "$(google-chrome-stable --version | awk '{print $3}')" = "${GOOGLE_CHROME_VERSION%-1}" \
    && test "$(dotnet --version)" = "${DOTNET_SDK_VERSION}"

RUN npm install --global --no-audit --no-fund "bun@${BUN_VERSION}" \
    && npm install --global --no-audit --no-fund "@oh-my-pi/pi-coding-agent@${OMP_VERSION}" \
    && npm install --global --no-audit --no-fund \
         "typescript-language-server@${TYPESCRIPT_LANGUAGE_SERVER_VERSION}" \
         "typescript@${TYPESCRIPT_VERSION}" \
         "next-devtools-mcp@${NEXT_DEVTOOLS_MCP_VERSION}" \
         "@biomejs/biome@${BIOME_VERSION}" \
         "vscode-langservers-extracted@${VSCODE_LANGSERVERS_EXTRACTED_VERSION}" \
         "@tailwindcss/language-server@${TAILWINDCSS_LANGUAGE_SERVER_VERSION}" \
         "pyright@${PYRIGHT_VERSION}" \
         "bash-language-server@${BASH_LANGUAGE_SERVER_VERSION}" \
         "yaml-language-server@${YAML_LANGUAGE_SERVER_VERSION}" \
         "dockerfile-language-server-nodejs@${DOCKERFILE_LANGUAGE_SERVER_NODEJS_VERSION}" \
    && global_bin="$(npm prefix --global)/bin" \
    && test -x "${global_bin}/bun" \
    && test -x "${global_bin}/bunx" \
    && test -x "${global_bin}/omp" \
    && test -x "${global_bin}/typescript-language-server" \
    && test -x "${global_bin}/tsc" \
    && test -x "${global_bin}/next-devtools-mcp" \
    && test -x "${global_bin}/biome" \
    && test -x "${global_bin}/vscode-html-language-server" \
    && test -x "${global_bin}/vscode-css-language-server" \
    && test -x "${global_bin}/vscode-json-language-server" \
    && test -x "${global_bin}/tailwindcss-language-server" \
    && test -x "${global_bin}/pyright-langserver" \
    && test -x "${global_bin}/bash-language-server" \
    && test -x "${global_bin}/yaml-language-server" \
    && test -x "${global_bin}/docker-langserver" \
    && ln -sf "${global_bin}/bun" /usr/local/bin/bun \
    && ln -sf "${global_bin}/bunx" /usr/local/bin/bunx \
    && ln -sf "${global_bin}/omp" /usr/local/bin/omp \
    && ln -sf "${global_bin}/typescript-language-server" /usr/local/bin/typescript-language-server \
    && ln -sf "${global_bin}/tsc" /usr/local/bin/tsc \
    && ln -sf "${global_bin}/next-devtools-mcp" /usr/local/bin/next-devtools-mcp \
    && ln -sf "${global_bin}/biome" /usr/local/bin/biome \
    && ln -sf "${global_bin}/vscode-html-language-server" /usr/local/bin/vscode-html-language-server \
    && ln -sf "${global_bin}/vscode-css-language-server" /usr/local/bin/vscode-css-language-server \
    && ln -sf "${global_bin}/vscode-json-language-server" /usr/local/bin/vscode-json-language-server \
    && ln -sf "${global_bin}/tailwindcss-language-server" /usr/local/bin/tailwindcss-language-server \
    && ln -sf "${global_bin}/pyright-langserver" /usr/local/bin/pyright-langserver \
    && ln -sf "${global_bin}/bash-language-server" /usr/local/bin/bash-language-server \
    && ln -sf "${global_bin}/yaml-language-server" /usr/local/bin/yaml-language-server \
    && ln -sf "${global_bin}/docker-langserver" /usr/local/bin/docker-langserver \
    && npm list --global --depth=0 \
         "bun@${BUN_VERSION}" \
         "@oh-my-pi/pi-coding-agent@${OMP_VERSION}" \
         "typescript-language-server@${TYPESCRIPT_LANGUAGE_SERVER_VERSION}" \
         "typescript@${TYPESCRIPT_VERSION}" \
         "next-devtools-mcp@${NEXT_DEVTOOLS_MCP_VERSION}" \
         "@biomejs/biome@${BIOME_VERSION}" \
         "vscode-langservers-extracted@${VSCODE_LANGSERVERS_EXTRACTED_VERSION}" \
         "@tailwindcss/language-server@${TAILWINDCSS_LANGUAGE_SERVER_VERSION}" \
         "pyright@${PYRIGHT_VERSION}" \
         "bash-language-server@${BASH_LANGUAGE_SERVER_VERSION}" \
         "yaml-language-server@${YAML_LANGUAGE_SERVER_VERSION}" \
         "dockerfile-language-server-nodejs@${DOCKERFILE_LANGUAGE_SERVER_NODEJS_VERSION}" \
    && command -v git \
    && command -v gpg \
    && command -v bun \
    && command -v bunx \
    && command -v omp \
    && command -v typescript-language-server \
    && command -v tsc \
    && command -v next-devtools-mcp \
    && command -v biome \
    && command -v vscode-html-language-server \
    && command -v vscode-css-language-server \
    && command -v vscode-json-language-server \
    && command -v tailwindcss-language-server \
    && command -v pyright-langserver \
    && command -v bash-language-server \
    && command -v yaml-language-server \
    && command -v docker-langserver

RUN omnisharp_dir="/usr/local/lib/omnisharp" \
    && mkdir -p "${omnisharp_dir}" \
    && curl --fail --show-error --silent --location "https://github.com/OmniSharp/omnisharp-roslyn/releases/download/v${OMNISHARP_VERSION}/omnisharp-linux-x64-net10.0.tar.gz" -o /tmp/omnisharp.tar.gz \
    && echo "a5c68aed11a4f51c1e815cfc6dbefe30d7f302297b826370e32403546b57da65  /tmp/omnisharp.tar.gz" | sha256sum --check \
    && tar -xzf /tmp/omnisharp.tar.gz -C "${omnisharp_dir}" \
    && ln -sf "${omnisharp_dir}/OmniSharp" /usr/local/bin/omnisharp \
    && rm -f /tmp/omnisharp.tar.gz \
    && test -x "$(command -v omnisharp)" \
    && marksman_bin="/usr/local/bin/marksman" \
    && curl --fail --show-error --silent --location "https://github.com/artempyanykh/marksman/releases/download/${MARKSMAN_VERSION}/marksman-linux-x64" -o "${marksman_bin}" \
    && echo "b9cb666c643dfd9b699811fdfc445ed4c56be65c1d878c21d46847f0d7b0e475  ${marksman_bin}" | sha256sum --check \
    && chmod +x "${marksman_bin}" \
    && "${marksman_bin}" --version \
    && terraformls_zip="/tmp/terraform-ls.zip" \
    && curl --fail --show-error --silent --location "https://releases.hashicorp.com/terraform-ls/${TERRAFORM_LS_VERSION}/terraform-ls_${TERRAFORM_LS_VERSION}_linux_amd64.zip" -o "${terraformls_zip}" \
    && echo "7750edc736845fd8c04ff0fc6332423c12d8275b358668c8c17e8aedc43ef971  ${terraformls_zip}" | sha256sum --check \
    && unzip -o "${terraformls_zip}" -d /usr/local/bin \
    && rm -f "${terraformls_zip}" \
    && terraform-ls --version \
    && helmls_bin="/usr/local/bin/helm_ls" \
    && curl --fail --show-error --silent --location "https://github.com/mrjosh/helm-ls/releases/download/v${HELM_LS_VERSION}/helm_ls_linux_amd64" -o "${helmls_bin}" \
    && echo "5d857ba25c461d3218bb98d9e98cb61bc948bfa92b124667d7e6ed695fe2da5f  ${helmls_bin}" | sha256sum --check \
    && chmod +x "${helmls_bin}" \
    && "${helmls_bin}" version



LABEL org.opencontainers.image.title="Teck Orca OMP sandbox worker" \
      org.opencontainers.image.version="0.1.3" \
      org.opencontainers.image.description="Docker Sandbox runtime for Orca-managed Teck worktrees; adapted from Teck.Paseo"

RUN install -d -o agent -g agent -m 755 /home/agent/.bun /home/agent/.bun/install /home/agent/.bun/install/cache \
    && chown -R agent:agent /home/agent/.bun/install/cache

USER agent
