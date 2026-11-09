FROM docker.io/sbx/shell-docker-image@sha256:ef7339e2a393b116314815788d02727c833207e4438e661462a2313ff4f2a3ff AS build
USER root
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/paseo-browser/browsers
COPY assets/ /build/
RUN npm install --global --prefix /opt/paseo-browser --no-audit --no-fund playwright-core@1.61.1 \
    && /opt/paseo-browser/bin/playwright-core install --no-shell chromium \
    && node /build/install-browser.mjs
FROM scratch
COPY --from=build /out/ /
