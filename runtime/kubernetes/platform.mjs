import {randomUUID} from 'node:crypto';
import {chmodSync,existsSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {checksum} from './bundle.mjs';
import {directory,readJson,writeJson} from './state.mjs';
import {paths,chartDeclaration} from './layout.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {localGit} from './local-git.mjs';

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
export async function ensureRegistry({name,folder,nodes,lock,run,kubeconfig}){
  const registryName=name.replace('teck-local-','teck-registry-'),path=join(folder,'registry.json');
  if(!dns(registryName)||!/^registry:\d+\.\d+\.\d+@sha256:[a-f0-9]{64}$/.test(lock.registry?.image)||lock.registry.port!==5001)throw Error('Invalid local registry pin');
  const ids=(await run('docker',['ps','-aq','--no-trunc','--filter',`name=^/${registryName}$`])).trim().split(/\s+/).filter(Boolean);
  if(ids.length>1||ids.some(id=>!pinned(id)))throw Error('Cannot verify local registry inventory');
  let state=existsSync(path)?readJson(path):null;
  if(!state&&ids.length)throw Error('An unowned local registry uses this project name');
  if(state&&(state.name!==registryName||state.image!==lock.registry.image||state.id!==ids[0]))throw Error('Local registry identity changed or is missing; retained ownership');
  if(!state){
    const data=directory(join(folder,'registry-data'));
    const id=(await run('docker',['run','-d','--restart=unless-stopped','--network','kind','--name',registryName,'--label','teck.orca.io/cluster='+name,'--publish','127.0.0.1:5001:5000','--mount',`type=bind,source=${data},target=/var/lib/registry`,lock.registry.image])).trim();
    if(!pinned(id))throw Error('Cannot record the local registry identity');
    state={name:registryName,id,image:lock.registry.image};writeJson(path,state);
  }
  let row=JSON.parse(await run('docker',['inspect',state.id]));
  if(row.length!==1||row[0].Id!==state.id||row[0].Name!=='/'+registryName||row[0].Config?.Image!==state.image||row[0].Config.Labels?.['teck.orca.io/cluster']!==name)throw Error('Local registry provider identity changed');
  if(!row[0].State.Running){await run('docker',['start',state.id]);row=JSON.parse(await run('docker',['inspect',state.id]));}
  const hosts=`[host."http://${registryName}:5000"]\n  capabilities = ["pull", "resolve"]\n`;
  for(const node of nodes){
    await run('docker',['exec','-i',node.id,'sh','-c','mkdir -p /etc/containerd/certs.d/localhost:5001 && cat > /etc/containerd/certs.d/localhost:5001/hosts.toml'],{input:hosts});
    const info=JSON.parse(await run('docker',['inspect',node.id]));
    const original=info[0].Config.Env.find(s=>s.startsWith('NO_PROXY='))?.slice(9)??'';
    if(/[\r\n\0]/.test(original))throw Error('Invalid node proxy exclusions');
    const value=original+','+registryName;
    const dropin='[Service]\nEnvironment='+JSON.stringify('NO_PROXY='+value)+'\nEnvironment='+JSON.stringify('no_proxy='+value)+'\n';
    const path='/etc/systemd/system/containerd.service.d/99-teck-local.conf';
    const current=await run('docker',['exec',node.id,'sh','-c',`if test -f ${path}; then cat ${path}; fi`]);
    if(current!==dropin)await run('docker',['exec','-i',node.id,'sh','-c',`mkdir -p /etc/systemd/system/containerd.service.d && cat > ${path} && systemctl daemon-reload && systemctl restart containerd`],{input:dropin});
  }
  const ip=row[0].NetworkSettings?.Networks?.kind?.IPAddress;
  if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip??''))throw Error('Cannot verify local registry network address');
  const items=[
    {apiVersion:'v1',kind:'Service',metadata:{name:'registry',namespace:'teck-local-sources'},spec:{ports:[{name:'registry',port:5000,targetPort:5000}]}},
    {apiVersion:'discovery.k8s.io/v1',kind:'EndpointSlice',metadata:{name:'registry',namespace:'teck-local-sources',labels:{'kubernetes.io/service-name':'registry'}},addressType:'IPv4',ports:[{name:'registry',port:5000,protocol:'TCP'}],endpoints:[{addresses:[ip],conditions:{ready:true}}]},
  ];
  await run('kubectl',['--kubeconfig',kubeconfig,'apply','-f','-'],{input:JSON.stringify({apiVersion:'v1',kind:'List',items})});
  return state;
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
export async function bootstrapWorkspace({bundle,name,folder,nodes,kubeconfig,run}){
  const lock=bundle.json(paths.lock),managed=existsSync(join(folder,'gitops-managed.json'));
  if(lock?.schemaVersion!==1||!Array.isArray(lock.charts))throw Error('A verified platform component lock is required');
  const cache=directory(join(folder,'cache')),helm=await helmTool(lock,cache,run);
  const k=(...args)=>run('kubectl',['--kubeconfig',kubeconfig,...args]);
  const apply=path=>k('apply','-k',join(bundle.root,path));
  await installNodeProxyCA({nodes,run});
  const gatewayAPI=await artifact(lock.gatewayAPI,join(cache,'gateway-api.yaml'),run);
  if(!managed)await k('apply','--server-side','--field-manager=teck-local-platform','-f',gatewayAPI);
  const recordsPath=join(folder,'components.json'),records=existsSync(recordsPath)?readJson(recordsPath):{};
  for(const pin of lock.charts){
    chartDeclaration(bundle,pin);
    if(!dns(pin.name)||!dns(pin.namespace)||!pinned(pin.sha256)||!/^[a-z0-9.-]+\.tgz$/.test(pin.archive)||!/^v?\d+\.\d+\.\d+$/.test(pin.version)||!Object.hasOwn(bundle.files,pin.values))throw Error('Invalid platform chart pin');
    if(managed)continue; // After takeover, Argo CD is the sole reconciler.
    const existing=JSON.parse(await run(helm,['list','--kubeconfig',kubeconfig,'-n',pin.namespace,'--all','--filter','^'+pin.name+'$','-o','json']));
    const expectedChart=pin.archive.slice(0,-4);
    if(existing.length&&(!records[pin.name]||existing.length!==1||existing[0].chart!==expectedChart||records[pin.name].sha256!==pin.sha256))throw Error('Unowned or changed platform release: '+pin.name);
    if(existing[0]?.status==='deployed'&&records[pin.name]?.phase==='ready')continue;
    const archive=join(cache,pin.archive);
    if(!existsSync(archive)){
      const staging=directory(join(cache,randomUUID()));
      await run(helm,['pull',pin.chart,...(pin.repository?['--repo',pin.repository]:[]),'--version',pin.version,'--destination',staging]);
      if(checksum(readFileSync(join(staging,pin.archive)))!==pin.sha256)throw Error('Platform chart checksum mismatch: '+pin.name);
      renameSync(join(staging,pin.archive),archive);
    }
    if(checksum(readFileSync(archive))!==pin.sha256)throw Error('Cached platform chart checksum mismatch: '+pin.name);
    records[pin.name]={sha256:pin.sha256,phase:'installing'};writeJson(recordsPath,records);
    await run(helm,['upgrade','--install',pin.name,archive,'--kubeconfig',kubeconfig,'--namespace',pin.namespace,'--create-namespace','--values',join(bundle.root,pin.values),'--wait','--timeout','300s','--history-max','3']);
    records[pin.name]={sha256:pin.sha256,phase:'ready'};writeJson(recordsPath,records);
  }
  if(!managed){await apply(paths.namespaces);await apply(paths.certificates);}
  await k('-n','teck-local-edge','wait','certificate','local-ca','local-ingress','--for=condition=Ready','--timeout=180s');
  await trustIngressCA({k,run,name});
  if(!managed)await apply(paths.gateway);
  await k('-n','teck-local-edge','wait','gateway','edge','--for=condition=Programmed','--timeout=180s');
  if(!managed){await apply(paths.rbac);await apply(paths.sources);}
  await k('-n','teck-local-sources','rollout','status','deployment/git','--timeout=180s');
  await ensureRegistry({name,folder,nodes,lock,run,kubeconfig});
  await configureDNS(k);
  await k('-n','kube-system','rollout','status','deployment/coredns','--timeout=120s');
  // Helm's deployed status persists across VM boots; wait for the actual workloads too.
  for(const namespace of new Set(lock.charts.map(pin=>pin.namespace))){
    const rows=JSON.parse(await k('-n',namespace,'get','deployment,statefulset,daemonset','-o','json')).items;
    for(const row of rows)await k('-n',namespace,'rollout','status',row.kind.toLowerCase()+'/'+row.metadata.name,'--timeout=180s');
  }
  return {profile:'workspace',gateway:'https://*.teck.test',git:'http://127.0.0.1:19418',registry:'localhost:5001',mesh:'none'};
}

