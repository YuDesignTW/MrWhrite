import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,symlinkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {client} from './http-helper.mjs';
import {initialState} from '../src/team-state.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
async function setup(runner){const dir=mkdtempSync(join(tmpdir(),'project-vault-')),app=createApp({dir,runner}),c=await client(app.app),state=initialState(),t=state.teams[0],p=t.projects[0];p.memory='已確認品牌偏好';t.skills=[{id:'ig-caption',scope:'writer'}];await c.request('/team-workspace','PUT',{revision:0,state});return {dir,app,c,state,t,p,base:`/teams/${t.id}/projects/${p.id}`,close(){app.close();rmSync(dir,{recursive:true,force:true});}};}
test('workspace materializes documents and skills, file uploads are durable and scoped',async()=>{
 const f=await setup();try{const k=(await f.c.request(f.base+'/knowledge')).data;assert.equal(readFileSync(k.documents.memory.path,'utf8'),'已確認品牌偏好');assert.match(readFileSync(join(k.root,'project.json'),'utf8'),/ig-caption/);
 const b={id:'upload-one',name:'brief.md',mime:'text/markdown',base64:Buffer.from('品牌資料正文').toString('base64')};const r=await f.c.request(f.base+'/files','POST',b);assert.equal(r.status,200);assert.equal(readFileSync(r.data.path,'utf8'),'品牌資料正文');assert.equal((await f.c.request(f.base+'/files','POST',b)).data.sha256,r.data.sha256);
 assert.equal((await f.c.request(f.base+'/files','POST',{...b,base64:Buffer.from('different').toString('base64')})).status,409);
 assert.equal((await f.c.request(`/teams/${f.t.id}/projects/other/files/upload-one/content`)).status,404);
 assert.equal((await f.c.request(f.base+'/knowledge')).data.resources.find(x=>x.id==='upload-one').content,'品牌資料正文');
 }finally{f.close();}
});
test('memory edits use content revisions, preserve history and direct disk edits survive unrelated workspace saves',async()=>{
 const f=await setup();try{let k=(await f.c.request(f.base+'/knowledge')).data;const old=k.documents.memory;const saved=await f.c.request(f.base+'/documents/memory','PUT',{content:'新版記憶',version:old.version});assert.equal(saved.status,200);assert.equal((await f.c.request(f.base+'/documents/memory','PUT',{content:'stale',version:old.version})).status,409);
 writeFileSync(old.path,'外部編輯的記憶');f.state.teams[0].name='改團隊名';await f.c.request('/team-workspace','PUT',{state:f.state,revision:1});assert.equal(readFileSync(old.path,'utf8'),'外部編輯的記憶');assert.equal((await f.c.request('/team-workspace')).data.state.teams[0].projects[0].memory,'外部編輯的記憶');
 }finally{f.close();}
});
test('tracking archives persist as physical Markdown but stay out of the knowledge library',async()=>{
 const f=await setup();try{const epoch=f.app.store.get('settings','main').epoch;f.app.store.put('teamTracking',{id:'account',teamId:f.t.id,projectId:f.p.id,dataEpoch:epoch,platform:'instagram',username:'test',status:'partial',url:'https://instagram.com/test/',posts:[{url:'https://instagram.com/p/test/',body:'真實收集文字',analysis:{summary:'影片摘要'}}]});const k=(await f.c.request(f.base+'/knowledge')).data;assert.equal(k.resources.some(x=>x.kind==='research'),false);const text=readFileSync(join(k.root,'research','account.md'),'utf8');assert.match(text,/真實收集文字/);assert.match(text,/影片摘要/);assert.ok(k.activity.path.endsWith('ACTIVITY.md'));assert.equal((await f.c.request(`/teams/${f.t.id}/projects/other/knowledge`)).data.resources.length,0);
 }finally{f.close();}
});
test('runtime consumes persisted skills, Markdown memory and local text files rather than stale client values',async()=>{
 let prompt;const f=await setup(p=>{prompt=p;return {promise:Promise.resolve({content:'已處理'}),cancel(){}};});try{const k=(await f.c.request(f.base+'/knowledge')).data;writeFileSync(k.documents.memory.path,'真正的本機記憶');await f.c.request(f.base+'/files','POST',{id:'brief',name:'brief.txt',mime:'text/plain',base64:Buffer.from('真正的本機資料').toString('base64')});await f.c.request('/settings','PATCH',{aiConsent:true});await f.c.request(f.base+'/runs','POST',{id:'consume',role:'writer',model:'Codex',text:'寫稿',memory:'過期瀏覽器值',skills:[]});await tick();const run=(await f.c.request(f.base+'/runs')).data[0];assert.equal(run.status,'completed');assert.match(prompt,/真正的本機記憶/);assert.match(prompt,/真正的本機資料/);assert.ok(!prompt.includes('過期瀏覽器值'));assert.ok(run.steps[0].skills.some(s=>s.id==='ig-caption'));assert.match((await f.c.request(f.base+'/knowledge')).data.activity.content,/寫稿/);
 }finally{f.close();}
});
test('vault refuses symlink folders and traversal IDs',async()=>{
 const f=await setup();try{const root=f.app.store.projectVault.root,epoch=f.app.store.get('settings','main').epoch;mkdirSync(join(root,epoch,'unsafe'));symlinkSync(tmpdir(),join(root,epoch,'unsafe','projects'));assert.throws(()=>f.app.store.projectVault.dir('unsafe','p'),/符號連結/);assert.throws(()=>f.app.store.projectVault.dir('..','p'),/識別碼/);
 }finally{f.close();}
});

test('selection resumes using current saved skills and disk memory while retaining the planning snapshot',async()=>{
 const f=await setup(()=>({promise:new Promise(()=>{}),cancel(){}}));try{const epoch=f.app.store.get('settings','main').epoch;const run={id:'pending-choice',teamId:f.t.id,projectId:f.p.id,dataEpoch:epoch,role:'director',text:'選題',status:'awaiting_selection',workflow:'topic-choice',createdAt:new Date().toISOString(),steps:[],output:'請選擇',context:{memory:'old',guardrails:''},skillBindings:[],topics:[{id:'topic',title:'題目',sources:[]}]};f.app.store.put('teamRun',run);await f.c.request('/settings','PATCH',{aiConsent:true});const result=await f.c.request(f.base+'/runs/'+run.id+'/select','POST',{topicId:'topic'});assert.equal(result.status,202);assert.equal(result.data.context.memory,'已確認品牌偏好');assert.equal(result.data.planningContext.memory,'old');assert.equal(result.data.skillBindings[0].id,'ig-caption');
 }finally{f.close();}
});
