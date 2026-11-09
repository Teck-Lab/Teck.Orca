// Explicit toolkit check, never a session-start hook. Run with the installed Bun.
// Launches only private fixtures through OMP's own DAP implementation; no user PID is attached.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!globalThis.Bun) throw Error('Run the DAP smoke check with Bun, which hosts OMP');
assert.notEqual(process.getuid(), 0, 'Run debugging verification as the non-root agent user');
let globalRoot;
try { globalRoot=join(execFileSync('npm',['root','--global'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),'@oh-my-pi/pi-coding-agent'); } catch {}
const roots = [process.env.TECK_OMP_PACKAGE_ROOT, '/opt/paseo-omp/lib/node_modules/@oh-my-pi/pi-coding-agent', globalRoot, '/usr/local/lib/node_modules/@oh-my-pi/pi-coding-agent'].filter(Boolean);
const packageRoot = roots.find(root => existsSync(join(root, 'src/dap/session.ts')));
if (!packageRoot) throw Error('Installed OMP DAP sources are unavailable');
const { DapSessionManager } = await import(pathToFileURL(join(packageRoot, 'src/dap/session.ts')).href);
const { resolveAdapter } = await import(pathToFileURL(join(packageRoot, 'src/dap/config.ts')).href);
const manager = new DapSessionManager();
const root = mkdtempSync(join(tmpdir(), 'teck-debug-validation-'));
const env = { ...process.env, DOTNET_CLI_HOME: join(root, 'dotnet-home'), DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' };
const run = (command,args) => execFileSync(command,args,{cwd:root,env,encoding:'utf8',timeout:90_000,stdio:['ignore','pipe','pipe']});
const report = { passed: false, uid: process.getuid(), adapters: [] };
let failure;
try {
  const cs = join(root,'csharp');mkdirSync(cs);
  writeFileSync(join(cs,'Probe.csproj'),'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><DebugType>portable</DebugType><Optimize>false</Optimize></PropertyGroup></Project>');
  writeFileSync(join(cs,'Program.cs'),'var answer = 21;\nanswer *= 2;\nConsole.WriteLine(answer);\n');
  const nuget = join(root,'NuGet.Config');writeFileSync(nuget,'<configuration><packageSources><clear /></packageSources></configuration>');
  run('dotnet',['build',join(cs,'Probe.csproj'),'--configfile',nuget,'--configuration','Debug','--verbosity','quiet']);
  const js = join(root,'probe.js');writeFileSync(js,'let answer = 21;\nanswer *= 2;\nconsole.log(answer);\n');
  const cases = [
    {name:'netcoredbg',program:join(cs,'bin/Debug/net10.0/Probe.dll'),source:join(cs,'Program.cs')},
    {name:'js-debug-adapter',program:js,source:js},
  ];
  for (const item of cases) {
    const adapter = resolveAdapter(item.name,root);assert.ok(adapter,`${item.name} is not discoverable by OMP`);
    const launched = await manager.launch({adapter,cwd:root,program:item.program},undefined,25_000);
    assert.equal(launched.status,'stopped',`${item.name} did not stop at entry`);
    const breakpoint = await manager.setBreakpoint(item.source,3,undefined,undefined,10_000);
    assert.ok(breakpoint.breakpoints.some(b=>b.verified),`${item.name} did not verify the source breakpoint`);
    await manager.continue(undefined,15_000);
    assert.equal(manager.getActiveSession()?.status,'stopped',`${item.name} did not stop at the breakpoint`);
    const stack = await manager.stackTrace(8,undefined,10_000);
    assert.ok(stack.stackFrames.length,`${item.name} returned no stack frames`);
    const frame = stack.stackFrames.find(f=>f.source?.path&&resolve(f.source.path)===resolve(item.source));
    assert.ok(frame,`${item.name} stack did not contain its fixture source`);
    assert.equal(frame.line,3);
    const scopes = await manager.scopes(frame.id,undefined,10_000);
    let answer;
    for (const scope of scopes.scopes.filter(s=>!s.expensive&&s.variablesReference>0)) {
      const variables = await manager.variables(scope.variablesReference,undefined,10_000);
      answer ??= variables.variables.find(v=>v.name==='answer')?.value;
    }
    assert.equal(answer,'42',`${item.name} could not inspect the local answer`);
    const evaluated = await manager.evaluate('answer','watch',frame.id,undefined,10_000);
    assert.equal(evaluated.evaluation.result,'42',`${item.name} evaluation mismatch`);
    await manager.terminate(undefined,10_000);
    report.adapters.push({name:item.name,stoppedAtEntry:true,breakpointVerified:true,stackFrames:stack.stackFrames.length,localAnswer:answer,evaluatedAnswer:evaluated.evaluation.result});
  }
  report.passed=true;
} catch(error) { failure=error; }
finally {
  try { await manager.terminate(undefined,10_000); } catch(error) { failure??=error; }
  // Only the freshly-created private fixture root is removed.
  if (!root.startsWith(join(tmpdir(),'teck-debug-validation-'))) throw Error('Invalid debug fixture root');
  rmSync(root,{recursive:true,force:true});
}
if(failure){console.error(failure);process.exit(1)}
console.log(JSON.stringify(report));process.exit(0);
