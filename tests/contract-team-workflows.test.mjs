import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.mjs';
import { client } from './http-helper.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/team-acceptance-contract.json',import.meta.url)));
const tick=()=>new Promise(r=>setImmediate(r));
const base='/teams/contract-team/projects/contract-project';
async function setup(t, options) {
 const dir=mkdtempSync(join(tmpdir(),'mr-white-contract-'));
 const app=createApp({dir,...options});
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const c=await client(app.app);await c.request('/settings','PATCH',{aiConsent:true});
 return {app,c};
}
const start=(c,id,text=fixture.request,role='director')=>c.request(base+'/runs','POST',{id,text,role,model:'Codex'});
const read=async(c,id)=>(await c.request(base+'/runs')).data.find(r=>r.id===id);
test('contract: synthetic topic acceptance through gate, concurrent production and exact writer render',async t=>{
 let searches=0,renders=0;const calls=[],release={};
 const {c}=await setup(t,{runner:prompt=>{
  const role=prompt.match(/的 (\w+)。/)[1];calls.push(role);
  if(['writer','designer'].includes(role)) return {promise:new Promise(r=>release[role]=r),cancel(){release[role]({content:''});}};
  return {promise:Promise.resolve({content:role==='research'?fixture.outputs.research[0]:calls.length===2?JSON.stringify(fixture.topics):fixture.outputs.director.at(-1)}),cancel(){}};
 },teamOptions:{trendSearch:async()=>{searches++;return structuredClone(fixture.search);},renderCarousel:async({copy})=>{
  renders++;assert.deepEqual(copy,JSON.parse(fixture.outputs.writer[0]));
  return copy.slides.map((_,i)=>({width:1080,height:1350,sha256:"a".repeat(64),name:`${i+1}.png`}));
 }}});
 assert.equal((await start(c,'replay')).status,202);await tick();
 let run=await read(c,'replay');assert.equal(run.status,'awaiting_selection');assert.deepEqual(calls,['research','director']);assert.equal(renders,0);
 const selection={topicId:run.topics[0].id};
 assert.equal((await c.request(base+'/runs/replay/select','POST',selection)).status,202);await tick();
 assert.deepEqual(calls,['research','director','writer','designer']);assert.equal(renders,0);
 assert.equal((await c.request(base+'/runs/replay/select','POST',selection)).status,200);
 assert.equal(calls.length,4);
 release.writer({content:fixture.outputs.writer[0]});await tick();assert.equal(renders,0);
 release.designer({content:fixture.outputs.designer[0]});await tick();
 run=await read(c,'replay');assert.equal(run.status,'completed');
 assert.equal(searches,1);assert.equal(renders,1);
 assert.deepEqual(run.steps.map(s=>s.kind||s.role),['trend_search','research','director','writer','designer','render','director']);
 assert.deepEqual(run.deliverable.slides,JSON.parse(fixture.outputs.writer[0]).slides);
 await c.request(base+'/runs/replay/select','POST',selection);assert.equal(calls.length,5);assert.equal(searches,1);
});
test('contract: cancellation during failed supplementary search never invokes fallback',async t=>{
 let rejectSearch,calls=0;
 const {c,app}=await setup(t,{runner:()=>{calls++;throw Error('fallback forbidden');},teamOptions:{trendSearch:()=>new Promise((_,reject)=>rejectSearch=reject)}});
 app.store.put('teamSources',{id:'contract-team:contract-project',teamId:'contract-team',projectId:'contract-project',dataEpoch:app.store.get('settings','main').epoch,sources:[{name:'saved',url:'https://example.com/saved',content:'Existing evidence would normally enable fallback.'}]});
 await start(c,'cancel');await tick();
 assert.equal((await c.request(base+'/runs/cancel/cancel','POST',{})).data.status,'cancelled');
 rejectSearch(Error('search aborted'));await tick();
 assert.equal(calls,0);assert.equal((await read(c,'cancel')).status,'cancelled');
});
test('contract: synthetic account registration, collection and researcher report without production',async t=>{
 let calls=0,searches=0;
 const {c}=await setup(t,{runner:()=>({promise:Promise.resolve({content:(calls++,'研究報告')}),cancel(){}}),teamOptions:{
  trackingCollector:async account=>({posts:structuredClone(fixture.accounts.find(a=>a.url===account.url).posts),partial:true}),
  trendSearch:async()=>{searches++;return structuredClone(fixture.search);}
 }});
 const text='追蹤這些帳號\n'+fixture.accounts.map(a=>a.url).join('\n');
 await start(c,'tracking',text,'research');await tick();assert.equal(calls,0);
 assert.equal((await read(c,'tracking')).workflow,'track-accounts');assert.equal((await read(c,'tracking')).status,'completed');
 let accounts=(await c.request(base+'/tracking')).data;assert.equal(accounts.length,3);
 await start(c,'tracking-again',text,'research');await tick();assert.equal((await c.request(base+'/tracking')).data.length,3);
 for(const a of accounts){const response=await c.request(base+'/tracking/'+a.id+'/collect','POST',{});assert.equal(response.status,200);assert.equal(response.data.status,'partial');assert.equal(response.data.posts.length,3);}
 assert.equal((await c.request('/teams/other/projects/contract-project/tracking')).data.length,0);
 await start(c,'report','整理一下目前最新的趨勢有哪些','research');await tick();
 const report=await read(c,'report');assert.equal(report.status,'completed');assert.equal(report.workflow,'trend-report');assert.equal(calls,1);assert.equal(searches,1);
 assert.deepEqual(report.steps.map(s=>s.kind||s.role),['trend_search','research']);
});
