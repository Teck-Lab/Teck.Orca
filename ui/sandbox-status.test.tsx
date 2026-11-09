import { assert, mockHost, mount, test } from 'orca/testing';
import * as panel from './sandbox-status';
import { connected } from './sandbox-status.check.ts';

test('office button targets its sandbox and clears an earlier error on retry',async()=>{
  let attempts=0;const received:unknown[]=[];
  const host=mockHost({requests:{'sandbox.status':()=>connected,'sandbox.office':input=>{
    received.push(input);if(++attempts===1)throw Error('Office unavailable');return{opened:true};
  }}});
  const view=await mount(panel,{host});
  try{
    await view.press({text:'Open pixel office'});
    assert.ok(JSON.stringify(view.tree()).includes('Pixel office is unavailable'));
    await view.press({text:'Open pixel office'});
    assert.equal(JSON.stringify(view.tree()).includes('Pixel office is unavailable'),false);
    assert.deepEqual(received,[{projectId:'fixture',sandboxId:'fixture-id'},{projectId:'fixture',sandboxId:'fixture-id'}]);
    assert.deepEqual(view.errors,[]);
  }finally{await view.unmount()}
});

test('shows verified runtime health, receives updates and saves GUI settings', async () => {
  let requests = 0;
  const host = mockHost({ capabilities: ['settings:own'],
    settings: connected.settings,
    requests: { 'sandbox.status': () => { requests++; return { ...connected, settings: { ...connected.settings, ...host.data().settings } }; } } });
  const view = await mount(panel, { host });
  try {
    assert.ok(view.find({ text: 'Connected' }));
    assert.ok(JSON.stringify(view.tree()).includes('Orca / OMP'));
    assert.ok(JSON.stringify(view.tree()).includes('1/1 nodes Ready'));
    const before = requests;
    await view.press({ text: 'Refresh' });
    assert.ok(requests > before);
    await view.toggle({ type: 'Collapsible', text: 'Panel settings' });
    await view.toggle({ label: 'Show connection in status bar' });
    assert.equal(host.data().settings.showStatusBar, false);
    await view.select({ label: 'Refresh interval' }, '60');
    assert.equal(host.data().settings.refreshSeconds, 60);
    await view.post('sandbox.changed', { ...connected, activity: [], projects: [{ ...connected.projects[0], state: 'stopped', runtime: null }] });
    assert.ok(view.find({ text: 'stopped' }));
    assert.equal(view.find({ text: 'Connected' }), null);
    assert.deepEqual(view.errors, []);
    assert.deepEqual(view.warnings, []);
    assert.deepEqual(view.refusals, []);
  } finally { await view.unmount(); }
});

test('distinguishes a delivery request from execution and handles unavailable backends', async () => {
  const host = mockHost({ requests: { 'sandbox.status': () => ({ ...connected,
    launch: { kind: 'dispatch-input-requested', at: connected.checkedAt, terminalId: 'term_worker' },
    activity: [{ ...connected.activity[0], state: 'done' }], projects: [] }) } });
  const view = await mount(panel, { host });
  try {
    assert.ok(JSON.stringify(view.tree()).includes('No project sandbox yet'));
    await view.select({ label: 'Sandbox view' }, 'agents');
    assert.ok(JSON.stringify(view.tree()).includes('Turn ended'));
    assert.ok(JSON.stringify(view.tree()).includes('Delivery does not confirm execution'));
    await view.post('sandbox.changed', { ...connected, error: 'Inventory unavailable', projects: [] });
    assert.ok(view.find({ text: 'Inventory unavailable' }));
    assert.deepEqual(view.errors, []);
  } finally { await view.unmount(); }
});

