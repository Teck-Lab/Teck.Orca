FROM scratch
COPY --chown=1000:1000 assets/omp/ /home/agent/.omp/agent/
COPY assets/launch/ /usr/local/lib/teck-orca/
