import { statusCommand } from './sandbox-status.mjs';

const text = value => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 160);
const states = new Set(['working', 'waiting', 'blocked', 'done']);
// Query Orca's public CLI on the execution host. Do not read terminal output,
// transcripts, prompts, task briefs, environment variables or credentials.
export const activityProbe = String.raw`
const cp=require('node:child_process');
const response=JSON.parse(cp.execFileSync('/home/agent/.orca/cli/bin/orca',
 ['worktree','ps','--limit','1000','--json'],{encoding:'utf8',timeout:6000,maxBuffer:8388608,stdio:['ignore','pipe','pipe']}));
if(response.ok!==true||!Array.isArray(response.result?.worktrees))throw Error('Activity unavailable');
const result=response.result;
const issue=value=>{const url=typeof value==='string'?value:value?.url||value?.html_url;return typeof url==='string'&&/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*$/.test(url)?url:null;};
const assignments=new Map();
let issueLookupIncomplete=false;
try{
 const deadline=Date.now()+4000;
 const cli=args=>{const timeout=deadline-Date.now();if(timeout<100)throw Error('Issue lookup budget');const r=JSON.parse(cp.execFileSync('/home/agent/.orca/cli/bin/orca',args.concat('--json'),{encoding:'utf8',timeout,maxBuffer:8388608,stdio:['ignore','pipe','pipe']}));if(!r.ok)throw Error('Unavailable');return r.result;};
 const terminals=cli(['terminal','list']).terminals??[],runs=new Map();let cursor,seen=new Set();
 for(let page=0;page<4;page++){
  const list=cli(['orchestration','worker-list','--full',...(cursor?['--cursor',cursor]:[])]);
  for(const w of list.workers??[]){
   if(w.dispatchStatus!=='dispatched'||!terminals.some(t=>t.handle===w.agentTerminalHandle))continue;
   const r=cli(['orchestration','worker-show','--dispatch',w.dispatchId,'--full']),d=r.dispatch,t=r.terminal;
   if(r.observation?.exactWorker!==true||r.observation?.status!=='live'||d?.status!=='dispatched'||d.capabilityRevokedAt||d.assigneeHandle!==w.agentTerminalHandle||!t?.ptyId||!t?.incarnationId||d.processIncarnation!==t.ptyId+':'+t.incarnationId)continue;
   if(!runs.has(w.runId))runs.set(w.runId,cli(['orchestration','task-list','--run',w.runId,'--full']).tasks??[]);
   const task=runs.get(w.runId).find(v=>v.id===w.taskId&&v.dispatch_id===w.dispatchId&&v.assignee_handle===d.assigneeHandle);
   const m=task?.spec?.match(/^TECK_ORCA_ASSIGNMENT (\{[^\n]+\})$/m);if(!m)continue;
   const url=issue(JSON.parse(m[1]).issue);if(url&&d.assigneePaneKey)assignments.set(d.assigneePaneKey,url);
  }
  cursor=list.page?.nextCursor;if(!cursor||seen.has(cursor))break;seen.add(cursor);
 }
}catch{issueLookupIncomplete=true;}
console.log(JSON.stringify({truncated:result.truncated===true,issueLookupIncomplete,workspaces:result.worktrees.map(w=>({
 id:w.worktreeId,title:w.displayName||w.branch,issue:issue(w.linkedIssue),agents:(w.agents??[]).map(a=>({
  id:a.paneKey,title:a.displayName||a.conversationName||a.agentType,agent:a.agentType,state:a.state,
  updatedAt:a.updatedAt,tool:a.toolName,issue:assignments.get(a.paneKey)||null,
  stateStartedAt:a.stateStartedAt,live:a.hasLivePty===true,observation:a.subagentObservation,
  subagents:(a.subagents??[]).map(s=>({id:s.id,title:s.description||s.id,agent:s.agentType,state:s.state,startedAt:s.startedAt}))
 }))}))}));
`;

export function projectActivity(data, project) {
  if (!Array.isArray(data?.workspaces)) throw Error('Invalid activity inventory');
  const result = [];
  for (const workspace of data.workspaces.slice(0, 1000)) {
    if (typeof workspace.id !== 'string' || !Array.isArray(workspace.agents)) throw Error('Invalid workspace activity');
    for (const agent of workspace.agents.slice(0, 100)) {
      if (typeof agent.id !== 'string' || !agent.id) continue;
      const id = `${project.id}:${workspace.id}:${agent.id}`;
      const state = states.has(agent.state) && (agent.live === true || agent.state === 'done') ? agent.state : 'unconfirmed';
      const issue = validIssue(agent.issue) || validIssue(workspace.issue);
      const common = { workspace: text(workspace.title), sandbox: project.name, terminalId: null,
        issue, issueSource: validIssue(agent.issue) ? 'assignment' : issue ? 'workspace' : null };
      result.push({ ...common, id, title: text(agent.title || agent.agent || 'Agent'), agent: text(agent.agent), state,
        kind: 'agent', updatedAt: Number.isFinite(agent.updatedAt) ? agent.updatedAt : null, tool: text(agent.tool) || null,
        stateStartedAt: Number.isFinite(agent.stateStartedAt) ? agent.stateStartedAt : null });
      for (const child of (Array.isArray(agent.subagents) ? agent.subagents : []).slice(0, 100)) {
        if (typeof child.id !== 'string' || !child.id) continue;
        const live = agent.live === true && agent.observation === 'live';
        result.push({ ...common, id: `${id}:child:${child.id}`, parentId: id, title: text(child.title || child.id), agent: text(child.agent),
          state: states.has(child.state) && (live || child.state === 'done') ? child.state : 'unconfirmed', kind: 'subagent',
          issueSource: issue ? 'parent' : null, tool: null, updatedAt: Number.isFinite(agent.updatedAt) ? agent.updatedAt : null,
          stateStartedAt: Number.isFinite(child.startedAt) ? child.startedAt : null });
      }
    }
  }
  return result;
}
export const validIssue = value => typeof value === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*$/.test(value) ? value : null;

export async function readSandboxActivity({ projects = [], run = statusCommand } = {}) {
  const activity = [], errors = [];
  for (const project of projects.filter(p => p.state === 'running')) {
    try {
      // sbx exec can start a stopped VM: recheck exact identity and running state.
      const rows = JSON.parse(await run('sbx', ['ls', '--json']));
      if (!Array.isArray(rows) || rows.filter(r => r.name === project.name).length !== 1) throw Error('Inventory changed');
      const current = rows.find(r => r.name === project.name);
      if (current.id !== project.id || current.status !== 'running') throw Error('Sandbox changed');
      const data = JSON.parse(await run('sbx', ['exec', '-u', 'agent', project.name, 'node', '-e', activityProbe]));
      activity.push(...projectActivity(data, project));
      if (data.truncated) errors.push('Some sandbox workspaces were omitted by Orca.');
      if (data.issueLookupIncomplete) errors.push('Some GitHub issue links could not be verified. Agent status is still shown.');
    } catch { errors.push('Agent activity could not be read from a project sandbox.'); }
  }
  return { activity: activity.slice(0, 1000), activityError: [...new Set(errors)].join(' ') || null };
}
