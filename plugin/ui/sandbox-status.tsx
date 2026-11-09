import { atom, Badge, Box, Button, Callout, Card, Collapsible, EmptyState, Heading, KeyValue,
  Link, plugin, Progress, read, RelativeTime, Row, Select, set, settings, Spinner, Stack, Switch, Tab, Tabs, Text,
  type PanelContext } from 'orca';
import type { Snapshot } from './protocol';

const snapshot = atom<Snapshot | null>(null), error = atom(''), loading = atom(false), tab = atom('sandbox-view', 'overview', { persist: 'plugin' });
let signal: AbortSignal | undefined;
async function refresh() {
  set(loading, true); set(error, '');
  try { const result = await plugin.request('sandbox.status', undefined, { signal, timeoutMs: 120000 }); if (!signal?.aborted) set(snapshot, result); }
  catch { if (!signal?.aborted) set(error, 'Could not read sandbox status. Check the plugin is enabled and approved.'); }
  finally { if (!signal?.aborted) set(loading, false); }
}
async function configure(key: string, value: number | boolean) {
  try { await settings.set(key, value); await refresh(); }
  catch { set(error, 'Could not save this setting.'); }
}
async function update(project: Snapshot['projects'][number]) {
  try { await plugin.request('sandbox.update', { projectId: project.projectId, sandboxId: project.id }, { signal }); await refresh(); }
  catch { set(error, 'Could not start the update. Refresh and try again.'); }
}
async function openOffice(project: Snapshot['projects'][number]) {
  set(error, '');
  try { await plugin.request('sandbox.office', { projectId: project.projectId, sandboxId: project.id }, { signal, timeoutMs: 45000 }); }
  catch { set(error, 'Pixel office is unavailable. The owned sandbox must be running and the local Agent Office service available.'); }
}
export function setup(ctx: PanelContext) {
  signal = ctx.signal;
  ctx.subscriptions.push(plugin.on('sandbox.changed', value => set(snapshot, value)));
  void refresh();
}
const gib = (value: number) => `${(value / 1024 ** 3).toFixed(1)} GiB`;
const label = (state: string) => ({ working: 'Working', blocked: 'Needs input', waiting: 'Waiting', done: 'Turn ended', unconfirmed: 'Unconfirmed' })[state] ?? state;
const tone = (state: string): 'accent' | 'warning' | 'neutral' => state === 'working' ? 'accent' : state === 'blocked' ? 'warning' : 'neutral';
type Disk = { available: number; total: number } | null | undefined;
function Storage({ name, disk, description }: { name: string; disk: Disk; description: string }) {
  if (!disk) return <Stack gap="xs"><Text weight="medium">{name}</Text><Text muted size="xs">Not checked</Text></Stack>;
  const used = Math.max(0, disk.total - disk.available), percent = Math.round(used / disk.total * 100), low = percent >= 85;
  return <Stack gap="xs">
    <Row justify="between" wrap gap="xs"><Text weight="medium">{name}</Text><Badge tone={low ? 'warning' : 'neutral'}>{percent}% used</Badge></Row>
    <Progress label={`${name} used`} labelHidden value={percent} />
    <Text size="sm">{gib(disk.available)} free <Text muted>of {gib(disk.total)}</Text></Text>
    <Text muted size="xs">{gib(used)} used · {description}</Text>
    {low ? <Callout tone="warning">Low {name} space. Review storage before building or deploying.</Callout> : null}
  </Stack>;
}
function Agent({ agent, checkedAt }: { agent: Snapshot['activity'][number]; checkedAt: number | null }) {
  const age = agent.stateStartedAt && checkedAt ? Math.max(0, Math.round((checkedAt - agent.stateStartedAt) / 60000)) : null;
  const stale = agent.state === 'working' && agent.updatedAt && checkedAt && checkedAt - agent.updatedAt > 5 * 60000;
  return <Stack gap="sm">
    <Row justify="between" gap="sm" wrap><Text weight="semibold">{agent.title || agent.agent || 'Agent'}</Text><Badge tone={tone(agent.state)}>{label(agent.state)}</Badge></Row>
    <Text muted size="xs">{agent.kind === 'subagent' ? 'Subagent' : agent.agent?.toUpperCase() || 'Agent'} · {agent.workspace}{age === null ? '' : ` · ${age < 1 ? '<1' : age} min in this state`}</Text>
    {agent.tool ? <Text size="sm">Last tool <Text muted>{agent.tool}</Text></Text> : null}
    {agent.updatedAt ? <Text muted size="xs">Last report <RelativeTime at={agent.updatedAt} /></Text> : null}
    {agent.issue ? <Row gap="xs" wrap><Text size="sm">{agent.issueSource === 'parent' ? 'Parent issue' : agent.issueSource === 'workspace' ? 'Workspace issue' : 'Assigned issue'}</Text><Link href={agent.issue}>{`#${agent.issue.split('/').at(-1)}`}</Link></Row> : <Text muted size="xs">No GitHub issue reported</Text>}
    {stale ? <Text tone="warning" size="xs">No recent status report. This alone does not prove the agent is stalled.</Text> : null}
  </Stack>;
}
export default function SandboxStatus() {
  const data = read(snapshot), failure = read(error), busy = read(loading);
  const working = data?.activity.filter(a => a.state === 'working').length ?? 0;
  return <Box padding="md" scroll="y" width="100%" minWidth={0}><Stack gap="md">
    <Row justify="between" gap="sm"><Heading>Teck sandbox</Heading><Button icon="refresh" variant="ghost" disabled={busy} onPress={refresh}>Refresh</Button></Row>
    {failure ? <Callout tone="warning">{failure}</Callout> : null}
    {data?.error ? <Callout tone="warning">{data.error}</Callout> : null}
    {!data ? <Spinner label="Reading sandbox status" /> : null}
    {data ? <>
      <Tabs label="Sandbox view" value={read(tab)} onChange={value => set(tab, value)}>
        <Tab value="overview" label="Overview" icon="cloud"><Stack gap="md">
          {!data.error && !data.projects.length ? <EmptyState title="No project sandbox yet" description="Choose Teck OMP Project in Run on when creating your first workspace." icon="cloud" /> : null}
          {data.projects.map(project => {
            const runtime = project.runtime, cluster = runtime?.kubernetes;
            const connected = project.state === 'running' && runtime?.connection === 'ready';
            const needsUpdate = runtime && (runtime.omp !== data.target?.omp || runtime.daemon !== data.target?.orca || runtime.managedDigest !== data.managedTarget);
            return <Card title={project.title}><Stack gap="md">
              <Row gap="sm" wrap><Badge tone={connected ? 'success' : project.state === 'ownership-mismatch' ? 'danger' : 'neutral'}>{connected ? 'Connected' : project.state}</Badge>
                {needsUpdate ? <Button size="sm" variant="ghost" onPress={() => set(tab, 'updates')}>Updates available</Button> : null}</Row>
              <KeyValue items={[
                { label: 'Resources', value: `${project.cpus ?? '?'} CPUs · ${project.memory ?? '?'}` },
                { label: 'Orca / OMP', value: `${runtime?.daemon ?? 'Not checked'} / ${runtime?.omp ?? 'Not checked'}` },
                { label: 'KIND', value: cluster ? cluster.readiness === 'ready' ? `${cluster.ready}/${cluster.nodes} nodes Ready` : `${cluster.phase} · API ${cluster.readiness}` : 'Not checked / not configured' },
              ]} />
              <Storage name="Root disk" disk={runtime?.disk} description="Files, tools and OMP sessions" />
              <Storage name="Docker / KIND" disk={runtime?.dockerDisk} description="Images, containers and Kubernetes volumes" />
              <Button icon="globe" variant="outline" disabled={project.state !== 'running'} onPress={() => openOffice(project)}>Open pixel office</Button>
              {project.error ? <Callout tone="warning">{project.error}</Callout> : null}
              {project.state === 'ownership-mismatch' ? <Callout tone="danger">The sandbox no longer matches its ownership record. No commands were run in it.</Callout> : null}
              <Collapsible title="Sandbox details"><Text size="xs" muted>{project.name}</Text></Collapsible>
            </Stack></Card>;
          })}
          <Row justify="between" wrap gap="sm"><Text muted size="sm">{working} working · {data.activity.length} total</Text><Button size="sm" variant="outline" onPress={() => set(tab, 'agents')}>View agents</Button></Row>
        </Stack></Tab>
        <Tab value="agents" label="Agents" icon="bot"><Stack gap="md">
          <Text muted size="xs">Live reports across your project sandbox workspaces.</Text>
          {data.activityError ? <Callout tone="warning">{data.activityError}</Callout> : null}
          {!data.activity.length ? <EmptyState title={data.activityError ? 'Activity unavailable' : 'No agents reported'} icon="bot" /> : null}
          {data.activity.filter(a => !a.parentId || !data.activity.some(p => p.id === a.parentId)).slice(0, 100).map(agent => <Card><Stack gap="md">
            <Agent agent={agent} checkedAt={data.checkedAt} />
            {data.activity.filter(child => child.parentId === agent.id).map(child => <Box padding="sm" border background="muted" radius="sm"><Agent agent={child} checkedAt={data.checkedAt} /></Box>)}
          </Stack></Card>)}
          {data.launch ? <Text muted size="xs">Last launch or input requested <RelativeTime at={data.launch.at} />. Delivery does not confirm execution.</Text> : null}
        </Stack></Tab>
        <Tab value="updates" label="Updates" icon="refresh"><Stack gap="md">
          <Text muted size="sm">Apply the versions bundled with this plugin to an existing sandbox.</Text>
          {data.projects.map(project => {
            const runtime = project.runtime, job = data.updates?.[project.id], running = job?.state === 'running';
            const processes = runtime?.ompProcesses;
            const canUpdate = project.state === 'running' && processes === 0 && !running;
            return <Card title={project.title}><Stack gap="md">
              <KeyValue items={[
                { label: 'OMP', value: runtime?.omp === data.target?.omp ? `${runtime?.omp} (current)` : `${runtime?.omp ?? 'Unknown'} → ${data.target?.omp ?? '?'}` },
                { label: 'Managed guides', value: runtime?.managedDigest && runtime.managedDigest === data.managedTarget ? 'Current' : 'Refresh available' },
                { label: 'Open OMP processes', value: processes === null || processes === undefined ? 'Not checked' : String(processes) },
              ]} />
              {job ? <Callout tone={job.state === 'failed' ? 'warning' : job.state === 'succeeded' ? 'success' : 'accent'}>{job.message}</Callout> : null}
              {running ? <Spinner label="Updating sandbox" /> : null}
              {processes ? <Text tone="warning" size="sm">Close OMP sessions before updating. Your files and saved conversations are preserved.</Text> : null}
              {processes === null || processes === undefined ? <Text muted size="sm">Enable runtime checks and refresh to check whether maintenance can run.</Text> : null}
              <Button icon="refresh" disabled={!canUpdate} onPress={() => update(project)}>Update {project.title}</Button>
              <Text muted size="xs">Updates OMP, Teck orchestration, skills and launch helpers. Reopen OMP afterward. Configured models and credentials are preserved.</Text>
              <Collapsible title="Changes that need another step"><Stack gap="sm">
                <Text size="sm">Orca server {runtime?.daemon ?? '?'} → {data.target?.orca ?? '?'}: managed by Orca Desktop when connecting.</Text>
                <Text size="sm">Image packages and CPU/memory/disk limits require sandbox recreation. This action does not recreate your sandbox or stop Kubernetes.</Text>
              </Stack></Collapsible>
            </Stack></Card>;
          })}
        </Stack></Tab>
      </Tabs>
      <Collapsible title="Panel settings"><Stack gap="sm">
        <Select label="Refresh interval" value={String(data.settings.refreshSeconds)} options={[{ value: '15', label: '15 seconds' }, { value: '30', label: '30 seconds' }, { value: '60', label: '1 minute' }, { value: '120', label: '2 minutes' }]} onChange={value => configure('refreshSeconds', Number(value))} />
        <Switch label="Check storage, versions and KIND" checked={data.settings.runtimeDetails} onChange={value => configure('runtimeDetails', value)} />
        <Switch label="Show connection in status bar" checked={data.settings.showStatusBar} onChange={value => configure('showStatusBar', value)} />
        <Switch label="Open pixel office on sandbox startup" checked={data.settings.autoOpenOffice !== false} onChange={value => configure('autoOpenOffice', value)} />
      </Stack></Collapsible>
      {data.checkedAt ? <Text muted size="xs">Checked <RelativeTime at={data.checkedAt} /></Text> : null}
    </> : null}
  </Stack></Box>;
}
