# Shared ABI packages belong to the workload, never to an overlay mixin.
FROM docker.io/sbx/shell-docker-image@sha256:ef7339e2a393b116314815788d02727c833207e4438e661462a2313ff4f2a3ff
USER root
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends git-lfs gnupg libgssapi-krb5-2 libicu-dev libssl3t64 zlib1g util-linux libnss3-tools libgtk-3-0t64 libvulkan1 fonts-liberation xdg-utils \
    && NPM_CONFIG_CACHE=/tmp/teck-playwright-npm npm install --global --prefix /tmp/teck-playwright --no-audit --no-fund playwright-core@1.61.1 \
    && /tmp/teck-playwright/bin/playwright-core install-deps chromium \
    && rm -rf /var/lib/apt/lists/* /tmp/teck-playwright-npm /tmp/teck-playwright \
    && install -d -o agent -g agent -m 755 /usr/local/share/npm-global/lib/node_modules /usr/local/share/npm-global/bin \
    && touch /etc/sandbox-persistent.sh \
    && chown agent:agent /etc/sandbox-persistent.sh \
    && chmod 0644 /etc/sandbox-persistent.sh
ENV TECK_KIND_MODE=sandbox \
    HOME=/home/agent \
    BASH_ENV=/etc/sandbox-persistent.sh \
    DOTNET_ROOT=/usr/share/dotnet \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/paseo-browser/browsers \
    AGENT_BROWSER_EXECUTABLE_PATH=/usr/local/bin/chromium \
    AGENT_BROWSER_ARGS=--no-sandbox,--disable-dev-shm-usage \
    AGENT_BROWSER_CA_CERT=/etc/ssl/certs/ca-certificates.crt \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
LABEL com.docker.sandboxes.start-docker=true
USER agent
WORKDIR /home/agent/workspace
ENTRYPOINT ["tini", "--"]
CMD ["sleep", "infinity"]
