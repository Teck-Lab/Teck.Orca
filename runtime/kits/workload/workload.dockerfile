# syntax=docker/dockerfile:1.7

FROM docker.io/library/node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS omp-build
ARG BUN_VERSION
ARG OMP_VERSION
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 2000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm install --global --prefix /opt/paseo-bun --no-audit --no-fund \
      "bun@${BUN_VERSION}" \
    && npm install --global --prefix /opt/paseo-omp --no-audit --no-fund --omit=optional \
      "@oh-my-pi/pi-coding-agent@${OMP_VERSION}" \
    && omp_modules=/opt/paseo-omp/lib/node_modules/@oh-my-pi/pi-coding-agent/node_modules \
    && rm -rf \
      "$omp_modules/@huggingface" \
      "$omp_modules/sherpa-onnx-node" \
      "$omp_modules"/sherpa-onnx-* \
      "$omp_modules/onnxruntime-node" \
      "$omp_modules/onnxruntime-web" \
    && find "$omp_modules/@oh-my-pi" -mindepth 1 -maxdepth 1 -type d \
      -name 'pi-natives-*' ! -name "pi-natives-linux-$(node -p 'process.arch')" \
      -exec rm -rf {} + \
    && find /opt/paseo-omp -type f \( -name '*.map' -o -name '*.tsbuildinfo' \) -delete \
    && ln -s /opt/paseo-bun/bin/bun /opt/paseo-omp/bin/bun

ENV PATH=/opt/paseo-omp/bin:/usr/local/bin:/usr/bin:/bin

RUN test "$(bun --version)" = "${BUN_VERSION}" \
    && test "$(omp --version)" = "omp/${OMP_VERSION}" \
    && tar -C / -czf /tmp/paseo-omp-runtime.tar.gz \
      opt/paseo-bun \
      opt/paseo-omp

FROM docker.io/library/node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS devtools-build
USER root
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip libicu72 libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
COPY devtools.json install-devtools.mjs /usr/local/lib/teck-devtools/
RUN node /usr/local/lib/teck-devtools/install-devtools.mjs --pack

# Retain the exact full source base: Go/Java/uv/pip, Docker/Compose/Buildx and shell utilities.
FROM docker.io/docker/sandbox-templates:shell-docker@sha256:5fc81bc7a127e59d81b244a06831ae3212a0310b2e5a0349c54e29249e45e919 AS full-build

USER root
ENV DEBIAN_FRONTEND=noninteractive
COPY --from=omp-build /tmp/paseo-omp-runtime.tar.gz /usr/share/paseo-omp/runtime.tar.gz
COPY browser-smoke.mjs /usr/local/lib/paseo/browser-smoke.mjs

ARG PLAYWRIGHT_VERSION
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/paseo-browser/browsers

# Install a single, architecture-matching Chromium build through Playwright.
# agent-browser runs its native binary directly; no Pi extension or Node upgrade
# is needed. The hashes are the official v0.38.1 release asset digests.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl libnss3-tools \
    && npm install --global --prefix /opt/paseo-browser --no-audit --no-fund \
      "playwright-core@${PLAYWRIGHT_VERSION}" \
    && /opt/paseo-browser/bin/playwright-core install --with-deps --no-shell chromium \
    && chromium_path="$(node -p "require('/opt/paseo-browser/lib/node_modules/playwright-core').chromium.executablePath()")" \
    && test -x "$chromium_path" \
    && ln -s "$chromium_path" /usr/local/bin/chromium \
    && case "$(dpkg --print-architecture)" in \
      amd64) browser_arch=x64; browser_sha=5100149a1903211c889de4e545bf36d90803740cea4f99aa22651649f9205ea1 ;; \
      arm64) browser_arch=arm64; browser_sha=937b315ee0761e8a62f7950ddcfef9b3d3d8e8d5eb9c9d2bf9e23e5725664511 ;; \
      *) echo 'Unsupported agent-browser architecture' >&2; exit 1 ;; \
    esac \
    && curl --fail --show-error --silent --location --retry 5 \
      "https://github.com/vercel-labs/agent-browser/releases/download/v0.38.1/agent-browser-linux-${browser_arch}" \
      -o /usr/local/bin/agent-browser \
    && printf '%s  %s\n' "$browser_sha" /usr/local/bin/agent-browser | sha256sum --check \
    && chmod 0755 /usr/local/bin/agent-browser \
    && test "$(agent-browser --version)" = 'agent-browser 0.38.1' \
    && chromium --version \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash \
      build-essential \
      ca-certificates \
      curl \
      git \
      git-lfs \
      gh \
      gnupg \
      libgssapi-krb5-2 \
      libicu-dev \
      libssl3t64 \
      tzdata \
      zlib1g \
      jq \
      openssh-client \
      procps \
      python3 \
      ripgrep \
      sudo \
      unzip \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -o agent -g agent \
      /home/agent/workspace \
      /home/agent/.local/bin \
      /home/agent/.local/share \
      /home/agent/.local/state \
      /home/agent/.config \
      /home/agent/.docker/sandbox/locks \
    && printf '%s\n' 'agent ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/agent \
    && chmod 0440 /etc/sudoers.d/agent \
    && git lfs install --system

