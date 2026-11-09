// Bundle only our fork's watch-only distribution; no dependency on its checkout at runtime.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(process.env.TECK_AGENT_OFFICE_SOURCE||join(repo,'..','agent-office'));
const remote=execFileSync('git',['remote','get-url','origin'],{cwd:source,encoding:'utf8',windowsHide:true}).trim();
if(!/^https:\/\/github\.com\/Teck-Lab\/agent-office(?:\.git)?$/i.test(remote))throw Error('Only the Teck-Lab Agent Office fork may be bundled');
const destination=join(repo,'runtime','agent-office');
if(resolve(destination)!==resolve(repo,'runtime','agent-office')||fs.existsSync(destination)&&fs.lstatSync(destination).isSymbolicLink())throw Error('Invalid bundle destination');
if(fs.existsSync(destination))fs.rmSync(destination,{recursive:true});fs.mkdirSync(destination,{recursive:true});
// Optional precompressed browser copies are binary. Keep the canonical UTF-8
// assets so the managed bundle can be published through the GitHub App's text
// file API; the office server serves these directly when no .br/.gz exists.
for(const file of ['cli.js','term-worker.mjs','web'])fs.cpSync(join(source,'dist',file),join(destination,file),{
 recursive:true,filter:path=>! /\.(?:br|gz)$/.test(path)});
// The source fork's build already requires esbuild. Minify its node bundles
// without renaming functions/classes so individual App-backed uploads stay
// below the gateway's body limit; runtime imports remain unchanged.
const {transformSync,buildSync}=createRequire(join(source,'package.json'))('esbuild');
for(const file of ['cli.js','term-worker.mjs'])fs.writeFileSync(join(destination,file),transformSync(fs.readFileSync(join(destination,file),'utf8'),{
 minify:true,keepNames:true,format:'esm',target:'node18',legalComments:'inline'}).code);
const mcpRoot=join(repo,'runtime/omp/extensions/lib');fs.mkdirSync(mcpRoot,{recursive:true});
buildSync({stdin:{contents:`export {createMcpServer} from './src/mcp/server.ts'; export const OFFICE_VERSION=${JSON.stringify(JSON.parse(fs.readFileSync(join(source,'package.json'),'utf8')).version)};`,resolveDir:source,loader:'ts'},
 outfile:join(mcpRoot,'office-mcp-server.mjs'),bundle:true,platform:'node',format:'esm',target:'node18',minify:true,keepNames:true,legalComments:'inline',
 banner:{js:'// Bundled Agent Office MCP implementation (MIT); see agent-office.LICENSE.'},logLevel:'warning'});
fs.copyFileSync(join(source,'LICENSE'),join(mcpRoot,'agent-office.LICENSE'));
fs.copyFileSync(join(source,'LICENSE'),join(destination,'LICENSE'));
fs.copyFileSync(join(source,'package.json'),join(destination,'package.json'));
const files={};function walk(root,prefix=''){for(const name of fs.readdirSync(root).sort()){const p=join(root,name),relative=prefix+name;if(fs.lstatSync(p).isSymbolicLink())throw Error('Bundle symlink refused');
 if(fs.statSync(p).isDirectory())walk(p,relative+'/');else files[relative]=createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}
walk(destination);
fs.writeFileSync(join(destination,'bundle.json'),JSON.stringify({source:'https://github.com/Teck-Lab/agent-office',version:JSON.parse(fs.readFileSync(join(source,'package.json'))).version,
 commit:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8',windowsHide:true}).trim(),files},null,2)+'\n');
console.log(`Bundled Teck-Lab Agent Office (${Object.keys(files).length} files).`);