export async function takeoverPlatform({bundle,folder,kubeconfig,run}){
  const k=(...args)=>run('kubectl',['--kubeconfig',kubeconfig,...args]);
  const marker=join(folder,'gitops-managed.json'),previous=existsSync(marker)?readJson(marker):null;
  const changed=previous?.contentSha256!==bundle.contentSha256;
  let revision;
  if(changed){
    revision=(await localGit(run,join(folder,'local-gitops'),['ls-remote','origin','refs/heads/main'])).trim().split(/\s+/)[0];
    if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Cannot verify seeded GitOps revision');
  }
  await k('apply','-f',join(bundle.root,paths.root));
  const expected=Object.keys(bundle.files).filter(p=>p.startsWith('apps/local/')&&p.endsWith('/config.yaml'))
    .map(p=>bundle.yaml(p)).filter(c=>!c.worktreeScoped).map(c=>c.appName);
  if(changed){
    const current=JSON.parse(await k('-n','argocd','get','applications','-o','json')).items;
    for(const name of ['local-root',...expected].filter(name=>current.some(a=>a.metadata.name===name)))
      await k('-n','argocd','annotate','application',name,'argocd.argoproj.io/refresh=hard','--overwrite');
  }
  const deadline=Date.now()+360_000;
  for(;;){
    const apps=JSON.parse(await k('-n','argocd','get','applications','-o','json')).items;
    const ready=expected.every(name=>{const app=apps.find(a=>a.metadata.name===name);return app?.status?.sync?.status==='Synced'&&app.status?.health?.status==='Healthy'&&(!changed||app.status.sync.revision===revision);});
    if(ready)break;
    if(Date.now()>=deadline){const pending=expected.map(name=>{const a=apps.find(a=>a.metadata.name===name);return {name,sync:a?.status?.sync?.status,health:a?.status?.health?.status,conditions:a?.status?.conditions};});throw Error('Local category Applications did not become healthy: '+JSON.stringify(pending));}
    await delay(2000);
  }
  writeJson(marker,{version:1,root:'local-root',applications:expected,contentSha256:bundle.contentSha256});
}
