import React,{useEffect,useState} from 'react';
import {api} from './api';
export function TopicPlanning({onSelect}) {
 const [batches,setBatches]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>api('/social/topic-batches').then(setBatches);
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 async function generate(){setBusy(true);setError('');try{await api('/social/topic-batches/generate','POST',{});await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function decide(b,t,status){setBusy(true);setError('');try{await api(`/social/topic-batches/${b.id}/topics/${t.id}`,'PATCH',{baseRevision:t.revision,status,platforms:status==='selected'?['instagram']:[]});await load();if(status==='selected')onSelect(t);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <details className="topic-planning"><summary>今日文字選題</summary><p>從情報室已保存的素材規劃故事，選用後才進入製作。來源內容仍需查核。</p><button disabled={busy} onClick={generate}>{busy?'處理中…':'產生一批選題'}</button>{error&&<p role="alert">{error}</p>}{!batches.length&&<p>尚無選題，請先在情報室匯入含網址的素材。</p>}{batches.slice(0,5).map(b=><section key={b.id}><small>{new Date(b.createdAt).toLocaleString('zh-TW')}</small>{b.shortfallReason&&<p>{b.shortfallReason}</p>}{b.topics.map(t=><article key={t.id}><h3>{t.title}</h3><p>{t.summary}</p><p>{t.angle}</p>{t.sources.map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></p>)}<small>{({proposed:'待選題',selected:'已選用',skipped:'略過',deferred:'稍後'})[t.status]}</small><div><button disabled={busy} onClick={()=>decide(b,t,'selected')}>選用並準備 IG 製作</button><button disabled={busy} onClick={()=>decide(b,t,'deferred')}>稍後</button><button disabled={busy} onClick={()=>decide(b,t,'skipped')}>略過</button></div></article>)}</section>)}</details>;
}