test('shows sandbox workspace and child agents, and reports unavailable activity explicitly', async () => {
  const host = mockHost({ requests: { 'sandbox.status': () => ({ ...connected, activity: [connected.activity[0],
    { ...connected.activity[0], id: 'child', parentId: 'fixture-worker', kind: 'subagent', title: 'Researcher' }] }) } });
  const view = await mount(panel, { host });
  try {
    await view.select({ label: 'Sandbox view' }, 'agents');
    assert.ok(JSON.stringify(view.tree()).includes('Researcher'));
    assert.ok(JSON.stringify(view.tree()).includes('feature-872'));
    await view.post('sandbox.changed', { ...connected, activity: [], activityError: 'Agent activity unavailable' });
    assert.ok(view.find({ text: 'Agent activity unavailable' }));
    assert.ok(JSON.stringify(view.tree()).includes('Activity unavailable'));
    assert.deepEqual(view.errors, []); assert.deepEqual(view.warnings, []);
  } finally { await view.unmount(); }
});

test('storage is clearly labelled; issue links, children and last tools are visible in agent cards', async () => {
  const host = mockHost({ requests: { 'sandbox.status': () => connected } });
  const view = await mount(panel, { host });
  try {
    assert.ok(JSON.stringify(view.tree()).includes('18.0 GiB'));
    assert.ok(JSON.stringify(view.tree()).includes('40.0 GiB'));
    assert.ok(JSON.stringify(view.tree()).includes('free'));
    assert.ok(JSON.stringify(view.tree()).includes('Docker / KIND'));
    assert.ok(JSON.stringify(view.tree()).includes('"value":44'));
    await view.select({ label: 'Sandbox view' }, 'agents');
    assert.ok(view.find({ text: '#872' }));
    assert.ok(JSON.stringify(view.tree()).includes('bash'));
    assert.ok(JSON.stringify(view.tree()).includes('Last report'));
    assert.deepEqual(view.errors, []); assert.deepEqual(view.warnings, []);
  } finally { await view.unmount(); }
});

test('running and failed maintenance stays visible without hiding agent or storage data', async () => {
  const host = mockHost({ requests: { 'sandbox.status': () => connected } });
  const view = await mount(panel, { host });
  try {
    await view.select({ label: 'Sandbox view' }, 'updates');
    await view.post('sandbox.changed', { ...connected, updates: { 'fixture-id': { state: 'running', message: 'Updating OMP and managed guides', at: connected.checkedAt } } });
    assert.ok(view.find({ text: 'Updating OMP and managed guides' }));
    assert.ok(JSON.stringify(view.find({ text: 'Update Teck.Monorepo' })).includes('"disabled":true'));
    await view.post('sandbox.changed', { ...connected, updates: { 'fixture-id': { state: 'failed', message: 'Update failed. Previous files restored.', at: connected.checkedAt } } });
    assert.ok(view.find({ text: 'Update failed. Previous files restored.' }));
    await view.select({ label: 'Sandbox view' }, 'overview');
    assert.ok(view.find({ text: 'Connected' }));
    assert.deepEqual(view.errors, []); assert.deepEqual(view.warnings, []);
  } finally { await view.unmount(); }
});

test('updates use the selected sandbox identity and remain disabled while OMP is open', async () => {
  const received: unknown[] = [];
  const host = mockHost({ requests: { 'sandbox.status': () => connected, 'sandbox.update': input => { received.push(input); return { accepted: true }; } } });
  const view = await mount(panel, { host });
  try {
    await view.select({ label: 'Sandbox view' }, 'updates');
    await view.press({ text: 'Update Teck.Monorepo' });
    assert.deepEqual(received, [{ projectId: 'fixture', sandboxId: 'fixture-id' }]);
    await view.post('sandbox.changed', { ...connected, projects: [{ ...connected.projects[0], runtime: { ...connected.projects[0].runtime, ompProcesses: 2 } }] });
    assert.ok(JSON.stringify(view.tree()).includes('Close OMP sessions'));
    const button = view.find({ text: 'Update Teck.Monorepo' });
    assert.ok(JSON.stringify(button).includes('"disabled":true'));
    assert.deepEqual(view.errors, []); assert.deepEqual(view.warnings, []);
  } finally { await view.unmount(); }
});
