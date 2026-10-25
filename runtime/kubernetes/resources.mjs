import {createHash} from 'node:crypto';
import {clusterProfile} from './profiles.mjs';

const dns=value=>typeof value==='string'&&/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
const meta=(name,namespace,wave='2')=>({name,...(namespace?{namespace}:{}),annotations:{'argocd.argoproj.io/sync-wave':wave}});
export function worktreeIdentity(projectId,worktreeId){
  if([projectId,worktreeId].some(v=>typeof v!=='string'||!v.trim()||v.length>4096||/[\0\r\n]/.test(v)))throw Error('A stable project and worktree identity is required');
  const hash=createHash('sha256').update(JSON.stringify([projectId,worktreeId])).digest('hex').slice(0,12);
  return {namespace:`teck-wt-${hash}`,application:`teck-wt-${hash}`,hostname:`wt-${hash}.teck.test`,hash};
}
export function securityResources({namespace,gatewayPrincipal}){
  if(!dns(namespace))throw Error('Invalid namespace');
  if(typeof gatewayPrincipal!=='string'||!/^cluster\.local\/ns\/[a-z0-9-]+\/sa\/[a-z0-9-]+$/.test(gatewayPrincipal))throw Error('An exact mesh principal is required');
  return [
    {apiVersion:'security.istio.io/v1',kind:'PeerAuthentication',metadata:meta('strict-mtls',namespace),spec:{mtls:{mode:'STRICT'}}},
    {apiVersion:'security.istio.io/v1',kind:'AuthorizationPolicy',metadata:meta('default-deny',namespace),spec:{action:'ALLOW'}},
    {apiVersion:'security.istio.io/v1',kind:'AuthorizationPolicy',metadata:meta('allow-gateway',namespace),spec:{action:'ALLOW',selector:{matchLabels:{'teck.orca.io/role':'application'}},rules:[{from:[{source:{principals:[gatewayPrincipal]}}]}]}},
  ];
}
export function gatewayResources({profile='full'}={}){
  const mesh=clusterProfile(profile).mesh;
  const namespace='teck-local-edge',name='edge';
  return [
    {apiVersion:'v1',kind:'Namespace',metadata:{...meta(namespace,undefined,'-2'),labels:mesh==='ambient'?{'istio.io/dataplane-mode':'ambient'}:{}}},
    {apiVersion:'gateway.kgateway.dev/v1alpha1',kind:'GatewayParameters',metadata:meta('teck-local',namespace,'0'),spec:{kube:{service:{type:'NodePort',ports:[{port:443,nodePort:30443}]}}}},
    {apiVersion:'gateway.networking.k8s.io/v1',kind:'GatewayClass',metadata:meta('teck-local',undefined,'0'),spec:{controllerName:'kgateway.dev/kgateway',parametersRef:{group:'gateway.kgateway.dev',kind:'GatewayParameters',name:'teck-local',namespace}}},
    {apiVersion:'gateway.networking.k8s.io/v1',kind:'Gateway',metadata:meta(name,namespace,'1'),spec:{gatewayClassName:'teck-local',listeners:[{name:'https',hostname:'*.teck.test',port:443,protocol:'HTTPS',tls:{mode:'Terminate',certificateRefs:[{kind:'Secret',name:'local-ingress-tls'}]},allowedRoutes:{namespaces:{from:'Selector',selector:{matchLabels:{'teck.orca.io/local-worktree':'true'}}}}}]}}
  ];
}
