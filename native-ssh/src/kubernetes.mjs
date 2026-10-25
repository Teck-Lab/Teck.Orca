import {createHash} from 'node:crypto';
import {cpSync,lstatSync,mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import {quote} from './system.mjs';

const hosts='argoproj.github.io:443,charts.jetstack.io:443,get.helm.sh:443,ghcr.io:443,*.ghcr.io:443,quay.io:443,*.quay.io:443,cr.kgateway.dev:443,registry.k8s.io:443,*.pkg.dev:443,ecr-public.aws.com:443,public.ecr.aws:443,d2glxqk2uabbnd.cloudfront.net:443';
function entries(root,prefix=''){
  return readdirSync(root).sort().flatMap(name=>{
    const path=join(root,name),stat=lstatSync(path);if(stat.isSymbolicLink())throw Error('Kubernetes asset symlink is forbidden');
    return stat.isDirectory()?entries(path,prefix+name+'/'):[[prefix+name,createHash('sha256').update(readFileSync(path)).digest('hex')]];
  });
}
async function verify(name,id,run){
  const rows=JSON.parse(await run('sbx',['ls','--json']));
  if(!Array.isArray(rows)||rows.filter(r=>r.name===name).length!==1||rows.find(r=>r.name===name)?.id!==id)throw Error('Kubernetes preparation sandbox identity changed');
}
export async function configureKubernetes({name,project,assetRoot,sandboxId,run}){
  if(project.kubernetes!=='workspace')return;
  const source=join(assetRoot,'assets/kubernetes'),digest=createHash('sha256').update(JSON.stringify(entries(source))).update(readFileSync(new URL(import.meta.url),'utf8').replaceAll('\r\n','\n')).digest('hex');
  await verify(name,sandboxId,run);
  const node=(await run('sbx',['exec','-u','root',name,'node','-p','process.execPath'])).trim();
  if(!/^\/[A-Za-z0-9/._-]+$/.test(node))throw Error('Invalid guest Node path');
  const installed=await run('sbx',['exec','-u','root',name,node,'-e',
    "const fs=require('fs');const p='/etc/teck-orca/kubernetes.json';if(fs.existsSync(p)){const c=JSON.parse(fs.readFileSync(p));if(c.projectId!==process.argv[1])throw Error('Kubernetes belongs to another project');if(c.assetDigest===process.argv[2])process.stdout.write('present');}",project.id,digest]);
  if(installed.trim()!=='present'){
    const staging=mkdtempSync(join(tmpdir(),'teck-native-ssh-'));
    try{
      cpSync(source,join(staging,'kubernetes'),{recursive:true});
      await verify(name,sandboxId,run);await run('sbx',['cp',staging,`${name}:/tmp/`]);
      const remote='/tmp/'+basename(staging),destination='/usr/local/lib/teck-kubernetes/'+digest;
      const config={version:1,projectId:project.id,profile:'workspace',root:'/var/lib/teck-kubernetes',projectRoot:'/home/agent/project',assetDigest:digest};
      const wrapper=`#!/bin/sh\nexec sudo -n --preserve-env=ORCA_WORKTREE_ID,ORCA_PANE_KEY,HTTP_PROXY,HTTPS_PROXY,ALL_PROXY,NO_PROXY,http_proxy,https_proxy,all_proxy,no_proxy,PROXY_CA_CERT_B64,NODE_EXTRA_CA_CERTS ${quote(node)} ${quote(destination+'/main.mjs')} "$@" --config /etc/teck-orca/kubernetes.json\n`;
      const startup='case $- in *i*)\nexport NO_PROXY="${NO_PROXY:+$NO_PROXY,}127.0.0.1,localhost,.teck.test,.svc,.svc.cluster.local"\nexport no_proxy="$NO_PROXY"\n/usr/local/bin/teck-kube start >/dev/null 2>&1 || true\n;; esac\n';
      const attach="const fs=require('fs');const p='/etc/teck-orca/omp-recovery.sh';const hook='. /etc/teck-orca/kubernetes-startup.sh';if(fs.existsSync(p)){let s=fs.readFileSync(p,'utf8');if(!s.includes(hook)){const marker='. /etc/teck-orca/environment.sh\\n';if(!s.includes(marker))throw Error('OMP recovery hook needs inspection');s=s.replace(marker,marker+hook+'\\n');fs.writeFileSync(p,s);}}else{const p='/home/agent/.bashrc';let s=fs.readFileSync(p,'utf8');if(!s.includes(hook))fs.appendFileSync(p,'\\n'+hook+'\\n');}";
      const guidance='<!-- teck-managed-kubernetes:start -->\nWhen /etc/teck-orca/kubernetes.json exists, this project uses one persistent managed workspace Kubernetes cluster. Use teck-kube status, deploy, promote, cleanup and kubectl. This replaces earlier per-task kind instructions for this enabled project. Never delete the shared cluster or change the default kubeconfig. Deploy and promote require the Orca worktree terminal context. Workspace profile uses kindnet and no mesh; it does not validate production mTLS or Cilium. See deployment/ in the application and apps/local/ plus bootstrap/local/ in Teck.GitOps.\n<!-- teck-managed-kubernetes:end -->';
      const guide="const fs=require('fs');const p='/home/agent/AGENTS.md';if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Agent guidance symlink needs inspection');let s=fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';const g=process.argv[1];s=s.replace(/<!-- teck-managed-kubernetes:start -->[\\s\\S]*?<!-- teck-managed-kubernetes:end -->\\n?/g,'');fs.writeFileSync(p,s.trimEnd()+'\\n\\n'+g+'\\n');";
      const script=[
        'set -eu','install -d -m 755 /etc/teck-orca /usr/local/lib/teck-kubernetes',
        `if ! test -d ${quote(destination)}; then mv ${quote(remote+'/kubernetes')} ${quote(destination)}; fi`,
        `chown -R root:root ${quote(destination)}`,`find ${quote(destination)} -type d -exec chmod 755 {} +`,`find ${quote(destination)} -type f -exec chmod 644 {} +`,
        `printf '%s' ${quote(JSON.stringify(config)+'\n')} > /etc/teck-orca/kubernetes.json.tmp`,
        'chmod 644 /etc/teck-orca/kubernetes.json.tmp',
        `printf '%s' ${quote(wrapper)} > /usr/local/bin/teck-kube`,`printf '%s' ${quote(startup)} > /etc/teck-orca/kubernetes-startup.sh`,
        'chmod 755 /usr/local/bin/teck-kube','chmod 644 /etc/teck-orca/kubernetes-startup.sh',
        `${quote(node)} -e ${quote(attach)}`,`${quote(node)} -e ${quote(guide)} ${quote(guidance)}`,
        'mv /etc/teck-orca/kubernetes.json.tmp /etc/teck-orca/kubernetes.json',
        `rm -rf -- ${quote(remote)}`,
      ].join('\n')+'\n';
      await run('sbx',['exec','-u','root',name,'sh','-s'],{input:script});
    }finally{rmSync(staging,{recursive:true,force:true});}
  }
  await verify(name,sandboxId,run);
  await run('sbx',['policy','allow','network','--sandbox',name,hosts]);
  // Starts a detached guest process with retained diagnostics, never a host worker.
  await run('sbx',['exec','-u','root',name,node,'/usr/local/lib/teck-kubernetes/'+digest+'/main.mjs','start']);
}
