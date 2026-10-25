// Explicit maintenance only. Build/startup never reads a changing GitOps checkout.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundleFiles,bundleSnapshot} from '../runtime/kubernetes/bundle.mjs';

const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const index=process.argv.indexOf('--gitops');
if(index<0||!process.argv[index+1])throw Error('Pass --gitops <existing Teck.GitOps checkout>');
const gitops=resolve(process.argv[index+1]),source=join(gitops,'local'),destination=join(repository,'runtime/kubernetes/gitops');
const revision=execFileSync('git',['-C',gitops,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=!!execFileSync('git',['-C',gitops,'status','--porcelain','--','local'],{encoding:'utf8'}).trim();
const files=Object.fromEntries(bundleFiles(source).map(name=>[name,readFileSync(join(source,name),'utf8').replaceAll('\r\n','\n')]));
const snapshot=bundleSnapshot({files,revision,dirty});
const expected={...files,'snapshot.json':JSON.stringify(snapshot,null,2)+'\n'};
if(existsSync(destination)&&bundleFiles(destination).some(name=>!Object.hasOwn(expected,name)))throw Error('Obsolete bundled files exist; inspect before replacing the snapshot');
for(const [name,text] of Object.entries(expected)){const path=join(destination,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);}
console.log(`Packaged GitOps local configuration ${snapshot.contentSha256} (${dirty?'uncommitted source changes':'clean source'}). No runtime resources created.`);
