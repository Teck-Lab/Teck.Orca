# syntax=docker/dockerfile:1.7
FROM docker.io/library/node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
COPY bundle /usr/share/teck-orcad/bundle
COPY install.sh orca /usr/share/teck-orcad/
