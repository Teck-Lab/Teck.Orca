export function withOfficeMcp(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      config.mcpServers !== undefined && (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)))
    throw Error('Invalid OMP MCP configuration; retained without replacement');
  const servers = config.mcpServers ?? {};
  if (Object.keys(servers).some(name => /^(?:agentoffice|agent-office|agent_office)$/i.test(name))) return config;
  return { ...config, mcpServers: { ...servers, agentoffice: { type: 'stdio', command: 'node',
    args: ['/home/agent/.omp/agent/extensions/lib/office-mcp.mjs'], timeout: 5000 } } };
}

// Input travels on stdin: observer credentials never appear in command arguments or logs.
export const configureOfficeGuest = 'const withOfficeMcp=' + withOfficeMcp.toString() + ';\n' + String.raw`
const fs=require('node:fs'),path=require('node:path');let text='';
process.stdin.on('data',b=>{text+=b;if(text.length>262144)process.exit(1)});
process.stdin.on('end',()=>{
 const p=JSON.parse(text);if(p.config.version!==1||!/^http:\/\/127\.0\.0\.1:\d+\/api\/ingest$/.test(p.config.url)||!/[a-f0-9]{64}/.test(p.config.token))throw Error('Invalid office configuration');
 const regular=p=>{if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Office path is a symlink');};
 const put=(p,data,mode,uid=1000,gid=1000)=>{regular(p);regular(path.dirname(p));fs.mkdirSync(path.dirname(p),{recursive:true});if(fs.existsSync(p)&&fs.readFileSync(p,'utf8')===data)return;const t=p+'.office-'+process.pid;fs.writeFileSync(t,data,{mode,flag:'wx'});fs.chownSync(t,uid,gid);fs.renameSync(t,p)};
 put('/etc/teck-orca/office.json',JSON.stringify(p.config)+'\n',0o640,0,1000);
 if(p.forwarder)put('/usr/local/lib/teck-orca/office-forward.mjs',Buffer.from(p.forwarder,'base64').toString(),0o644,0,0);
 const allowed=new Set(['office-mcp.mjs','office-mcp-server.mjs','office-tools.mjs','office-usage.mjs','office-plan.mjs','agent-office.LICENSE']);
 for(const [name,encoded]of Object.entries(p.mcpAssets||{})){if(!allowed.has(name))throw Error('Unknown office asset');put('/home/agent/.omp/agent/extensions/lib/'+name,Buffer.from(encoded,'base64').toString(),0o600)}
 const mcpPath='/home/agent/.omp/agent/mcp.json';regular(mcpPath);
 const current=fs.existsSync(mcpPath)?JSON.parse(fs.readFileSync(mcpPath,'utf8')):{};
 const next=withOfficeMcp(current);
 if(next!==current)put(mcpPath,JSON.stringify(next,null,2)+'\n',0o600);
 put('/home/agent/.omp/agent/extensions/agent-office.mjs',Buffer.from(p.extension,'base64').toString(),0o600);
 put('/home/agent/.omp/agent/extensions/agent-office.ts',Buffer.from(p.entry,'base64').toString(),0o600);
 // The observer and role guard share a presentation-readiness contract. Stage the
 // matching guard atomically for future loads; never signal/restart OMP.
 if(p.roleGuard)put('/home/agent/.omp/agent/extensions/orca-orchestration.mjs',Buffer.from(p.roleGuard,'base64').toString(),0o600);
 if(p.officeSkill)put('/home/agent/.omp/agent/skills/agent-office/SKILL.md',Buffer.from(p.officeSkill,'base64').toString(),0o600);
 if(!fs.existsSync('/etc/teck-orca/pixtuoid-removed')){
   for(const id of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n)))try{const args=fs.readFileSync('/proc/'+id+'/cmdline','utf8').split('\0');if(args[0]==='/opt/teck-office/ttyd'||args[0]==='/opt/teck-office/pixtuoid')process.kill(Number(id),'SIGTERM')}catch{}
   for(const p of ['/home/agent/.omp/agent/extensions/pixtuoid.ts','/home/agent/.omp/agent/extensions/pixtuoid.ts.lock','/usr/local/bin/pixtuoid','/usr/local/bin/pixtuoid-hook'])if(fs.existsSync(p))fs.unlinkSync(p);
   for(const p of ['/opt/teck-office','/home/agent/.local/state/teck-office']){regular(p);if(fs.existsSync(p)){if(fs.realpathSync(p)!==p)throw Error('Unexpected legacy office location');fs.rmSync(p,{recursive:true,force:true})}}
   // Old immutable kits still invoke this path at boot. A no-op keeps their startup valid.
   if(fs.existsSync('/usr/local/lib/teck-office')){
     regular('/usr/local/lib/teck-office');
     for(const n of ['install.sh','ttyd-LICENSE'])try{fs.unlinkSync('/usr/local/lib/teck-office/'+n)}catch(e){if(e.code!=='ENOENT')throw e}
     put('/usr/local/lib/teck-office/service.mjs','// Compatibility for retained kit startup; the office is now hosted by Orca.\nconsole.log(JSON.stringify({installed:false}));\n',0o644,0,0);
   }
   put('/etc/teck-orca/pixtuoid-removed','1\n',0o644,0,0);
 }
 console.log(JSON.stringify({configured:true,bootId:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()}));
});`;
