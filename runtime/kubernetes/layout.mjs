import YAML from './vendor/yaml/dist/index.js';
import {posix} from 'node:path';

export const paths=Object.freeze({lock:'bootstrap/local/components.lock.json',profile:'bootstrap/local/workspace/profile.json',kind:'bootstrap/local/workspace/kind.yaml',
  namespaces:'cluster-resources/local/namespaces',rbac:'cluster-resources/local/argo-rollouts',certificates:'apps/local/security/certificates',
  gateway:'apps/local/network/kgateway/gateway',sources:'apps/local/system/git',root:'bootstrap/local/root.yaml',projects:'projects/local',
  promotion:'apps/local/system/kargo/teck-cloud/promotion-task.yaml'});
export const parseYaml=text=>YAML.parse(text,{maxAliasCount:0});
export function chartDeclaration(bundle,pin){
  const spec=parseYaml(bundle.read(pin.source+'/kustomization.yaml')),chart=spec.helmCharts?.find(c=>c.releaseName===pin.name);
  if(!chart||chart.version!==pin.version||chart.namespace!==pin.namespace||
    chart.name!==pin.chart.split('/').at(-1)||posix.join(pin.source,chart.valuesFile??'values.yaml')!==pin.values||
    chart.repo!==(pin.repository??pin.chart.slice(0,pin.chart.lastIndexOf('/'))))throw Error('Chart declaration and artifact lock differ: '+pin.name);
  return chart;
}
