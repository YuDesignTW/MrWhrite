import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {client,request} from './http-helper.mjs';
test('distribution library starts empty',()=>{
 const m=JSON.parse(readFileSync('library/manifest.json'));
 assert.deepEqual(m.articles,[]);assert.deepEqual(m.styles,[]);assert.deepEqual(m.resources,[]);
});
function fixtureLibrary(dir){
 const root=join(dir,'fixture-library');mkdirSync(root);
 const bytes=Buffer.from('Synthetic archive test file.');writeFileSync(join(root,'sample.txt'),bytes);
 const files=[{path:'sample.txt',sha256:createHash('sha256').update(bytes).digest('hex')}];
 const version={id:'v1',approved:true,caption:'Synthetic caption',files,images:Array.from({length:6},()=> 'sample.txt')};
 writeFileSync(join(root,'manifest.json'),JSON.stringify({articles:[{id:'sample',title:'Synthetic article',preferredVersion:'v1',versions:[version]}],styles:[],resources:[]}));
 return root;
}
test('local schedule saves version snapshots, isolates projects, revises and cancels without publishing',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'content-library-')),app=createApp({dir,contentLibraryOptions:{root:fixtureLibrary(dir)}});try{const c=await client(app.app),base='/teams/t/projects/p';
 assert.equal((await request(app.app,'/api/content-library')).status,401);
 const manifest=(await c.request('/content-library')).data;
 const file=manifest.articles[0].versions[0].files[0];
 assert.equal(createHash('sha256').update(readFileSync(join(dir,'fixture-library',file.path))).digest('hex'),file.sha256);
 assert.equal((await c.request('/content-library/file?path=../../data/database.sqlite')).status,404);
 assert.equal((await c.request(base+'/content')).data.articles.length,0);
 await c.request(base+'/content/import','POST',{ids:['sample']});await c.request(base+'/content/import','POST',{ids:['sample']});assert.equal((await c.request(base+'/content')).data.articles.length,1);
 assert.equal((await c.request('/teams/t/projects/other/content')).data.articles.length,0);
 const account=(await c.request(base+'/accounts','POST',{platform:'Instagram',handle:'local-only'})).data;assert.equal(account.connected,false);
 const body={accountId:account.id,articleId:'sample',versionId:'v1',scheduledAt:'2026-12-01T19:30:00+08:00'};
 const created=await c.request(base+'/schedule','POST',body);assert.equal(created.status,201);const r=created.data;assert.equal(r.scheduledAt,'2026-12-01T11:30:00.000Z');assert.equal(r.snapshot.images.length,6);assert.equal(r.status,'scheduled');
 assert.equal((await c.request(base+'/schedule','POST',body)).status,409);
 assert.equal((await c.request('/teams/t/projects/other/schedule','POST',body)).status,400);
 assert.equal((await c.request(base+'/schedule/'+r.id,'PATCH',{revision:0,status:'cancelled'})).status,409);
 const changed=(await c.request(base+'/schedule/'+r.id,'PATCH',{revision:1,scheduledAt:'2026-12-02T10:00:00+08:00'})).data;assert.deepEqual(changed.snapshot,r.snapshot);
 const done=(await c.request(base+'/schedule/'+r.id,'PATCH',{revision:2,status:'published_manual'})).data;assert.equal(done.status,'published_manual');assert.ok(done.publishedAt);assert.equal(app.store.all('publication').length,0);
 await c.request(base+'/schedule/'+r.id,'PATCH',{revision:3,status:'scheduled'});
 assert.equal((await c.request(base+'/schedule/'+r.id,'PATCH',{revision:4,status:'cancelled'})).data.status,'cancelled');
 }finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
