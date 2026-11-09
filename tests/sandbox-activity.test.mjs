import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityProbe, projectActivity, readSandboxActivity } from '../runtime/sandbox-activity.mjs';
import { activateStatus } from '../runtime/plugin-status-worker.mjs';

const project = { name: 'teck-orca-ssh-123456789abc', id: 'owned-vm', state: 'running' };
const source = { workspaces: [{ id: 'repo::/workspace', title: 'feature', agents: [{
  id: 'tab:pane', title: 'OMP orchestrator', agent: 'omp', state: 'working', live: true,
  issue: 'https://github.com/Teck-Lab/Teck.Monorepo/issues/872', tool: 'bash', updatedAt: 200,
  stateStartedAt: 100, observation: 'live', prompt: 'PRIVATE BRIEF',
  subagents: [{ id: 'Researcher', title: 'Researcher', agent: 'scout', state: 'working', startedAt: 101 }],
}] }] };

test('remote Orca agents include named children and workspace; private fields never reach the panel', () => {
  const rows = projectActivity(source, project);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'OMP orchestrator');
  assert.equal(rows[1].title, 'Researcher');
  assert.equal(rows[1].kind, 'subagent');
  assert.equal(rows[1].parentId, rows[0].id);
  assert.equal(rows[1].workspace, 'feature');
  assert.equal(rows[1].state, 'working');
  assert.equal(rows[0].issueSource, 'assignment'); assert.equal(rows[1].issueSource, 'parent');
  assert.equal(rows[0].tool, 'bash'); assert.equal(rows[0].updatedAt, 200);
  const forged = structuredClone(source); forged.workspaces[0].agents[0].issue = 'javascript:alert(1)';
  assert.equal(projectActivity(forged, project)[0].issue, null);
  assert.ok(!JSON.stringify(rows).includes('PRIVATE BRIEF'));
  assert.doesNotMatch(activityProbe, /terminal.*read|\.prompt\b|\.preview\b|toolInput/);
  assert.match(activityProbe, /'worktree','ps'/);
  const stale = structuredClone(source);
  stale.workspaces[0].agents[0].observation = 'restored';
  assert.equal(projectActivity(stale, project)[1].state, 'unconfirmed');
  stale.workspaces[0].agents[0].live = false;
  assert.equal(projectActivity(stale, project)[0].state, 'unconfirmed');
});

test('activity reads exact owned running sandboxes; stopped, missing and replaced VMs never execute', async () => {
  for (const inventory of [[], [{ ...project, status: 'stopped' }], [{ ...project, id: 'other-vm', status: 'running' }]]) {
    const calls = [];
    const result = await readSandboxActivity({ projects: [project], run: async (_program, args) => { calls.push(args); return JSON.stringify(inventory); } });
    assert.equal(calls.length, 1); assert.ok(result.activityError); assert.deepEqual(result.activity, []);
  }
  const result = await readSandboxActivity({ projects: [{ ...project, state: 'stopped' }], run: () => { throw Error('Must not execute'); } });
  assert.deepEqual(result, { activity: [], activityError: null });
  const calls = [];
  const working = await readSandboxActivity({ projects: [project], run: async (_program, args) => {
    calls.push(args); return JSON.stringify(args[0] === 'ls' ? [{ ...project, status: 'running' }] : source);
  } });
  assert.equal(calls.length, 2); assert.equal(working.activity.length, 2);
  assert.equal(working.activityError, null);
  assert.deepEqual(calls[1].slice(0, 6), ['exec', '-u', 'agent', project.name, 'node', '-e']);
});

test('partial activity failure keeps other sandbox results and reports unavailable instead of an empty success', async () => {
  const result = await readSandboxActivity({ projects: [project, { ...project, id: 'missing', name: 'missing' }],
    run: async (_program, args) => JSON.stringify(args[0] === 'ls' ? [{ ...project, status: 'running' }] : { ...source, truncated: true }) });
  assert.equal(result.activity.length, 2);
  assert.match(result.activityError, /omitted/); assert.match(result.activityError, /could not be read/);
});

test('manual refresh, timer and status events query remote activity even with runtime detail checks off', async () => {
  const requests = new Map(), events = new Map(); let tick, turn = 0;
  const orca = { panels: { handle: (name, fn) => requests.set(name, fn), post() {} },
    events: { on: (name, fn) => events.set(name, fn) }, hooks: { on() {} }, commands: { register() {} },
    settings: { get: async () => ({ runtimeDetails: false }), onDidChange() {} }, log() {},
    host: { call: async name => { assert.equal(name, 'statusBar.update'); return {}; } } };
  const worker = activateStatus(orca, { collect: async options => {
    assert.equal(options.runtimeDetails, false); return { projects: [project], error: null, checkedAt: 1 };
  }, collectActivity: async ({ projects }) => {
    assert.equal(projects[0].id, project.id); return { activity: [{ id: String(++turn) }], activityError: null };
  }, interval: fn => { tick = fn; return {}; }, clear() {} });
  try {
    await Promise.resolve(); await worker.refresh();
    const first = await requests.get('sandbox.status')();
    const second = await requests.get('sandbox.status')();
    assert.notEqual(first.activity[0].id, second.activity[0].id);
    const previous = turn; tick(); await worker.refresh(); assert.ok(turn > previous);
    events.get('agent.status.changed')(); await worker.refresh(); assert.ok(turn > previous + 1);
  } finally { worker.dispose(); }
});
