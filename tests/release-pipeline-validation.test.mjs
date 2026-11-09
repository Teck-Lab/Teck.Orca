import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSource } from '../scripts/validate-source.mjs';

function fixture(t) {
  const source=mkdtempSync(join(tmpdir(),'teck-validation-test-'));
  t.after(()=>rmSync(source,{recursive:true,force:true}));
  for(const folder of ['plugin','.git','.artifacts','runtime','runtime/node_modules','.github'])mkdirSync(join(source,folder),{recursive:true});
  for(const path of ['plugin/live','runtime/file.mjs','.github/workflow.yml','.git/private','.artifacts/output','runtime/node_modules/ignored'])writeFileSync(join(source,path),'source');
  writeFileSync(join(source,'package.json'),'{}');writeFileSync(join(source,'.gitattributes'),'* text=auto');
  writeFileSync(join(source,'.env'),'not copied');
  return source;
}

test('validation regenerates only in an owned copy, excludes host/generated state and cleans it afterward',t=>{
  const source=fixture(t),calls=[];let staged;
  const result=validateSource({source,npmCli:process.execPath,log:()=>{},run:(_exe,args,options)=>{
    staged=options.cwd;calls.push(args.at(-1));assert.notEqual(staged,source);
    for(const path of ['.git','.artifacts','.env','runtime/node_modules'])assert.equal(existsSync(join(staged,path)),false,path);
    assert.equal(readFileSync(join(staged,'.gitattributes'),'utf8'),'* text=auto');
    if(args.at(-1)==='build'){assert.equal(existsSync(join(staged,'plugin')),false);mkdirSync(join(staged,'plugin'));writeFileSync(join(staged,'plugin/live'),'generated');}
    else assert.equal(readFileSync(join(staged,'plugin/live'),'utf8'),'generated');
    return {status:0};
  }});
  assert.equal(result.passed,true);assert.deepEqual(calls,['build','check','test']);assert.equal(existsSync(staged),false);
  assert.equal(readFileSync(join(source,'plugin/live'),'utf8'),'source');
});

test('validation stops at a failed command and keeps only its own requested diagnostic copy',t=>{
  const source=fixture(t);let staged,count=0;
  assert.throws(()=>validateSource({source,keep:true,npmCli:process.execPath,log:()=>{},run:(_exe,_args,options)=>{staged=options.cwd;count++;return {status:1};}}),/build failed/);
  t.after(()=>rmSync(staged,{recursive:true,force:true}));assert.equal(count,1);assert.equal(existsSync(staged),true);
  let cleaned;
  assert.throws(()=>validateSource({source,npmCli:process.execPath,log:()=>{},run:(_exe,_args,options)=>{cleaned=options.cwd;return {status:1};}}),/build failed/);
  assert.equal(existsSync(cleaned),false);
});
