import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,existsSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ensureKubernetesPrerequisites} from '../src/kubernetes-prerequisites.mjs';
import {runtimeFiles} from '../build.mjs';

const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
test('normal recipe reuse installs shared prerequisites without starting KIND or touching a checkout',async()=>{
  const calls=[];
  const root=mkdtempSync(join(tmpdir(),'teck-prerequisites-'));
  try{
    mkdirSync(join(root,'assets'),{recursive:true});
    writeFileSync(join(root,'assets/kubernetes-prerequisites.sh'),readFileSync('runtime/kits/workload/kubernetes-prerequisites.sh'));
    await ensureKubernetesPrerequisites({name:'isolated-fixture',assetRoot:root,run:async(program,args,options)=>calls.push({program,args,options})});
    assert.equal(calls.length,1);
    assert.deepEqual(calls[0].args,['exec','-i','-u','root','isolated-fixture','sh','-s']);
    assert.match(calls[0].options.input,/kubernetes-prerequisites\.sh --install/);
    assert.ok(!/kind create|\.omp\/|git clone|docker (?:rm|restart)|\/home\/agent\/project/.test(calls[0].options.input));
    if(existsSync(bash)){
      const syntax=spawnSync(bash,['-n'],{input:calls[0].options.input,encoding:'utf8'});
      assert.equal(syntax.status,0,syntax.stderr);
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('fresh kits install prerequisites and restore them at boot; native packaging includes the same helper',()=>{
  const descriptor=readFileSync('runtime/kits/workload/workload.yaml','utf8');
  assert.match(descriptor,/kubernetes-prerequisites\.sh --install/);
  assert.match(descriptor,/startup:\s+- command: \/bin\/sh \/usr\/local\/lib\/teck-devtools\/kubernetes-prerequisites\.sh/);
  const files=runtimeFiles();
  assert.ok(files['src/kubernetes-prerequisites.mjs']);
  assert.equal(files['assets/kubernetes-prerequisites.sh'].toString(),readFileSync('runtime/kits/workload/kubernetes-prerequisites.sh','utf8').replaceAll('\r\n','\n'));
});
