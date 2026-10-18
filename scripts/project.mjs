// Informational only. Orca owns first-use provisioning through its recipe.
import { parseArgs } from 'node:util';
import { command } from './lifecycle.mjs';
import { orcaExecutable } from '../runtime/project-supervisor.mjs';
try {
  const { values } = parseArgs({ options: { list: { type: 'boolean' }, project: { type: 'string' } } });
  if (values.list) {
    const response = JSON.parse(command(orcaExecutable(), ['project', 'list', '--json']));
    if (!response.ok) throw Error(response.error?.message || 'Cannot list projects');
    console.log(response.result.projects.map(item => `${item.id}\t${item.displayName}`).join('\n'));
  }
  console.log('Create a workspace in Orca and select Teck OMP Project in Run on. Orca creates the project sandbox if it does not exist, then reuses it.');
  console.log('No sandbox or connection was created by this command.');
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
