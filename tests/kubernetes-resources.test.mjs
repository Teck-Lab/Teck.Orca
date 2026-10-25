import assert from 'node:assert/strict';
import {test} from 'node:test';
import {worktreeIdentity,securityResources,gatewayResources} from '../runtime/kubernetes/resources.mjs';
test('worktree namespaces are stable across branch/cwd changes and isolated by project',()=>{
  const a=worktreeIdentity('project-a','worktree-1');
  assert.deepEqual(worktreeIdentity('project-a','worktree-1'),a);
  assert.notEqual(a.namespace,worktreeIdentity('project-a','worktree-2').namespace);
  assert.notEqual(a.namespace,worktreeIdentity('project-b','worktree-1').namespace);
  assert.match(a.namespace,/^teck-wt-[a-f0-9]{12}$/);
  assert.throws(()=>worktreeIdentity('','id'),/identity/);
});
test('application security requires strict mTLS and only explicitly allowed identities',()=>{
  const resources=securityResources({namespace:'teck-wt-123456789abc',gatewayPrincipal:'cluster.local/ns/teck-local-edge/sa/edge'});
  const peer=resources.find(r=>r.kind==='PeerAuthentication');assert.equal(peer.spec.mtls.mode,'STRICT');
  const policies=resources.filter(r=>r.kind==='AuthorizationPolicy');
  assert.ok(policies.some(p=>p.spec.action==='ALLOW'&&!p.spec.rules));
  const allowed=policies.find(p=>p.spec.rules);assert.deepEqual(allowed.spec.rules[0].from[0].source.principals,['cluster.local/ns/teck-local-edge/sa/edge']);
  assert.throws(()=>securityResources({namespace:'default',gatewayPrincipal:'*'}),/principal/);
});
test('local gateway exposes HTTPS through a real Gateway and a NodePort service',()=>{
  const resources=gatewayResources();const gateway=resources.find(r=>r.kind==='Gateway');
  assert.equal(gateway.spec.gatewayClassName,'teck-local');assert.equal(gateway.spec.listeners[0].protocol,'HTTPS');
  assert.equal(gateway.spec.listeners[0].tls.mode,'Terminate');
  const params=resources.find(r=>r.kind==='GatewayParameters');assert.equal(params.spec.kube.service.type,'NodePort');
  assert.equal(params.spec.kube.service.ports[0].nodePort,30443);
});
