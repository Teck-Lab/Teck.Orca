import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

// Run only inside a recorded disposable lab with the managed KIND test profile.
const config=JSON.parse(fs.readFileSync('/etc/teck-orca/kubernetes.json','utf8'));
assert.ok(config.projectId.startsWith('isolated-kubernetes-'));
const image=process.argv[2];
assert.match(image??'',/^kindest\/node:v[\w.]+@sha256:[a-f0-9]{64}$/);
const helper='/usr/local/lib/teck-devtools/kubernetes-prerequisites.sh';
const script=`set -eu
pids=''
for i in 1 2 3 4 5 6 7 8; do /bin/sh /helper.sh & pids="$pids $!"; done
for pid in $pids; do wait "$pid"; done
test -c /dev/kmsg
test -c /var/lib/teck-kubernetes/kmsg
before=$(stat -c '%i' /var/lib/teck-kubernetes/kmsg)
/bin/sh /helper.sh
test "$(stat -c '%i' /var/lib/teck-kubernetes/kmsg)" = "$before"
# Invalid nodes are refused, not overwritten. All removals here are inside
# this disposable child container's private /dev, never the sandbox's /dev.
rm /dev/kmsg
printf sentinel > /dev/kmsg
if /bin/sh /helper.sh; then exit 1; fi
test "$(cat /dev/kmsg)" = sentinel
rm /dev/kmsg
mkdir /dev/kmsg
if /bin/sh /helper.sh; then exit 1; fi
test -d /dev/kmsg
rmdir /dev/kmsg
ln -s /dev/null /dev/kmsg
if /bin/sh /helper.sh; then exit 1; fi
test -L /dev/kmsg
rm /dev/kmsg
mknod /dev/kmsg c 1 3
if /bin/sh /helper.sh; then exit 1; fi
test "$(stat -c '%t:%T' /dev/kmsg)" = '1:3'
echo 'PASS: concurrent device preparation, stable inode, invalid file/directory/symlink/device rejection'
`;
const output=execFileSync('docker',['run','--rm','-i','--privileged','--mount',`type=bind,source=${helper},target=/helper.sh,readonly`,'--entrypoint','/bin/sh',image,'-s'],{input:script,encoding:'utf8',timeout:60000});
process.stdout.write(output);
