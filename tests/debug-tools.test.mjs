import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { debugTools, installDebugTools } from '../runtime/kits/workload/debug-tools.mjs';

const lock=JSON.parse(readFileSync(new URL('../runtime/kits/workload/devtools.json',import.meta.url)));
test('debugger assets are pinned for both supported Linux architectures',()=>{
  for(const arch of ['x64','arm64']){
    const tools=debugTools(lock,arch);
    assert.equal(tools.length,2);
    assert.ok(tools[0].url.endsWith(`netcoredbg-linux-${arch==='x64'?'amd64':'arm64'}.tar.gz`));
    assert.ok(tools[1].url.endsWith(`js-debug-dap-v${lock.debug.jsDebug.version}.tar.gz`));
    for(const tool of tools)assert.match(tool.sha256,/^[a-f0-9]{64}$/);
  }
  assert.throws(()=>debugTools(lock,'ia32'),/Unsupported debugger architecture/);
  assert.throws(()=>debugTools({...lock,debug:{...lock.debug,netcoredbg:{...lock.debug.netcoredbg,sha256:{x64:'bad'}}}}),/Invalid netcoredbg pin/);
});
test('both checksums must pass before any debugger executable is extracted or installed',t=>{
  const root=mkdtempSync(join(tmpdir(),'teck-debug-install-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const good=Buffer.from('checked archive'),hash=createHash('sha256').update(good).digest('hex');
  const fixture={debug:{netcoredbg:{version:'3.2.0-1092',sha256:{x64:hash}},jsDebug:{version:'1.140.0',sha256:hash}}};
  let extracted=0;
  assert.throws(()=>installDebugTools({lock:fixture,arch:'x64',destination:join(root,'tools'),binDirectory:join(root,'bin'),agentHome:join(root,'home'),
    download:(tool,file)=>writeFileSync(file,tool.name==='js-debug'?'corrupt archive':good),extract:()=>extracted++}),/js-debug checksum mismatch/);
  assert.equal(extracted,0);assert.equal(existsSync(join(root,'bin/netcoredbg')),false);assert.equal(existsSync(join(root,'home/.local/opt/js-debug')),false);
});
