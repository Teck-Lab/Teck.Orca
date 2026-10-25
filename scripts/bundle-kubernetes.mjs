// Explicit maintenance only. Build/startup never reads a changing GitOps checkout.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundleFiles,bundleSnapshot,loadBundle} from '../runtime/kubernetes/bundle.mjs';

const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const index=process.argv.indexOf('--gitops');
if(index<0||!process.argv[index+1])throw Error('Pass --gitops <existing Teck.GitOps checkout>');
const gitops=resolve(process.argv[index+1]),destination=join(repository,'runtime/kubernetes/gitops');
const roots=['bootstrap/local','cluster-resources/local','apps/local','projects/local'];
const shared=['AGENTS.md','apps/AGENTS.md','docs/local-development.md',...['network','platform','security','system'].map(g=>'projects/'+g+'.yaml'),
  'apps/in-cluster/security/keycloak/development-realm.yaml','apps/in-cluster/security/keycloak/clients/development/teck-public-gateway-client.yaml'];
const names=[...shared,...roots.flatMap(root=>bundleFiles(join(gitops,root)).map(name=>root+'/'+name))];
const revision=execFileSync('git',['-C',gitops,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=!!execFileSync('git',['-C',gitops,'status','--porcelain','--',...roots,...shared],{encoding:'utf8'}).trim();
const files=Object.fromEntries(names.map(name=>[name,readFileSync(join(gitops,name),'utf8').replaceAll('\r\n','\n')]));
const snapshot=bundleSnapshot({files,revision,dirty});
const expected={...files,'snapshot.json':JSON.stringify(snapshot,null,2)+'\n'};
if(existsSync(destination)){
  const obsolete=bundleFiles(destination).filter(name=>!Object.hasOwn(expected,name));
  if(obsolete.length){if(!process.argv.includes('--replace'))throw Error('Obsolete bundled files exist; inspect before --replace');loadBundle(destination);for(const name of obsolete)unlinkSync(join(destination,name));}
}
for(const [name,text] of Object.entries(expected)){const path=join(destination,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);}
console.log(`Packaged GitOps local configuration ${snapshot.contentSha256} (${dirty?'uncommitted source changes':'clean source'}). No runtime resources created.`);
