#!/bin/sh
set -eu
case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'Unsupported Orca sandbox architecture' >&2; exit 1 ;;
esac
payload=/usr/share/teck-orcad/bundle
target="linux-$arch-glibc"
runtime_hash=$(cat "$payload/targets/$target/.runtime-node")
install -d -m 755 /opt/teck-orcad/server "/opt/teck-orcad/runtimes/node-$runtime_hash"
cp -R "$payload/common/." /opt/teck-orcad/server/
cp -R "$payload/targets/$target/." /opt/teck-orcad/server/
tar -xzf "$payload/node/node-v24.22.1-linux-$arch.tar.gz" --strip-components=1 -C "/opt/teck-orcad/runtimes/node-$runtime_hash" -- "node-v24.22.1-linux-$arch/bin/node" "node-v24.22.1-linux-$arch/LICENSE"
printf '%s  %s\n' "$runtime_hash" "/opt/teck-orcad/runtimes/node-$runtime_hash/bin/node" | sha256sum --check
chmod 755 "/opt/teck-orcad/runtimes/node-$runtime_hash/bin/node" "/opt/teck-orcad/server/ripgrep/linux-$arch/rg"
install -m 755 /usr/share/teck-orcad/orca /usr/local/bin/orca-ide
ln -sfn /usr/local/bin/orca-ide /usr/local/bin/orca
ln -sfn "/opt/teck-orcad/runtimes/node-$runtime_hash/bin/node" /opt/teck-orcad/node
# Do not run the server during image installation: identity belongs to the feature.
