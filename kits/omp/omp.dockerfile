FROM docker.io/library/node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
RUN npm install --global --prefix /opt/paseo-bun --no-audit --no-fund bun@1.4.4 \
    && ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install --global --prefix /opt/paseo-omp --no-audit --no-fund --omit=optional @oh-my-pi/pi-coding-agent@18.18.3 \
    && omp_modules=/opt/paseo-omp/lib/node_modules/@oh-my-pi/pi-coding-agent/node_modules \
    && rm -rf "$omp_modules/@huggingface" "$omp_modules"/sherpa-onnx-* "$omp_modules/onnxruntime-node" "$omp_modules/onnxruntime-web" \
    && find "$omp_modules/@oh-my-pi" -mindepth 1 -maxdepth 1 -type d -name 'pi-natives-*' ! -name "pi-natives-linux-$(node -p 'process.arch')" -exec rm -rf {} + \
    && find /opt/paseo-omp -type f \( -name '*.map' -o -name '*.tsbuildinfo' \) -delete \
    && ln -s /opt/paseo-bun/bin/bun /opt/paseo-omp/bin/bun \
    && mkdir -p /out/usr/local/bin \
    && ln -s /opt/paseo-bun/bin/bun /out/usr/local/bin/bun \
    && ln -s /opt/paseo-bun/bin/bunx /out/usr/local/bin/bunx \
    && ln -s /opt/paseo-omp/bin/omp /out/usr/local/bin/omp
ENV PATH=/opt/paseo-omp/bin:/usr/local/bin:/usr/bin:/bin
RUN test "$(bun --version)" = 1.4.4 && test "$(omp --version)" = omp/18.18.3
FROM scratch
COPY --from=build /opt/paseo-bun /opt/paseo-bun
COPY --from=build /opt/paseo-omp /opt/paseo-omp
COPY --from=build /out/ /
