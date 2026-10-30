import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLab, verifyLab, removeLab } from '../scripts/kubernetes-lab.mjs';

test('lab refuses to adopt a pre-existing VM and never modifies project sandboxes', () => {
  const calls=[];
  const run=(p,a)=>{calls.push(a);return JSON.stringify([{name:'teck-k8s-test-123456789abc',id:'foreign'}]);};
  assert.throws(()=>createLab({name:'teck-k8s-test-123456789abc',run}),/exists/);
  assert.ok(calls.every(a=>a[0]==='ls'));
  assert.throws(()=>createLab({name:'teck-orca-ssh-bc02e0548944',run}),/test sandbox/);
});
test('lab creation records a new exact provider identity and uses isolated disks', () => {
  const rows=[{name:'teck-orca-ssh-bc02e0548944',id:'project'}],calls=[];
  const run=(p,a,o)=>{calls.push({a,o});if(a[0]==='ls')return JSON.stringify(rows);if(a[0]==='create')rows.push({name:'teck-k8s-test-123456789abc',id:'test',status:'running'});return '';};
  const lab=createLab({name:'teck-k8s-test-123456789abc',run});
  assert.equal(lab.id,'test');assert.deepEqual(lab.protected,[{name:'teck-orca-ssh-bc02e0548944',id:'project'}]);
  const create=calls.find(c=>c.a[0]==='create');assert.equal(create.o.env.DOCKER_SANDBOXES_DOCKER_SIZE,'40g');
  assert.ok(!create.a.includes('--clone'));assert.ok(!calls.some(c=>c.a.includes('teck-orca-ssh-bc02e0548944')));
});
test('replaced, renamed or invalid inventories never authorize mutation', () => {
  const lab={name:'teck-k8s-test-123456789abc',id:'test',protected:[]};
  for(const inventory of ['{}','oops',JSON.stringify([{name:lab.name,id:'other'}]),JSON.stringify([{name:'renamed',id:lab.id}])]){
    const calls=[];const run=(p,a)=>{calls.push(a);return inventory;};
    assert.throws(()=>removeLab(lab,{run}));assert.ok(calls.every(a=>a[0]==='ls'));
  }
  assert.throws(()=>verifyLab({...lab,name:'teck-orca-p-bc02e0548944'},{run:()=> '[]'}),/test sandbox/);
});
test('cleanup removes only the recorded test identity', () => {
  const lab={name:'teck-k8s-test-123456789abc',id:'test',protected:[]},calls=[];
  const run=(p,a)=>{calls.push(a);return a[0]==='ls'?JSON.stringify([{name:lab.name,id:lab.id}]):'';};
  removeLab(lab,{run});assert.deepEqual(calls.at(-1),['rm','--force',lab.name]);
});
