// Executed only inside the disposable PR smoke build, without network or secrets.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { accessSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

assert.equal(process.getuid(),1000,'Smoke tests must run as the agent');
assert.equal(process.arch,process.env.TECK_EXPECT_ARCH,'The architecture must run natively');
const root='/tmp/teck-kit-validation';mkdirSync(root,{recursive:true});
const lock=JSON.parse(readFileSync(new URL('./devtools.json',import.meta.url)));
const run=(command,args)=>execFileSync(command,args,{cwd:root,encoding:'utf8',timeout:90000,env:{...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'},stdio:['ignore','pipe','pipe']}).trim();
const versions={node:process.version,bun:run('bun',['--version']),omp:run('omp',['--version']),dotnet:run('dotnet',['--version']),typescript:run('tsc',['--version']),kind:run('kind',['version'])};
assert.equal(versions.dotnet,lock.dotnet.version);assert.equal(versions.typescript,`Version ${lock.npm.typescript}`);
assert.match(versions.omp,/^omp\/[0-9]+\.[0-9]+\.[0-9]+$/);
assert.ok(versions.kind.startsWith(`kind v${lock.native.kind.version} `));
assert.equal(JSON.parse(run('kubectl',['version','--client','--output=json'])).clientVersion.gitVersion,`v${lock.native.kubectl.version}`);
writeFileSync(join(root,'probe.ts'),'const value: number = 42; console.log(value);\n');
run('tsc',['--strict','--noEmit','probe.ts']);
writeFileSync(join(root,'Probe.csproj'),`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net${lock.dotnet.version.split('.')[0]}.0</TargetFramework></PropertyGroup></Project>`);
writeFileSync(join(root,'Program.cs'),'System.Console.WriteLine(42);\n');
writeFileSync(join(root,'NuGet.Config'),'<configuration><packageSources><clear /></packageSources></configuration>');
run('dotnet',['build','Probe.csproj','--configfile','NuGet.Config','--verbosity','quiet']);
assert.equal(run('dotnet',['run','--project','Probe.csproj','--no-build']),'42');
assert.match(run('typescript-language-server',['--version']),/^\d+\./);
for(const name of ['netcoredbg','agent-browser','chromium','git','gh','docker'])run('sh',['-c',`test -x "$(command -v ${name})"`]);
accessSync('/home/agent/.local/opt/js-debug/src/dapDebugServer.js');
writeFileSync(join(root,'report.json'),JSON.stringify({schemaVersion:1,uid:process.getuid(),architecture:process.arch,versions,checks:['C# compile/run without NuGet sources','TypeScript compile','TypeScript LSP starts','OMP/Bun run','Kubernetes client versions','debug and browser executables']},null,2)+'\n');
console.log('PASS: native non-root tool smoke');
