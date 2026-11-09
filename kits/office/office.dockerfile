FROM scratch
COPY --chown=1000:1000 assets/omp/ /home/agent/.omp/agent/
COPY initialize.mjs /usr/local/lib/teck-office/initialize.mjs
