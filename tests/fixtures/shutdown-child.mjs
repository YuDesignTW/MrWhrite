import { createServer } from 'node:http';
import { createApp } from '../../server/app.mjs';
import { installShutdown } from '../../server/shutdown.mjs';
import { lockRuntime } from '../../server/runtime-lock.mjs';
import { client } from '../http-helper.mjs';
process.on("message", () => {}); // Keep the child alive until the test sends an OS signal.
const dir=process.env.MR_WHITE_DATA_DIR;
const release=lockRuntime(dir);process.once('exit',release);
const runtime=createApp({dir,teamOptions:{engineEnabled:process.env.SHUTDOWN_ENGINE==='1',trendSearch:async()=>({sources:[{id:'source',url:'https://example.com',title:'source'}]})},runner:()=>{let reject;return {promise:new Promise((_,r)=>reject=r),cancel(){reject(Object.assign(Error('cancelled'),{cancelled:true}));}};}});
// Actual HTTP parser exercised in memory; avoids requiring a listening port.
const server=createServer(runtime.app);
installShutdown({server,runtime,release});
const c=await client(runtime.app);
await c.request('/settings','PATCH',{aiConsent:true});
await c.request('/teams/t/projects/p/runs','POST',{id:'in-flight',role:process.env.SHUTDOWN_ENGINE==='1'?'research':'writer',text:process.env.SHUTDOWN_ENGINE==='1'?'最新趨勢':'shutdown test',model:'Codex'});
await new Promise(r=>setImmediate(r));
process.send({ready:true});
