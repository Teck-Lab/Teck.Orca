import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {posix} from 'node:path';
import YAML from '../runtime/kubernetes/vendor/yaml/dist/index.js';
import {loadBundle} from '../runtime/kubernetes/bundle.mjs';
import {chartDeclaration,paths} from '../runtime/kubernetes/layout.mjs';
const bundle=()=>loadBundle(fileURLToPath(new URL('../runtime/kubernetes/gitops',import.meta.url)));
const docs=(b,path)=>YAML.parseAllDocuments(b.read(path)).map(d=>d.toJSON());

test('every bundled Kustomize reference resolves without duplicate resource filenames',()=>{
 const b=bundle();
 for(const name of Object.keys(b.files).filter(n=>n.endsWith('/kustomization.yaml'))){
  const spec=YAML.parse(b.read(name)),resources=spec.resources??[];
  assert.equal(new Set(resources).size,resources.length,name+' repeats a resource');
  const refs=[...resources,...(spec.configMapGenerator??[]).flatMap(g=>(g.files??[]).map(f=>f.includes('=')?f.slice(f.indexOf('=')+1):f))];
  for(const ref of refs){if(/^https?:/.test(ref))continue;const target=posix.normalize(posix.join(posix.dirname(name),ref));assert.ok(b.files[target]||b.files[target+'/kustomization.yaml'],name+' has missing '+ref);}
 }
});

test('bare startup bundles optional category add-ons without delivery services',()=>{
 const b=bundle();assert.equal(Object.keys(b.files).some(p=>p.startsWith('local/')),false);
 for(const name of ['git','argo-cd','kargo'])assert.equal(Object.keys(b.files).some(p=>p.startsWith('apps/local/system/'+name+'/')),false);
 assert.equal(b.json(paths.profile).workflow,'kubectl');assert.deepEqual(b.json(paths.profile).defaultAddons,[]);
 assert.ok(b.files['apps/local/platform/cnpg-operator/kustomization.yaml']);assert.equal(Object.keys(b.files).some(p=>p.startsWith('projects/local/')),false);
});

test('bootstrap artifact pins cannot drift from the ordinary app chart declarations',()=>{
 const b=bundle();
 for(const pin of b.json(paths.lock).charts)assert.equal(chartDeclaration(b,pin).releaseName,pin.name);
 const pin=b.json(paths.lock).charts[0],source=pin.source+'/kustomization.yaml';
 const edited=YAML.parse(b.read(source));edited.helmCharts[0].version='v99.0.0';
 assert.throws(()=>chartDeclaration({...b,read:p=>p===source?YAML.stringify(edited):b.read(p)},pin),/differ/);
});

test('local Keycloak imports the existing realm/client definitions without another realm copy',()=>{
 const b=bundle(),k=YAML.parse(b.read('apps/local/security/keycloak/kustomization.yaml'));
 const inputs=k.configMapGenerator[0].files.join('\n');
 assert.match(inputs,/in-cluster\/security\/keycloak\/development-realm.yaml/);
 assert.match(inputs,/clients\/development\/teck-public-gateway-client.yaml/);
 assert.equal(Object.keys(b.files).some(p=>p.endsWith('/realm.json')),false);
 const realm=YAML.parse(b.read('apps/in-cluster/security/keycloak/development-realm.yaml'));
 assert.equal(realm.spec.definition.organizationsEnabled,true);
 const template=b.read('apps/local/security/keycloak/realm-template.yaml');
 assert.match(template,/spec.definition/);assert.match(template,/clientSecret/);
});
