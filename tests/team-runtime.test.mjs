import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {client} from './http-helper.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
test('team runtime executes bounded delegation, persists scope, prevents duplicate execution and archives read-only',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'team-runtime-'));let calls=0;
 const app=createApp({dir,runner:()=>({promise:Promise.resolve({content:++calls===1?JSON.stringify({reply:'開始',tasks:[{role:'writer',task:'寫草稿'}]}):'實際交付'}),cancel(){}})});
 try{const c=await client(app.app);await c.request('/settings','PATCH',{aiConsent:true});
 const body={id:'one',role:'director',text:'寫內容',model:'Codex',skills:[]};
 assert.equal((await c.request('/teams/t/projects/p/runs','POST',body)).status,202);await tick();await tick();
 const r=await c.request('/teams/t/projects/p/runs');assert.equal(r.data[0].status,'completed');assert.equal(r.data[0].steps.length,3);assert.equal(calls,3);
 assert.equal((await c.request('/teams/t/projects/p2/runs')).data.length,0);
 assert.equal((await c.request('/teams/t/projects/p/runs','POST',body)).status,200);assert.equal(calls,3);
 assert.equal((await c.request('/teams/t/projects/p2/runs','POST',body)).status,409);
 assert.equal((await c.request('/archive')).status,200);
 }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
test('cancellation suppresses late results; invalid provider and missing consent fail',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'team-runtime-'));let resolve;
 const app=createApp({dir,runner:()=>({promise:new Promise(r=>resolve=r),cancel(){}})});
 try{const c=await client(app.app),body={id:'run',role:'writer',text:'內容',model:'Codex'};
 assert.equal((await c.request('/teams/t/projects/p/runs','POST',body)).status,403);
 await c.request('/settings','PATCH',{aiConsent:true});
 assert.equal((await c.request('/teams/t/projects/p/runs','POST',{...body,model:'Gemini'})).status,400);
 await c.request('/teams/t/projects/p/runs','POST',body);await tick();
 assert.equal((await c.request('/teams/t/projects/p/runs/run/cancel','POST',{})).status,200);
 resolve({content:'late'});await tick();
 assert.equal((await c.request('/teams/t/projects/p/runs')).data[0].status,'cancelled');
 }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
test('workspace persistence uses revisions; source binding and file trash remain scoped',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'team-runtime-'));
 const app=createApp({dir,runner:()=>({promise:Promise.resolve({content:'稿件'}),cancel(){}})});
 try{const c=await client(app.app);const {initialState}=await import('../src/team-state.mjs');const state=initialState();
 assert.equal((await c.request('/team-workspace')).data.state,null);
 assert.equal((await c.request('/team-workspace','PUT',{revision:0,state})).status,200);
 assert.equal((await c.request('/team-workspace','PUT',{revision:0,state})).status,409);
 assert.deepEqual((await c.request('/team-workspace')).data.state,state);
 app.store.put('socialPost',{id:'source',body:'真實收錄的內容',url:'https://example.com'});
 assert.equal((await c.request('/teams/t/projects/p/sources','POST',{ids:['source']})).status,200);
 await c.request('/settings','PATCH',{aiConsent:true});await c.request('/teams/t/projects/p/runs','POST',{id:'a',role:'writer',text:'寫稿',model:'Codex'});await tick();
 const r=(await c.request('/teams/t/projects/p/runs')).data[0];assert.equal(r.context.references[0].content,'真實收錄的內容');
 const path='/teams/t/projects/p/runs/a/outputs/'+r.steps[0].id;
 assert.equal((await c.request(path,'PATCH',{deleted:true,name:'原創稿'})).data.steps[0].deleted,true);
 assert.equal((await c.request(path.replace('/projects/p/','/projects/other/'),'PATCH',{deleted:false})).status,404);
 assert.equal((await c.request(path,'PATCH',{deleted:false})).data.steps[0].name,'原創稿');
 }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
test('director follow-up receives same-project conversation without leaking other projects',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dialogue-')),prompts=[];const app=createApp({dir,runner:prompt=>{prompts.push(prompt);return {promise:Promise.resolve({content:JSON.stringify({reply:'收到，請繼續補充。',tasks:[]})}),cancel(){}}}});
 try{const c=await client(app.app);await c.request('/settings','PATCH',{aiConsent:true});for(const [project,id,text]of [['p','first','品牌叫青芽，對象是小店經營者'],['other','private','OTHER_PROJECT_SECRET'],['p','second','請依照我剛才說的對象，先和我討論方向']]){await c.request(`/teams/t/projects/${project}/runs`,'POST',{id,role:'director',model:'Codex',text});await tick();await tick();}assert.match(prompts[2],/品牌叫青芽/);assert.match(prompts[2],/收到，請繼續補充/);assert.doesNotMatch(prompts[2],/OTHER_PROJECT_SECRET/);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
