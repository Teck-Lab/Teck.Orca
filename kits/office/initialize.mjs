import { readFileSync, writeFileSync } from 'node:fs';
const path = '/home/agent/.omp/agent/mcp.json';
const config = JSON.parse(readFileSync(path, 'utf8'));
config.mcpServers ??= {};
config.mcpServers.agentoffice ??= { type: 'stdio', command: 'node', args: ['/home/agent/.omp/agent/extensions/lib/office-mcp.mjs'], timeout: 5000 };
writeFileSync(path, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
