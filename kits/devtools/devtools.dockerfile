FROM docker.io/library/node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip libicu72 libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
COPY assets/ /build/
RUN node /build/install-devtools.mjs && node /build/export-devtools.mjs
FROM scratch
COPY --from=build /out/ /
