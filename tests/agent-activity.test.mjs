import test from 'node:test';
import assert from 'node:assert/strict';
import {runningAgents,agentActivity} from '../shared/agent-activity.mjs';
test('indicators follow active specialists, including parallel work, instead of the message recipient',()=>{
 const run={role:'director',status:'running',steps:[{role:'research',status:'completed'},{role:'writer',status:'running'},{role:'designer',status:'running'}]};
 assert.deepEqual(runningAgents(run).map(x=>x.role),['writer','designer']);
 for(const status of ['awaiting_selection','completed','failed','cancelled','interrupted'])assert.deepEqual(runningAgents({...run,status}),[]);
 assert.equal(runningAgents({role:'director',status:'running',steps:[]})[0].role,'director');
});
test('activity includes real collection and media work, scoped by epoch and project',()=>{
 const rows=agentActivity([{teamId:'t',projectId:'p',dataEpoch:'old',status:'running',role:'writer'}],[{teamId:'t',projectId:'p2',dataEpoch:'current',username:'a',status:'collecting',posts:[]},{teamId:'t2',projectId:'p3',dataEpoch:'current',username:'b',status:'partial',posts:[{mediaStatus:'analyzing'}]}],'current');
 assert.equal(rows.length,2);assert.deepEqual(rows.map(x=>x.role),['research','research']);assert.deepEqual(rows.map(x=>x.projectId),['p2','p3']);
});

test('activity API reports a real pending run then clears immediately on cancellation',async()=>{
 const {createApp}=await import('../server/app.mjs');const {client}=await import('./http-helper.mjs');const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'agent-activity-'));let release;
 const app=createApp({dir,runner:()=>({promise:new Promise(r=>release=r),cancel(){release({content:'cancelled'});}})});
 try{const c=await client(app.app);await c.request('/settings','PATCH',{aiConsent:true});await c.request('/teams/t/projects/p/runs','POST',{id:'pending',role:'writer',model:'Codex',text:'寫文案'});await new Promise(r=>setImmediate(r));const response=await c.request('/team-activity');assert.equal(response.status,200);assert.deepEqual(response.data,[{role:'writer',label:'文案撰寫中',teamId:'t',projectId:'p'}]);await c.request('/teams/t/projects/p/runs/pending/cancel','POST',{});assert.deepEqual((await c.request('/team-activity')).data,[]);
 }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
