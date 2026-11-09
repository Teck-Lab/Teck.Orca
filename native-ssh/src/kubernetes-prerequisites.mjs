import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {quote} from './system.mjs';

// Also upgrades an existing owned sandbox without recopying its OMP profile,
// starting KIND, changing Docker, or touching a project checkout.
export async function ensureKubernetesPrerequisites({name,assetRoot,run}){
  const script=readFileSync(join(assetRoot,'assets/kits/workload/kubernetes-prerequisites.sh'),'utf8').replaceAll('\r\n','\n');
  const destination='/usr/local/lib/teck-devtools/kubernetes-prerequisites.sh';
  await run('sbx',['exec','-i','-u','root',name,'sh','-s'],{input:[
    'set -eu',
    'install -d -o root -g root -m 755 /usr/local/lib/teck-devtools',
    `printf '%s' ${quote(script)} > ${destination}.tmp`,
    `chmod 755 ${destination}.tmp`,
    `mv ${destination}.tmp ${destination}`,
    `/bin/sh ${destination} --install`,
  ].join('\n')+'\n'});
}