# Full feature toolchain; pins and architecture-specific hashes live in devtools.json.
COPY devtools.json install-devtools.mjs devtools-smoke.mjs /usr/local/lib/teck-devtools/
COPY --from=devtools-build /tmp/teck-devtools-runtime.tar.gz /usr/share/teck-devtools/runtime.tar.gz
RUN node /usr/local/lib/teck-devtools/install-devtools.mjs --chrome

ENV DOTNET_ROOT=/usr/share/dotnet \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1

ENV HOME=/home/agent \
    PATH=/usr/local/bin:/opt/paseo-omp/bin:/home/agent/.local/bin:/usr/local/share/npm-global/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    BASH_ENV=/etc/sandbox-persistent.sh \
    AGENT_BROWSER_EXECUTABLE_PATH=/usr/local/bin/chromium \
    AGENT_BROWSER_ARGS=--no-sandbox,--disable-dev-shm-usage \
    AGENT_BROWSER_CA_CERT=/etc/ssl/certs/ca-certificates.crt \
    AGENT_BROWSER_IGNORE_HTTPS_ERRORS=false \
    AGENT_BROWSER_CONTENT_BOUNDARIES=true \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

RUN touch /etc/sandbox-persistent.sh \
    && chown agent:agent /etc/sandbox-persistent.sh \
    && chmod 0644 /etc/sandbox-persistent.sh \
    && printf '%s\n' '. /etc/sandbox-persistent.sh' > /etc/profile.d/sandbox-persistent.sh \
    && printf '%s\n' '. /etc/sandbox-persistent.sh' >> /home/agent/.bashrc

USER agent
WORKDIR /home/agent/workspace
# Chromium's namespace sandbox is unavailable in this container; Docker Sandbox
# supplies the outer microVM boundary. Certificate validation stays enabled.
# Exercise the CLI as the same non-root user before publishing the kit image.
# This is a loopback-only test; runtime proxy/CA handling is tested separately.
RUN node /usr/local/lib/paseo/browser-smoke.mjs
# Flatten only after the high-file-count trees are archived. Copying a cleaned
# stage into scratch avoids exposing the source template's oversized layers to
# Docker's kit assembler; the lifecycle restores every archived tool tree.
USER root
COPY pack-base-devtools.mjs /usr/local/lib/teck-devtools/
RUN node /usr/local/lib/teck-devtools/pack-base-devtools.mjs

FROM scratch
COPY --from=full-build / /
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global \
    PLAYWRIGHT_BROWSERS_PATH=/opt/paseo-browser/browsers \
    NO_PROXY=localhost,127.0.0.1,::1,172.17.0.0/16 \
    no_proxy=localhost,127.0.0.1,::1,172.17.0.0/16
ENV DOTNET_ROOT=/usr/share/dotnet \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1

ENV HOME=/home/agent \
    PATH=/usr/local/bin:/opt/paseo-omp/bin:/home/agent/.local/bin:/usr/local/share/npm-global/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin \
    BASH_ENV=/etc/sandbox-persistent.sh \
    AGENT_BROWSER_EXECUTABLE_PATH=/usr/local/bin/chromium \
    AGENT_BROWSER_ARGS=--no-sandbox,--disable-dev-shm-usage \
    AGENT_BROWSER_CA_CERT=/etc/ssl/certs/ca-certificates.crt \
    AGENT_BROWSER_IGNORE_HTTPS_ERRORS=false \
    AGENT_BROWSER_CONTENT_BOUNDARIES=true \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt


USER agent
WORKDIR /home/agent/workspace
LABEL com.docker.sandboxes.start-docker="true"
ENTRYPOINT ["tini", "--", "sleep"]
CMD ["infinity"]
