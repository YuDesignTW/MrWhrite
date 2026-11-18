import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {client} from './http-helper.mjs';
import {parseTrendFeed} from '../server/trend-search.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const sources=[1,2,3].map(i=>({id:'news-'+i,title:'source '+i,url:'https://example.com/'+i,summary:'source summary'}));
const copy={title:'選定題目',caption:'真實來源的文案',slides:[1,2,3].map(i=>({title:'第'+i+'頁',body:'內容'}))};
test('selection gate, one search, concurrent specialists, exact copy rendering, scoped and idempotent selection',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'flow-'));let searches=0,renders=0,writerResolve,designerResolve;const calls=[];
 const runner=prompt=>{const role=prompt.match(/的 (\w+)。/)[1];calls.push(role);let promise;if(role==='research')promise=Promise.resolve({content:'研究報告'});else if(role==='director')promise=Promise.resolve({content:prompt.includes('依研究報告提出3')?JSON.stringify({topics:sources.map(s=>({title:s.title,angle:'方向',sourceIds:[s.id]}))}):'已完成彙整'});else promise=new Promise(r=>{if(role==='writer')writerResolve=r;else designerResolve=r;});return {promise,cancel(){}};};
 const app=createApp({dir,runner,teamOptions:{trendSearch:async()=>{searches++;return {sources,query:'test',fetchedAt:new Date().toISOString(),limitations:'摘要'};},renderCarousel:async args=>{renders++;assert.deepEqual(args.copy,copy);return [1,2,3].map(i=>({width:1080,height:1350,sha256:"a".repeat(64),name:`0${i}.png`}));}}});
 try{const c=await client(app.app),base='/teams/t/projects/p/runs';await c.request('/settings','PATCH',{aiConsent:true});const body={id:'choice',role:'director',text:'我要總監推薦內容給我選',model:'Codex'};
 assert.equal((await c.request(base,'POST',body)).status,202);await tick();await tick();let r=(await c.request(base)).data[0];assert.equal(r.status,'awaiting_selection');assert.equal(searches,1);assert.deepEqual(calls,['research','director']);assert.equal(renders,0);
 await c.request(base,'POST',body);assert.equal(searches,1);assert.equal((await c.request(base,'POST',{...body,id:'b',text:'直接寫'})).status,202);
 assert.equal((await c.request(base+'/choice/select','POST',{topicId:'invented'})).status,400);
 assert.equal((await c.request(base.replace('/p/','/other/')+'/choice/select','POST',{topicId:r.topics[0].id})).status,404);
 const selection={topicId:r.topics[0].id};assert.equal((await c.request(base+'/choice/select','POST',selection)).status,202);await tick();assert.equal(typeof writerResolve,'function');assert.equal(typeof designerResolve,'function');assert.equal(renders,0);
 await c.request(base+'/choice/select','POST',selection);assert.equal(calls.filter(r=>r==='writer').length,1);writerResolve({content:JSON.stringify(copy)});await tick();assert.equal(renders,0);designerResolve({content:JSON.stringify({style:'graphic',rationale:'brand'})});await tick();await tick();r=(await c.request(base)).data[0];assert.equal(r.status,'completed');assert.deepEqual(r.deliverable.slides,copy.slides);assert.equal(renders,1);assert.equal(searches,1);assert.equal(r.steps.filter(s=>s.kind==='trend_search').length,1);assert.equal(r.deliverable.files.length,3);assert.equal(calls.at(-1),'director');
 }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
test('failed search with no saved evidence returns a useful reply without inventing topics or drafts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'flow-'));let called=0;const app=createApp({dir,runner:()=>{called++;throw Error('must not run');},teamOptions:{trendSearch:async()=>{throw Error('network unavailable');}}});try{const c=await client(app.app);await c.request('/settings','PATCH',{aiConsent:true});await c.request('/teams/t/projects/p/runs','POST',{id:'failed',role:'director',text:'推薦內容',model:'Codex'});await tick();const r=(await c.request('/teams/t/projects/p/runs')).data[0];assert.equal(r.status,'completed');assert.equal(called,0);assert.equal(r.topics,undefined);assert.match(r.output,/目前這個專案還沒有/);assert.match(r.search.warnings[0],/network/);}finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
test('RSS search strips markup and rejects unsafe source URLs',()=>{const xml='<rss><item><title><![CDATA[Design &amp; culture]]></title><link>https://example.com/story</link><description><![CDATA[<b>Summary</b>]]></description></item><item><title>bad</title><link>javascript:alert(1)</link></item></rss>';const rows=parseTrendFeed(xml);assert.equal(rows.length,1);assert.equal(rows[0].title,'Design & culture');assert.equal(rows[0].summary,'Summary');});
test('cancelling parallel production cancels both model handles and prevents rendering',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'flow-cancel-'));let cancelled=0,renders=0;
 const runner=prompt=>{const role=prompt.match(/的 (\w+)。/)[1];if(role==='research')return {promise:Promise.resolve({content:'report'}),cancel(){}};if(role==='director')return {promise:Promise.resolve({content:JSON.stringify({topics:sources.map(s=>({title:s.title,angle:'angle',sourceIds:[s.id]}))})}),cancel(){}};let release;return {promise:new Promise(r=>release=r),cancel(){cancelled++;release({content:'cancelled'});}};};
 const app=createApp({dir,runner,teamOptions:{trendSearch:async()=>({sources}),renderCarousel:async()=>{renders++;return [];}}});try{const c=await client(app.app),base='/teams/t/projects/p/runs';await c.request('/settings','PATCH',{aiConsent:true});await c.request(base,'POST',{id:'cancel-parallel',role:'director',model:'Codex',text:'推薦內容'});await tick();await tick();const run=(await c.request(base)).data[0];await c.request(base+'/'+run.id+'/select','POST',{topicId:run.topics[0].id});await tick();await c.request(base+'/'+run.id+'/cancel','POST',{});await tick();await tick();assert.equal(cancelled,2);assert.equal(renders,0);assert.equal((await c.request(base)).data[0].status,'cancelled');}finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
test('encoded RSS markup becomes plain text',()=>{const rows=parseTrendFeed('<item><title>Title</title><link>https://example.com</link><description>&lt;a href=&quot;https://example.com&quot;&gt;Headline&lt;/a&gt;&amp;nbsp;Publisher</description></item>');assert.equal(rows[0].summary,'Headline Publisher');});
