import {randomUUID} from 'node:crypto';
import {chmodSync,existsSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {checksum} from './bundle.mjs';
import {directory,readJson,writeJson} from './state.mjs';
import {paths,chartDeclaration} from './layout.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {withProjectLock} from './state.mjs';

const dns=value=>typeof value==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
const pinned=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
async function artifact(pin,destination,run){
  if(!pinned(pin.sha256)||!pin.url?.startsWith('https://'))throw Error('An HTTPS artifact and SHA-256 pin are required');
  if(!existsSync(destination)){
    const temporary=destination+'.'+randomUUID()+'.tmp';
    await run('curl',['--fail','--silent','--show-error','--location','--retry','3','--proto','=https','--proto-redir','=https',pin.url,'-o',temporary]);
    if(checksum(readFileSync(temporary))!==pin.sha256)throw Error('Downloaded platform artifact checksum mismatch');
    renameSync(temporary,destination);
  }
  if(checksum(readFileSync(destination))!==pin.sha256)throw Error('Cached platform artifact checksum mismatch');
  return destination;
}
async function helmTool(lock,cache,run){
  const arch={x64:'amd64',arm64:'arm64'}[process.arch],sha=lock.helm?.sha256?.[process.arch];
  if(!arch||!pinned(sha)||!/^\d+\.\d+\.\d+$/.test(lock.helm.version))throw Error('Unsupported or unpinned Helm tool');
  const folder=directory(join(cache,'helm-'+sha)),archive=join(folder,'helm.tar.gz');
  await artifact({url:`https://get.helm.sh/helm-v${lock.helm.version}-linux-${arch}.tar.gz`,sha256:sha},archive,run);
  await run('tar',['-xzf',archive,'-C',folder,`linux-${arch}/helm`]);
  const binary=join(folder,`linux-${arch}/helm`);chmodSync(binary,0o755);
  const version=await run(binary,['version','--template','{{.Version}}']);
  if(version.trim()!=='v'+lock.helm.version)throw Error('Unexpected Helm version');
  return binary;
}
export async function installNodeProxyCA({nodes,run,certificate=process.env.PROXY_CA_CERT_B64}){
  if(!certificate)return;
  const ca=Buffer.from(certificate,'base64').toString('utf8');
  if(!ca.includes('-----BEGIN CERTIFICATE-----')||ca.includes('PRIVATE KEY'))throw Error('Expected a public sandbox proxy CA');
  for(const node of nodes){
    const path='/usr/local/share/ca-certificates/teck-sandbox-proxy.crt';
    const current=await run('docker',['exec',node.id,'sh','-c',`if test -f ${path}; then cat ${path}; fi`]);
    if(checksum(current)!==checksum(ca)){
      await run('docker',['exec','-i',node.id,'sh','-c',`cat > ${path} && update-ca-certificates && systemctl restart containerd`],{input:ca});
    }
  }
}
async function trustIngressCA({k,run,name}){
  const secret=JSON.parse(await k('-n','teck-local-edge','get','secret','local-ca','-o','json'));
  const ca=Buffer.from(secret.data?.['tls.crt']??'','base64').toString('utf8');
  if(!ca.includes('-----BEGIN CERTIFICATE-----')||ca.includes('PRIVATE KEY'))throw Error('Local public CA certificate is unavailable');
  const path='/usr/local/share/ca-certificates/'+name+'.crt';
  if(!existsSync(path)||readFileSync(path,'utf8')!==ca){writeFileSync(path,ca,{mode:0o644});await run('update-ca-certificates',[]);}
  if(existsSync('/usr/bin/certutil')){
    const db='/home/agent/.pki/nssdb';await run('install',['-d','-o','agent','-g','agent','-m','700',db]);
    if(!existsSync(join(db,'cert9.db')))await run('runuser',['-u','agent','--','certutil','-N','--empty-password','-d','sql:'+db]);
    await run('runuser',['-u','agent','--','certutil','-A','-d','sql:'+db,'-n',name,'-t','C,,','-i',path]);
  }
  return ca;
}
async function configureDNS(k){
  const service=JSON.parse(await k('-n','teck-local-edge','get','service','edge','-o','json'));
  const ip=service.spec.clusterIP;
  if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip??''))throw Error('Gateway ClusterIP is unavailable');
  const cm=JSON.parse(await k('-n','kube-system','get','configmap','coredns','-o','json'));
  const begin='# BEGIN TECK LOCAL DNS',end='# END TECK LOCAL DNS';
  const original=cm.data.Corefile;
  if(original.includes('teck.test:53')&&!original.includes(begin))throw Error('An unowned local DNS rule already exists');
  const clean=original.replace(/# BEGIN TECK LOCAL DNS[\s\S]*?# END TECK LOCAL DNS\n?/g,'');
  const block=`${begin}\nteck.test:53 {\n    errors\n    template IN A {\n        match .*\\.teck\\.test\\.\n        answer "{{ .Name }} 30 IN A ${ip}"\n    }\n}\n${end}\n`;
  if(original!==clean+block)await k('-n','kube-system','patch','configmap','coredns','--type=merge','-p',JSON.stringify({data:{Corefile:clean+block}}));
}
const addonCharts={cnpg:['cloudnative-pg'],rollouts:['argo-rollouts'],gateway:['cert-manager','kgateway-crds','kgateway']};
export async function installAddons({names=[],cluster,bundle,run,resume=false}){
  if(!Array.isArray(names)||names.some(n=>!Object.hasOwn(addonCharts,n)))throw Error('Available local add-ons: cnpg, rollouts, gateway');
  const folder=cluster.folder??join(cluster.kubeconfig,'..'),statePath=join(folder,'addons.json');
  return withProjectLock(join(folder,'addons'),async()=>{
    const state=existsSync(statePath)?readJson(statePath):{version:1,requested:[]};
    const requested=[...new Set([...state.requested,...names])];
    if(!requested.length)return {installed:[]};
    if(requested.some(n=>!Object.hasOwn(addonCharts,n)))throw Error('Recorded add-on is not supported');
    writeJson(statePath,{...state,requested});
    const lock=bundle.json(paths.lock),cache=directory(join(folder,'cache')),helm=await helmTool(lock,cache,run);
    const kubeconfig=cluster.kubeconfig,k=(...args)=>run('kubectl',['--kubeconfig',kubeconfig,...args]);
    if(requested.includes('gateway')){
      const crds=await artifact(lock.gatewayAPI,join(cache,'gateway-api.yaml'),run);
      await k('apply','--server-side','--field-manager=teck-local-platform','-f',crds);
    }
    const recordsPath=join(folder,'components.json'),records=existsSync(recordsPath)?readJson(recordsPath):{};
    for(const name of [...new Set(requested.flatMap(n=>addonCharts[n]))]){
      const pin=lock.charts.find(c=>c.name===name);if(!pin)throw Error('Missing pinned chart '+name);chartDeclaration(bundle,pin);
      const existing=JSON.parse(await run(helm,['list','--kubeconfig',kubeconfig,'-n',pin.namespace,'--all','--filter','^'+pin.name+'$','-o','json']));
      if(existing.length&&(!records[name]||existing.length!==1||existing[0].chart!==pin.archive.slice(0,-4)||records[name].sha256!==pin.sha256))throw Error('Unowned or changed platform release: '+name);
      if(existing[0]?.status!=='deployed'||records[name]?.phase!=='ready'){
        const archive=join(cache,pin.archive);
        if(!existsSync(archive)){
          const staging=directory(join(cache,randomUUID()));
          await run(helm,['pull',pin.chart,...(pin.repository?['--repo',pin.repository]:[]),'--version',pin.version,'--destination',staging]);
          if(checksum(readFileSync(join(staging,pin.archive)))!==pin.sha256)throw Error('Platform chart checksum mismatch: '+name);
          renameSync(join(staging,pin.archive),archive);
        }
        if(checksum(readFileSync(archive))!==pin.sha256)throw Error('Cached chart checksum mismatch: '+name);
        records[name]={sha256:pin.sha256,phase:'installing'};writeJson(recordsPath,records);
        await run(helm,['upgrade','--install',name,archive,'--kubeconfig',kubeconfig,'--namespace',pin.namespace,'--create-namespace','--values',join(bundle.root,pin.values),'--wait','--timeout','300s','--history-max','3']);
        records[name]={sha256:pin.sha256,phase:'ready'};writeJson(recordsPath,records);
      }
      const workloads=JSON.parse(await k('-n',pin.namespace,'get','deployment,statefulset,daemonset','-o','json')).items;
      for(const row of workloads)await k('-n',pin.namespace,'rollout','status',row.kind.toLowerCase()+'/'+row.metadata.name,'--timeout=180s');
    }
    if(requested.includes('rollouts'))await k('apply','-k',join(bundle.root,paths.rbac));
    if(requested.includes('gateway')){
      await k('apply','-k',join(bundle.root,paths.namespaces));
      await k('apply','-k',join(bundle.root,paths.certificates));
      await k('-n','teck-local-edge','wait','certificate','local-ca','local-ingress','--for=condition=Ready','--timeout=180s');
      await trustIngressCA({k,run,name:cluster.name});
      await k('apply','-k',join(bundle.root,paths.gateway));
      await k('-n','teck-local-edge','wait','gateway','edge','--for=condition=Programmed','--timeout=180s');
      await configureDNS(k);await k('-n','kube-system','rollout','status','deployment/coredns','--timeout=120s');
    }
    writeJson(statePath,{version:1,requested,phase:'ready'});return {installed:requested};
  });
}
export async function bootstrapWorkspace({bundle,name,folder,nodes,kubeconfig,run}){
  // Default startup is just KIND. Resume only explicitly requested add-ons.
  await installNodeProxyCA({nodes,run});
  return installAddons({names:[],cluster:{name,folder,kubeconfig},bundle,run,resume:true});
}
