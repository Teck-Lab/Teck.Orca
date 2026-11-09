import { connectionIndicator, readSandboxStatus, statusCommand, statusSettings } from './sandbox-status.mjs';
import { readSandboxActivity } from './sandbox-activity.mjs';
import { managedTarget, updateSandbox } from './sandbox-update.mjs';
import { createOfficeManager } from './agent-office-manager.mjs';
import { createProjectHostManager } from './project-ssh-host.mjs';

export function activateStatus(orca, { collect = readSandboxStatus, collectActivity = readSandboxActivity, update = updateSandbox, targetDigest = managedTarget, run = statusCommand,
  interval = setInterval, clear = clearInterval, now = Date.now, office = createOfficeManager({ log: message => orca.log(message) }),
  hosts = createProjectHostManager({ run, log: message => orca.log(message) }) } = {}) {
  let snapshot = { checkedAt: null, projects: [], error: null }, settings = { ...statusSettings }, pending, timer, disposed = false;
  let activity = [], activityError = null, launch = null;
  const updates = {};
  const workflowTarget = targetDigest();
  const subscriptions = [];
  const post = () => {
    if (!disposed) orca.panels.post('sandbox.changed', { ...snapshot, managedTarget: workflowTarget, settings, activity, activityError, launch, updates: { ...updates } });
  };
  async function refresh() {
    if (pending) return pending;
    pending = (async () => {
      try { snapshot = await collect({ runtimeDetails: settings.runtimeDetails }); }
      catch { snapshot = { checkedAt: now(), projects: [], error: 'Sandbox ownership could not be verified. Inspect the retained records.' }; }
      if (disposed) return snapshot;
      void hosts.sync(snapshot.projects);
      void office.sync(snapshot.projects, { autoOpen: settings.autoOpenOffice !== false });
      try { ({ activity, activityError } = await collectActivity({ projects: snapshot.projects, run })); }
      catch { activity = []; activityError = 'Agent activity could not be read from the project sandboxes.'; }
      if (disposed) return snapshot;
      const indicator = connectionIndicator(snapshot);
      await orca.host.call('statusBar.update', { id: 'sandbox', ...indicator, visible: settings.showStatusBar });
      post();
      return snapshot;
    })().finally(() => { pending = null; });
    return pending;
  }
  const notify = () => { void refresh().catch(() => orca.log('Sandbox status refresh unavailable')); };
  async function loadSettings() {
    const values = await orca.settings.get();
    settings = { refreshSeconds: Number.isInteger(values.refreshSeconds) && values.refreshSeconds >= 15 && values.refreshSeconds <= 300 ? values.refreshSeconds : 30,
      runtimeDetails: typeof values.runtimeDetails === 'boolean' ? values.runtimeDetails : true,
      showStatusBar: typeof values.showStatusBar === 'boolean' ? values.showStatusBar : true };
    settings.autoOpenOffice = values.autoOpenOffice !== false;
    if (timer) clear(timer);
    timer = interval(notify, settings.refreshSeconds * 1000); timer.unref?.();
    notify();
  }
  subscriptions.push(orca.panels.handle('sandbox.status', async () => ({ ...await refresh(), managedTarget: workflowTarget, settings, activity, activityError, launch, updates: { ...updates } })));
  subscriptions.push(orca.panels.handle('sandbox.office', async input => {
    const project = snapshot.projects.find(p => p.projectId === input?.projectId && p.id === input?.sandboxId);
    if (!project) throw Error('Choose an owned project sandbox.');
    return office.open(snapshot.projects, project.id);
  }));
  subscriptions.push(orca.panels.handle('sandbox.update', async input => {
    if (!input || typeof input.projectId !== 'string' || typeof input.sandboxId !== 'string') throw Error('Choose a project sandbox to update.');
    const key = input.sandboxId;
    if (updates[key]?.state === 'running') return { accepted: true };
    updates[key] = { state: 'running', message: 'Checking sandbox', at: now() }; post();
    void update({ projectId: input.projectId, sandboxId: input.sandboxId, run, onProgress: message => { updates[key] = { state: 'running', message, at: now() }; post(); } })
      .then(result => { updates[key] = { state: 'succeeded', message: result.message, at: now() }; })
      .catch(error => { updates[key] = { state: 'failed', message: /^Close all OMP|^Sandbox ownership|^The owned sandbox/.test(error.message) ? error.message : 'Update failed. Previous managed files were retained or restored; check network access and free space before retrying.', at: now() }; })
      .finally(() => { post(); if (!disposed) notify(); });
    return { accepted: true };
  }));
  orca.commands.register('teck.sandboxStatus', async (_args, context) => {
    await run(process.env.ORCA_CLI_COMMAND || 'orca', ['plugin', 'open', 'teck-lab.teck-sbx-recipes', '--panel', 'sandbox', '--json'],
      { signal: context?.signal });
    notify();
    return 'Opened Teck sandbox status';
  });
  subscriptions.push(orca.events.on('workspace.changed', notify));
  subscriptions.push(orca.events.on('agent.status.changed', notify));
  // These hooks observe delivery only. A prompt receipt is never labelled as
  // execution, and neither prompts nor launch command/environment are retained.
  subscriptions.push(orca.hooks.on('agent.launch.before', event => {
    if (event.agent !== 'omp') return;
    launch = { kind: 'launch-requested', at: now(), terminalId: event.terminalId ?? null }; post();
  }));
  subscriptions.push(orca.hooks.on('agent.prompt.before', event => {
    if (event.agent !== 'omp') return;
    launch = { kind: event.inputKind === 'orchestration' ? 'dispatch-input-requested' : 'prompt-requested',
      at: now(), terminalId: event.terminalId }; post();
  }));
  subscriptions.push(orca.settings.onDidChange(() => { void loadSettings().catch(() => orca.log('Sandbox settings unavailable')); }));
  void loadSettings().catch(() => orca.log('Sandbox settings unavailable'));
  return { refresh, dispose() { disposed = true; office.dispose(); if (timer) clear(timer); for (const item of subscriptions) item?.dispose?.(); } };
}
