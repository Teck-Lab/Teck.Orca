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
  console.log('For the first workspace select Teck OMP Project in Run on. For later workspaces select the saved project connection, not the recipe.');
  console.log('No sandbox or connection was created by this command.');
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
