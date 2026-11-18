import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchArticles } from '../server/research-articles.mjs';
function fixture(options={}) {
 const records=new Map(); const store={get:(k,id)=>records.get(k+id),put:(k,r)=>(records.set(k+r.id,r),r),all:k=>[...records.entries()].filter(([key])=>key.startsWith(k)).map(([,r])=>r)};
 store.put('settings',{id:'main',epoch:'e'});store.put('teamWorkspace',{id:'main',dataEpoch:'e',state:{teams:[{id:'t',projects:[{id:'p'},{id:'q'}],researchSettings:{topic:'核醫 放射藥物',sourceUrls:['https://example.com/']}}]}});
 return {store,svc:new ResearchArticles(store,options),s:{teamId:'t',projectId:'p'}};
}
test('manual articles normalize tracking URLs, isolate projects, delete and survive new service',async()=>{
 const {store,svc,s}=fixture(); const body={url:'https://example.com/a?utm_source=test#x',title:'標題',content:'原文'};
 const a=await svc.add(s,body);assert.equal(a.duplicate,false);assert.equal((await svc.add(s,{...body,url:'https://example.com/a'})).duplicate,true);
 assert.equal(svc.list({...s,projectId:'q'}).length,0);assert.throws(()=>svc.list({...s,projectId:'bad'}));
 assert.equal(new ResearchArticles(store).list(s)[0].content,'原文');svc.remove(s,a.article.id);assert.equal(svc.list(s).length,0);
 await assert.rejects(()=>svc.add(s,{...body,url:'javascript:alert(1)'}));
});
test('search preserves summary status, reports failed reads and deduplicates',async()=>{
 const {svc,s}=fixture({search:async()=>({query:'核醫 OR 放射藥物',sources:[{url:'https://news.google.com/a',title:'新聞',summary:'摘要'}]}),read:async()=>{throw Error('blocked')}});
 const r=await svc.collect(s);assert.equal(r.added,1);assert.equal(r.errors.length,1);assert.equal(svc.list(s)[0].status,'summary');assert.equal((await svc.collect(s)).duplicates,1);
});
test('inflight reads cannot save into a restored epoch',async()=>{
 let release; const {store,svc,s}=fixture({read:()=>new Promise(r=>release=r)});
 const pending=svc.add(s,{url:'https://example.com/a'});store.put('settings',{id:'main',epoch:'new'});release({url:'https://example.com/a',title:'a',summary:'text'});await assert.rejects(pending);assert.equal(store.all('researchArticle').length,0);
});
