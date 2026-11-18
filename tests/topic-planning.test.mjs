import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/store.mjs';
import {TopicPlanning} from '../server/topic-planning.mjs';
test('文字選題保存、決策版本與還原隔離，不建立製圖或發布工作',()=>{
 const dir=mkdtempSync(join(tmpdir(),'topics-'));const s=new Store(dir);const p=new TopicPlanning(s);
 try {
 const topic={title:'產品故事',summary:'故事概要',angle:'設計決策',sources:[{title:'來源',url:'https://example.com/story'}]};
 assert.throws(()=>p.create({topics:[topic]}));
 assert.throws(()=>p.create({topics:[{...topic,sources:[]}],shortfallReason:'材料不足'}));
 const b=p.create({topics:[topic,topic,topic]});const id=b.topics[0].id;
 assert.equal(p.list().length,1);
 assert.throws(()=>p.decide(b.id,id,{baseRevision:1,status:'selected'}));
 const selected=p.decide(b.id,id,{baseRevision:1,status:'selected',platforms:['instagram','threads'],feedback:'保留故事'});
 assert.equal(selected.revision,2);assert.equal(selected.feedback.length,1);
 assert.throws(()=>p.decide(b.id,id,{baseRevision:1,status:'skipped'}),e=>e.status===409);
 assert.equal(s.all('publication').length,0);assert.equal(s.all('agentRun').length,0);
 s.put('settings',{...s.get('settings','main'),epoch:'restored'});
 assert.throws(()=>p.decide(b.id,id,{baseRevision:2,status:'skipped'}),e=>e.status===409);
 } finally {s.db.close();rmSync(dir,{recursive:true,force:true});}
});
