# syntax=docker/dockerfile:1.7

FROM docker.io/library/node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build

ARG BUN_VERSION
ARG OMP_VERSION

RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 2000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm install --global --prefix /out/opt/paseo-omp --no-audit --no-fund \
      "bun@${BUN_VERSION}" \
      "@oh-my-pi/pi-coding-agent@${OMP_VERSION}"

ENV PATH="/out/opt/paseo-omp/bin:${PATH}"

RUN test "$(bun --version)" = "${BUN_VERSION}" \
    && test "$(omp --version)" = "omp/${OMP_VERSION}"

FROM scratch

COPY --from=build /out/ /
