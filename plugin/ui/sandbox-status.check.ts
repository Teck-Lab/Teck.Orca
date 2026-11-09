import { defineCheck } from 'orca/testing';

export const connected = {
  checkedAt: 1793815200000, target: { orca: '1.4.248', omp: '18.16.0' }, error: null,
  settings: { refreshSeconds: 30, runtimeDetails: true, showStatusBar: true }, launch: null,
  activity: [{ id: 'fixture-worker', kind: 'agent', workspace: 'feature-872', sandbox: 'teck-orca-ssh-123456789abc', terminalId: 'term_worker', title: 'Executor #872', agent: 'omp', state: 'working', stateStartedAt: 1793815100000,
    updatedAt: 1793815190000, tool: 'bash', issue: 'https://github.com/Teck-Lab/Teck.Monorepo/issues/872', issueSource: 'assignment' }],
  projects: [{ projectId: 'fixture', name: 'teck-orca-ssh-123456789abc', id: 'fixture-id', title: 'Teck.Monorepo', state: 'running',
    cpus: 8, memory: '16g', error: null, runtime: { connection: 'ready', daemon: '1.4.248', omp: '18.16.0',
      disk: { total: 32 * 1024 ** 3, available: 18 * 1024 ** 3 },
      dockerDisk: { total: 60 * 1024 ** 3, available: 40 * 1024 ** 3 }, ompProcesses: 0, managedDigest: null,
      kubernetes: { name: 'teck-local-123456789abc', phase: 'ready', readiness: 'ready', nodes: 1, ready: 1 } } }],
};
export default defineCheck({
  connected: { capabilities: ['settings:own', 'workspace:read', 'agent:read'], requests: { 'sandbox.status': () => connected } },
  fresh: { capabilities: ['settings:own', 'workspace:read', 'agent:read'], requests: { 'sandbox.status': () => ({ ...connected, projects: [], activity: [] }) } },
  unavailable: { capabilities: ['settings:own', 'workspace:read', 'agent:read'], requests: { 'sandbox.status': () => ({ ...connected, projects: [], error: 'Docker Sandboxes inventory is unavailable.' }) } },
  stopped: { capabilities: ['settings:own', 'workspace:read', 'agent:read'], requests: { 'sandbox.status': () => ({ ...connected, activity: [],
    projects: [{ ...connected.projects[0], state: 'stopped', runtime: null }] }) } },
  agents: { capabilities: ['settings:own', 'workspace:read', 'agent:read'], persisted: { plugin: { 'sandbox-view': 'agents' } }, requests: { 'sandbox.status': () => ({ ...connected,
    activity: [...connected.activity, { ...connected.activity[0], id: 'helper', parentId: 'fixture-worker', kind: 'subagent', title: 'Research API compatibility', issueSource: 'parent', tool: null }] }) } },
  updates: { capabilities: ['settings:own', 'workspace:read', 'agent:read'], persisted: { plugin: { 'sandbox-view': 'updates' } }, requests: { 'sandbox.status': () => connected } },
  updating: { capabilities: ['settings:own', 'workspace:read', 'agent:read'], persisted: { plugin: { 'sandbox-view': 'updates' } }, requests: { 'sandbox.status': () => ({ ...connected,
    updates: { 'fixture-id': { state: 'running', message: 'Updating OMP and managed guides', at: connected.checkedAt } } }) } },
  lowStorage: { capabilities: ['settings:own', 'workspace:read', 'agent:read'], requests: { 'sandbox.status': () => ({ ...connected, projects: [{ ...connected.projects[0],
    runtime: { ...connected.projects[0].runtime, dockerDisk: { total: 60 * 1024 ** 3, available: 2 * 1024 ** 3 } } }] }) } },
});
