#!/bin/sh
# Shared sandbox prerequisites only: never starts, adopts or removes a cluster.
set -eu
if [ "$(id -u)" != 0 ]; then
  echo 'Teck Kubernetes prerequisites require sandbox root' >&2
  exit 1
fi
case "${1:-}" in ''|--install) ;; *) echo 'Unexpected Kubernetes prerequisite argument' >&2; exit 1 ;; esac

root=/var/lib/teck-kubernetes
if [ -L "$root" ] || { [ -e "$root" ] && [ ! -d "$root" ]; }; then
  echo 'Teck Kubernetes device directory needs inspection' >&2
  exit 1
fi
install -d -o root -g root -m 755 "$root"
exec 9>"$root/.devices.lock"
flock -x 9
for device in "$root/kmsg" /dev/kmsg; do
  if [ -L "$device" ] || { [ -e "$device" ] && { [ ! -c "$device" ] || [ "$(stat -c '%t:%T' "$device")" != '1:b' ]; }; }; then
    echo "Teck Kubernetes refuses to replace invalid device: $device" >&2
    exit 1
  fi
  if [ ! -e "$device" ]; then mknod -m 600 "$device" c 1 11; fi
  chown root:root "$device"
  chmod 600 "$device"
done

if [ "${1:-}" = --install ]; then
  # /dev is recreated at boot. Run synchronously before terminal commands as
  # well as from the workload's lifecycle startup hook (which is asynchronous).
  install -d -m 755 /etc/teck-orca
  cat > /etc/teck-orca/kubernetes-prerequisites-startup.sh <<'HOOK'
export TECK_KIND_MODE="${TECK_KIND_MODE:-sandbox}"
if [ "$(id -u)" = 0 ]; then
  /bin/sh /usr/local/lib/teck-devtools/kubernetes-prerequisites.sh
else
  sudo -n /bin/sh /usr/local/lib/teck-devtools/kubernetes-prerequisites.sh
fi
HOOK
  chmod 644 /etc/teck-orca/kubernetes-prerequisites-startup.sh
  # Upgrade the OMP launch environment on reuse without recopying its profile.
  environment=/etc/teck-orca/environment.sh
  if [ -L "$environment" ]; then echo 'Teck environment needs inspection' >&2; exit 1; fi
  touch "$environment"
  mode='export TECK_KIND_MODE="${TECK_KIND_MODE:-sandbox}"'
  if ! grep -qxF "$mode" "$environment"; then printf '\n%s\n' "$mode" >> "$environment"; fi
  hook='. /etc/teck-orca/kubernetes-prerequisites-startup.sh'
  for file in /etc/sandbox-persistent.sh /home/agent/.bashrc; do
    if [ -L "$file" ]; then echo "Teck Kubernetes startup file needs inspection: $file" >&2; exit 1; fi
    touch "$file"
    if ! grep -qxF "$hook" "$file"; then printf '\n%s\n' "$hook" >> "$file"; fi
  done
fi
