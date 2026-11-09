import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { issueWorktree, executionKey } from '../runtime/omp/extensions/lib/issue-worktree.mjs';
const tmp=fs.mkdtempSync(join(tmpdir(),'teck-issue-'));after(()=>fs.rmSync(tmp,{recursive:true,force:true}));let seq=0;
const issue='https://github.com/Teck-Lab/Teck.Monorepo/issues/906';
const input={role:'executor',issue,objective:'Implement issue',acceptance:['Tests pass'],constraints:'Own scope'};
function fixture(){
 const parent={id:'parent',projectId:'project',branch:'feature'};
 const child={id:'child',projectId:'project',branch:'child',parentWorktreeId:'parent',path:'/work/issue-906-executor-old'};
 const worker={runId:'run_old',taskId:'task_old',dispatchId:'ctx_old',dispatchStatus:'completed',terminalState:'released',agentTerminalHandle:'term_old',resource:{worktreeId:'child',releaseState:'released',ownershipState:'released'}};
 const s={parent,child,children:[child],workers:[worker],live:0,unknown:0,tasks:[{id:'task_old',spec:'TECK_ORCA_ASSIGNMENT '+JSON.stringify(input)}],calls:[],directory:join(tmp,String(++seq))};
 s.run=async args=>{
  s.calls.push(args);
  if(s.override){const result=await s.override(args);if(result!==undefined)return result;}
  switch(args.slice(0,2).join(' ')){
   case 'worktree show':return {worktree:args.includes('id:parent')?s.parent:s.children.find(w=>'id:'+w.id===args[args.indexOf('--worktree')+1])};
   case 'worktree list':return {worktrees:s.children,totalCount:s.children.length,truncated:false};
   case 'worktree ps':return {worktrees:s.children.map(w=>({worktreeId:w.id,liveTerminalCount:s.live,unverifiableTerminalCount:s.unknown})),totalCount:s.children.length,truncated:false};
   case 'orchestration worker-list':return {workers:s.workers,page:{hasMore:false}};
   case 'orchestration task-list':return {tasks:s.tasks,count:s.tasks.length};
   case 'orchestration worker-show':return {dispatch:{id:'ctx_new'},terminal:{worktreeId:'child'}};
   default:throw Error('Unexpected command '+args.join(' '));
  }
 };
 s.route=(changes={})=>issueWorktree({input:{...input,...changes},parentId:'parent',runId:'run_current',run:s.run,directory:s.directory});
 return s;
}
test('default and explicit new-child requests reuse the released issue checkout across Runs',async()=>{
 const s=fixture();
 for(const worktree of [undefined,'new-child']){const p=await s.route({worktree});try{assert.equal(p.worktree,'id:child');assert.equal(p.terminal,undefined);assert.equal(p.run,'run_current');}finally{p.close();}}
});
test('active issue prevents duplicate launch, even when another legacy child is explicitly selected',async()=>{
 const s=fixture();s.workers[0].dispatchStatus='dispatched';s.children.push({...s.child,id:'other',branch:'other'});
 await assert.rejects(s.route({worktree:'id:other'}),/active dispatch/);
});
test('empty issue creates only its first child, while changed titles retain the saved checkout',async()=>{
 const s=fixture();s.children=[];s.workers=[];s.tasks=[];
 const p=await s.route();assert.equal(p.worktree,'new-child');p.begin(['orchestration','worker-start','--spec','original']);s.children=[s.child];
 await p.record({dispatchId:'ctx_new'});p.close();
 const follow=await s.route({objective:'Fix review findings',title:'Different title'});assert.equal(follow.worktree,'id:child');follow.close();
});
test('ambiguous legacy issue requires explicit adoption and remembers that choice',async()=>{
 const s=fixture();s.children.push({...s.child,id:'other',branch:'other'});
 await assert.rejects(s.route(),/Multiple legacy/);
 const p=await s.route({worktree:'id:child'});p.begin(['start']);await p.record({dispatchId:'ctx_new'});p.close();
 const q=await s.route();assert.equal(q.worktree,'id:child');q.close();
 await assert.rejects(s.route({worktree:'id:other'}),/cannot switch/);
});
test('an issue worktree is never silently replaced if it is deleted or reparented',async()=>{
 const s=fixture();const p=await s.route();p.begin(['start']);await p.record({dispatchId:'ctx_new'});p.close();s.children=[];
 await assert.rejects(s.route(),/missing or reparented/);
});
test('unrelated checkout and parent/same-branch/project reuse are rejected',async()=>{
 for(const mutation of [{parentWorktreeId:'elsewhere'},{branch:'feature'},{projectId:'foreign'}]){
  const s=fixture();Object.assign(s.child,mutation);await assert.rejects(s.route({worktree:'id:child'}),/direct child/);
 }
 const s=fixture();await assert.rejects(s.route({worktree:'id:unrelated'}),/existing issue/);
});
test('live, unverifiable and release-in-progress terminals block new editing sessions',async()=>{
 for(const change of [{live:1},{unknown:1}]){const s=fixture();Object.assign(s,change);await assert.rejects(s.route(),/live|uncertain/);}
 const s=fixture();s.workers[0].resource={...s.workers[0].resource,ownershipState:'owned',releaseState:'requested'};
 await assert.rejects(s.route(),/release is unresolved/);
});
test('settled current-Run terminal is reused rather than starting another terminal',async()=>{
 const s=fixture();s.live=1;Object.assign(s.workers[0],{runId:'run_current',terminalState:'reclaimable',resource:{worktreeId:'child',ownerDispatchId:'ctx_old',terminalHandle:'term_old',ownershipState:'owned',releaseState:'not_requested'}});
 const p=await s.route();assert.equal(p.terminal,'term_old');assert.equal(p.worktree,'id:child');p.close();
 await assert.rejects(s.route({terminal:'term_other'}),/not the issue owner/);
});
test('all worker inventory pages participate in collision detection',async()=>{
 const s=fixture();s.override=args=>args[1]==='worker-list'?{workers:args.includes('--cursor')?[{...s.workers[0],dispatchStatus:'dispatched'}]:[],page:args.includes('--cursor')?{hasMore:false}:{hasMore:true,nextCursor:'next'}}:undefined;
 await assert.rejects(s.route(),/active dispatch/);
});
test('incomplete, failing or repeating inventories cannot authorize new worktrees',async()=>{
 for(const which of ['list','worker-list','task-list','ps']){
  const s=fixture();s.override=args=>args[1]===which?{}:undefined;await assert.rejects(s.route(),/Incomplete|uncertain/);
 }
 const s=fixture();s.override=args=>args[1]==='worker-list'?{workers:[],page:{hasMore:true,nextCursor:'same'}}:undefined;
 await assert.rejects(s.route(),/Repeated/);
});
test('shared lock serializes coordinators, and failures release it',async()=>{
 const s=fixture();const p=await s.route();await assert.rejects(s.route(),/pending/);p.close();
 s.override=()=>{throw Error('metadata unavailable')};await assert.rejects(s.route(),/unavailable/);s.override=null;const q=await s.route();q.close();
});
test('corrupt saved ownership fails closed without stranding the placement lock',async()=>{
 const s=fixture();const p=await s.route();p.begin(['start']);p.close();
 const file=fs.readdirSync(s.directory).find(n=>n.endsWith('.json'));fs.writeFileSync(join(s.directory,file),'{bad');
 await assert.rejects(s.route(),SyntaxError);assert.equal(fs.readdirSync(s.directory).some(n=>n.endsWith('.lock')),false);
});
test('uncertain launch survives reload and only exact request replay or explicit adoption is permitted',async()=>{
 const s=fixture();s.children=[];s.workers=[];s.tasks=[];const p=await s.route();p.begin(['orchestration','worker-start','--spec','original']);await p.record({ok:false,requestId:'request1'});p.close();
 await assert.rejects(s.route(),/uncertain/);await assert.rejects(s.route({retry_request:'wrong'}),/uncertain/);
 const replay=await s.route({retry_request:'request1',objective:'Must not replace original'});assert.deepEqual(replay.replayArgs,['orchestration','worker-start','--spec','original','--retry-request','request1']);s.children=[s.child];await replay.record({dispatchId:'ctx_new'});replay.close();
 const follow=await s.route();assert.equal(follow.worktree,'id:child');follow.close();
});
test('parallel lanes require explicit rationale and reuse the same lane on follow-ups',async()=>{
 const s=fixture();await assert.rejects(s.route({parallel_key:'frontend'}),/reason/);
 const lane={parallel_key:'frontend',parallel_reason:'Own web UI files; depends on the accepted API contract'};
 const p=await s.route(lane);assert.equal(p.worktree,'new-child');p.begin(['start']);s.workers=[];await p.record({dispatchId:'ctx_new'});p.close();
 const q=await s.route(lane);assert.equal(q.worktree,'id:child');q.close();
});
test('known parallel lanes do not collide with the canonical issue checkout',async()=>{
 const s=fixture();s.workers[0].dispatchStatus='dispatched';s.tasks[0].spec='TECK_ORCA_ASSIGNMENT '+JSON.stringify({...input,parallel_key:'frontend',parallel_reason:'Own UI files independently'});
 const p=await s.route();assert.equal(p.worktree,'new-child');p.close();
 await assert.rejects(s.route({worktree:'id:child'}),/another issue/);
});
test('issue normalization and non-GitHub task keys are stable',()=>{
 assert.equal(executionKey(input),executionKey({...input,issue:issue.toUpperCase().replace('HTTPS://GITHUB.COM','https://github.com').replace('/ISSUES/','/issues/')+'/'}));
 assert.equal(executionKey({role:'executor',workspace_key:'integration-888'}),'task:integration-888');
 assert.throws(()=>executionKey({...input,issue:'#906'}),/canonical/);
 assert.throws(()=>executionKey({role:'executor',workspace_key:'../escape'}),/stable/);
 assert.equal(executionKey({...input,role:'reviewer'}),null);
});
