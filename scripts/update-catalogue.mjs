// The catalogue is produced AFTER the portable plugin has a real Git commit.
// Orca, not a reimplementation of its file-hashing algorithm, creates the pin.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const emptyCatalogue = () => ({
  $schema: 'https://raw.githubusercontent.com/stablyai/orca/main/docs/schemas/plugins/orca-catalog.v2.schema.json',
  catalogVersion: 2, name: 'Teck Orca Plugins', owner: 'teck-lab', plugins: [],
});
const execute = (program,args,options={}) => execFileSync(program,args,{encoding:'utf8',windowsHide:true,...options}).trim();

export function catalogueRelease({ plugin, catalogue = emptyCatalogue(), run = execute,
  orca = process.env.ORCA_CLI_COMMAND || 'orca' } = {}) {
  if (!plugin) throw Error('Specify a committed portable plugin folder');
  plugin = resolve(plugin);
  const root = resolve(run('git',['-C',plugin,'rev-parse','--show-toplevel']));
  const sourcePath = relative(root,plugin).split(sep).join('/');
  if (!sourcePath || sourcePath.split('/').some(p=>p==='..'||p==='.') || sourcePath.includes(':'))
    throw Error('Use a portable plugin subdirectory in Teck.Orca');
  const tracked = run('git',['-C',root,'ls-files','--',sourcePath+'/portable-release.json']);
  if (!tracked) throw Error('Commit the portable package before generating its catalogue entry');
  const dirty = run('git',['-C',root,'status','--porcelain','--untracked-files=all','--',sourcePath]);
  if (dirty) throw Error('Portable plugin has uncommitted changes; catalogue pins must describe the exact committed package');
  const commit = run('git',['-C',root,'rev-parse','HEAD']);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Invalid source commit');
  const manifest = JSON.parse(fs.readFileSync(resolve(plugin,'orca-plugin.json'),'utf8'));
  const receipt = JSON.parse(fs.readFileSync(resolve(plugin,'portable-release.json'),'utf8'));
  if (manifest.publisher!=='teck-lab' || manifest.id!=='teck-sbx-recipes' || receipt.schemaVersion!==1 ||
      !/^[a-f0-9]{40}$/.test(receipt.kitSourceCommit) || !/^[a-f0-9]{64}$/.test(receipt.nativeDigest))
    throw Error('Expected the Teck portable plugin with a real kit release receipt');
  const response = JSON.parse(run(orca,['plugin','release-entry',plugin,'--json']));
  const entry = response.result?.entry;
  if (!response.ok || response.result?.pluginKey!=='teck-lab.teck-sbx-recipes' || !entry ||
      entry.commit!==commit || entry.version!==manifest.version || !/^[a-f0-9]{64}$/.test(entry.contentHash) ||
      (response.result.sourcePath!==undefined && response.result.sourcePath!==sourcePath))
    throw Error('Orca did not return a matching committed release entry');
  if (catalogue.catalogVersion!==2 || catalogue.owner!=='teck-lab' || !Array.isArray(catalogue.plugins))
    throw Error('Invalid Teck catalogue');
  const id='teck-lab.teck-sbx-recipes', old=catalogue.plugins.find(p=>p.id===id);
  const releases=old?.releases??[];
  const previous=releases.find(r=>r.version===entry.version);
  if (previous && (previous.commit!==entry.commit || previous.contentHash!==entry.contentHash))
    throw Error('This plugin version already names another release; bump its version before publication');
  const next={id,source:{kind:'git',url:'https://github.com/Teck-Lab/Teck.Orca.git',ref:'main',path:sourcePath},
    description:manifest.description,categories:['development','sandboxes'],
    releases:[entry,...releases.filter(r=>r.version!==entry.version)].slice(0,32)};
  return {...catalogue,plugins:[next,...catalogue.plugins.filter(p=>p.id!==id)]};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const args=process.argv.slice(2),options={};let output;
  while(args.length){const key=args.shift(),value=args.shift();
    if(!['--plugin','--output'].includes(key)||!value||value.startsWith('--'))throw Error('Usage: --plugin <committed-folder> --output <orca-catalog.json>');
    if(key==='--plugin')options.plugin=value;else output=value;
  }
  if(!output)throw Error('Specify the catalogue output path');
  if(fs.existsSync(output))options.catalogue=JSON.parse(fs.readFileSync(output,'utf8'));
  const result=catalogueRelease(options);
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({output,plugin:result.plugins[0].id,release:result.plugins[0].releases[0]}));
}
