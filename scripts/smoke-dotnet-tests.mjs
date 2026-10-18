// Explicit validation in an already-running sandbox. Touches only a fresh /tmp
// directory and containers bearing this invocation's unique label.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { command } from './lifecycle.mjs';
import { repositoryRoot } from './release.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--sandbox' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(args[1])) {
  throw new Error('Usage: npm run smoke:dotnet-tests -- --sandbox <running-sandbox>');
}
const name = args[1];
const sandbox = JSON.parse(command('sbx', ['ls', '--json'])).find(row => row.name === name);
if (sandbox?.status !== 'running') throw new Error('Select an existing running sandbox; this smoke does not create or wake features');
const runId = randomUUID();
const artifacts = join(repositoryRoot, '.artifacts', 'smoke', `dotnet-tests-${runId}`);
mkdirSync(artifacts, { recursive: true });
const root = command('sbx', ['exec', '-u', 'agent', name, 'mktemp', '-d', '/tmp/teck-dotnet-smoke-XXXXXXXXXX']).trim();
if (!/^\/tmp\/teck-dotnet-smoke-[A-Za-z0-9]+$/.test(root)) throw new Error('Unexpected smoke directory; cleanup refused');
try {
  command('sbx', ['cp', join(repositoryRoot, 'sandbox', 'testing-smoke'), `${name}:${root}/`]);
  // sbx cp creates root-owned files even when the parent was made by agent.
  command('sbx', ['exec', '-u', 'root', name, 'chown', '-R', 'agent:agent', root]);
  command('sbx', ['exec', '-u', 'agent', '-e', `TECK_SMOKE_RUN_ID=${runId}`, name, 'node', `${root}/testing-smoke/run.mjs`],
    { timeout: 660_000, progress: true });
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  try { command('sbx', ['cp', `${name}:${root}/testing-smoke/.`, artifacts]); }
  catch (error) { console.error(`Could not collect smoke artifacts: ${error.message}`); process.exitCode = 1; }
  // The validated absolute target is a unique temporary directory, not a checkout.
  command('sbx', ['exec', '-u', 'root', name, 'rm', '-rf', '--', root]);
  console.log(`Smoke artifacts: ${artifacts}`);
}
