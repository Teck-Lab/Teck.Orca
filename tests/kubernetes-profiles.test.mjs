import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clusterProfile, checkProfile} from '../runtime/kubernetes/profiles.mjs';
import {gatewayResources} from '../runtime/kubernetes/resources.mjs';

test('workspace profile requires no mesh and does not apply ambient enrollment',()=>{
  const profile=clusterProfile('workspace');
  assert.equal(profile.mesh,'none');
  assert.equal(profile.cni,'kindnet');
  const result=checkProfile('workspace',()=>{throw Error('Workspace must not require ambient routing');});
  assert.equal(result.ok,true);
  const ns=gatewayResources({profile:'workspace'}).find(r=>r.kind==='Namespace');
  assert.equal(ns.metadata.labels?.['istio.io/dataplane-mode'],undefined);
  assert.equal(profile.proves.meshSecurity,false);
});

test('full profile retains ambient enrollment and refuses unsupported routing',()=>{
  assert.equal(clusterProfile('full').cni,'cilium');
  const failure={ok:false,error:'IPv4 policy routing unavailable'};
  assert.deepEqual(checkProfile('full',()=>failure),failure);
  assert.equal(gatewayResources({profile:'full'}).find(r=>r.kind==='Namespace').metadata.labels['istio.io/dataplane-mode'],'ambient');
  assert.equal(clusterProfile('full').proves.meshSecurity,true);
});

test('invalid profiles cannot silently select an unprotected deployment',()=>{
  assert.throws(()=>clusterProfile('ful'),/profile/);
  assert.throws(()=>gatewayResources({profile:'ful'}),/profile/);
});
