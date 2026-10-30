import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startProject} from '../runtime/kubernetes/startup.mjs';
import {processIdentity,writeJson} from '../runtime/kubernetes/state.mjs';

test('concurrent panes launch one guest bootstrap and return without waiting for controllers',async t=>{
 const root=mkdtempSync(join(tmpdir(),'teck-kube-start-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let calls=0;
 const options={root,projectId:'project-a',ready:async()=>false,launch:async()=>{calls++;return {pid:process.pid,identity:processIdentity(process.pid)};}};
 const results=await Promise.all([startProject(options),startProject(options)]);
 assert.equal(calls,1);assert.deepEqual(results.map(r=>r.phase),['starting','starting']);
});
test('cold restart discards a stale process identity and ready projects do not relaunch',async t=>{
 const root=mkdtempSync(join(tmpdir(),'teck-kube-start-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let calls=0;
 writeJson(join(root,'launcher.json'),{projectId:'project-a',pid:process.pid,identity:{boot:'previous-boot',start:'old'}});
 const options={root,projectId:'project-a',ready:async()=>false,launch:async()=>{calls++;return {pid:process.pid,identity:processIdentity(process.pid)};}};
 assert.equal((await startProject(options)).phase,'starting');assert.equal(calls,1);
 assert.equal((await startProject({...options,ready:async()=>true})).phase,'ready');assert.equal(calls,1);
 await assert.rejects(startProject({...options,projectId:'foreign'}),/another project/);
});
