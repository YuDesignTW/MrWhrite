import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { lockRuntime } from '../server/runtime-lock.mjs';
for(const engine of [false,true])for(const signal of ['SIGTERM','SIGINT'])test(`${engine?'engine':'legacy'} ${signal} persists interrupted run and steps before releasing runtime lock`,{timeout:10000},async t=>{
 const dir=mkdtempSync(join(tmpdir(),'mr-white-shutdown-'));
 const child=fork(new URL('./fixtures/shutdown-child.mjs',import.meta.url),{env:{...process.env,MR_WHITE_DATA_DIR:dir,SHUTDOWN_ENGINE:engine?'1':'0'},stdio:['ignore','ignore','pipe','ipc']});
 let stderr='';child.stderr.on('data',b=>stderr+=b);
 t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');rmSync(dir,{recursive:true,force:true});});
 await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error(stderr);})]);
 assert.ok(existsSync(join(dir,'.runtime-lock')));
 const exit=once(child,'exit');child.kill(signal);
 const [code,exitSignal]=await exit;assert.equal(code,0,stderr);assert.equal(exitSignal,null);
 assert.equal(existsSync(join(dir,'.runtime-lock')),false);
 // Read raw SQLite: Store startup recovery must not manufacture the result.
 const db=new DatabaseSync(join(dir,'database.sqlite'));
 const run=JSON.parse(db.prepare("SELECT data FROM records WHERE kind='teamRun' AND id='in-flight'").get().data);
 if(engine){const state=JSON.parse(db.prepare("SELECT data FROM run WHERE id='in-flight'").get().data);assert.equal(state.status,'interrupted');const nodes=db.prepare("SELECT data FROM node_run WHERE run_id='in-flight'").all().map(r=>JSON.parse(r.data));assert.equal(nodes.find(n=>n.nodeId==='report').status,'interrupted');}
 db.close();
 assert.equal(run.status,'interrupted');assert.equal(run.steps.length,engine?2:1);assert.equal(run.steps.at(-1).status,'interrupted');assert.ok(run.finishedAt);
 const release=lockRuntime(dir);release();
});
