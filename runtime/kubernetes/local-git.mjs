import {existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {directory,readJson,withProjectLock,writeJson} from './state.mjs';
import {paths,chartDeclaration} from './layout.mjs';
import {checksum} from './bundle.mjs';

export const appRepository='http://git.teck-local-sources.svc.cluster.local:9418/apps.git';
export const platformRepository='http://git.teck-local-sources.svc.cluster.local:9418/gitops.git';
export function localGit(run,folder,args){
  return run('git',['-C',folder,'-c','http.proxy=','-c','credential.helper=','-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','-c','user.name=Teck Local Development','-c','user.email=local-development@agents.invalid',...args],
    {env:{GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_SYSTEM:'/dev/null',GIT_ALLOW_PROTOCOL:'http',GIT_TERMINAL_PROMPT:'0',GIT_EDITOR:'true',LC_ALL:'C'}});
}
export async function syncLocalGitOps(folder,run){
  const source=directory(join(folder,'local-gitops'));
  if(!existsSync(join(source,'.git')))await localGit(run,source,['init','--initial-branch=main']);
  await localGit(run,source,['config','remote.origin.url','http://127.0.0.1:19418/gitops.git']);
  if((await localGit(run,source,['ls-remote','origin','refs/heads/main'])).trim()){
    await localGit(run,source,['fetch','origin','refs/heads/main']);
    if((await localGit(run,source,['for-each-ref','--format=%(refname)','refs/heads/main'])).trim())await localGit(run,source,['rebase','--autostash','FETCH_HEAD']);
    else await localGit(run,source,['checkout','-B','main','FETCH_HEAD']);
  }
  return source;
}
export async function seedPlatformSource({bundle,folder,run}){
  const marker=join(folder,'seed-state.json');
  if(existsSync(marker)&&readJson(marker).contentSha256===bundle.contentSha256)return;
  return withProjectLock(join(folder,'gitops-writer'),async()=>{
  if(existsSync(marker)&&readJson(marker).contentSha256===bundle.contentSha256)return;
  const source=await syncLocalGitOps(folder,run);
  for(const name of Object.keys(bundle.files)){
    const path=join(source,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bundle.read(name));
  }
  // Controller pods consume only the private Git source. Vendor verified public
  // artifacts in this generated mirror, preserving the repo's app entry points.
  const lock=bundle.json(paths.lock);
  for(const pin of lock.charts){
    const chart=chartDeclaration(bundle,pin),archive=join(folder,'cache',pin.archive);
    if(checksum(readFileSync(archive))!==pin.sha256)throw Error('Chart cache differs from the canonical source lock');
    const home=directory(join(source,pin.source,'charts'));
    if(!existsSync(join(home,chart.name)))await run('tar',['-xzf',archive,'-C',home]);
  }
  const crds=readFileSync(join(folder,'cache/gateway-api.yaml'));
  if(checksum(crds)!==lock.gatewayAPI.sha256)throw Error('Gateway API cache differs from the source lock');
  const gateway=join(source,'apps/local/network/gateway-api');
  writeFileSync(join(gateway,'crds.yaml'),crds);
  writeJson(join(gateway,'kustomization.yaml'),{apiVersion:'kustomize.config.k8s.io/v1beta1',kind:'Kustomization',resources:['crds.yaml']});
  await localGit(run,source,['add','.']);
  if((await localGit(run,source,['status','--porcelain'])).trim()){
    await localGit(run,source,['commit','-m','chore(local): seed pinned platform '+bundle.contentSha256]);
    await localGit(run,source,['push','origin','HEAD:refs/heads/main']);
  }else await localGit(run,source,['push','origin','HEAD:refs/heads/main']);
  writeJson(marker,{contentSha256:bundle.contentSha256});
  });
}
