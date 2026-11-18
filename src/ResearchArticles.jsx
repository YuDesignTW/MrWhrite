import React, { useEffect, useState } from 'react';
import { MagnifyingGlass, Plus, ArrowSquareOut, DownloadSimple, Trash, X, ArrowLeft } from '@phosphor-icons/react';
import { api, download } from './api';
const labels = { manual: '手動提供', extracted: '已擷取網頁文字', summary: '僅新聞摘要' };
export function ResearchArticles({ base, team }) {
  const [rows,setRows] = useState([]), [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState(''), [filter,setFilter] = useState('');
  const [url,setUrl] = useState(''), [title,setTitle] = useState(''), [content,setContent] = useState(''), [manual,setManual] = useState(false);
  const [selected, setSelected] = useState(null), [kind, setKind] = useState('all'), [adding, setAdding] = useState(false), [loading, setLoading] = useState(true);
  const [watch,setWatch]=useState(null);
  useEffect(()=>{let live=true;api(base+"/research-watch").then(c=>live&&setWatch(c)).catch(e=>live&&setError(e.message));return()=>{live=false};},[base]);
  const topic=watch?watch.keywords.join("、"):team.researchSettings?.topic;
  const endpoint = base+'/research-articles';
  useEffect(() => { let live=true; api(endpoint).then(r=>live&&setRows(r)).catch(e=>live&&setError(e.message)).finally(()=>live&&setLoading(false)); return()=>{live=false}; },[endpoint]);
  async function act(path,method,body) {
    setBusy(true); setError(''); setNotice('');
    try {
      const r=await api(endpoint+path,method,body);
      setRows(await api(endpoint));
      setNotice(path==='/search' ? `新增 ${r.added} 篇 · 已存在 ${r.duplicates} 篇${r.errors.length ? '\n'+r.errors.join('\n') : ''}` : method==='DELETE' ? '文章已移除。' : r.duplicate ? '這個網址已保存，未重複新增。' : '文章已保存。');
      if(path===''){setSelected(r.article.id);setAdding(false);if(!r.duplicate){setUrl('');setTitle('');setContent('');}}
    } catch(e){setError(e.message);} finally{setBusy(false);}
  }
  const visible=rows.filter(r=>(kind==='all'||r.status===kind)&&(r.title+' '+r.content).toLowerCase().includes(filter.toLowerCase()));
  const article=visible.find(r=>r.id===selected)||visible[0];
  const domain=url=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '來源';}};
  return <section className="research-articles" aria-label="研究文章">
    <header className="ra-heading"><div><small>RESEARCH LIBRARY</small><h2>研究文章</h2><p>收集來源，留下值得閱讀的內容。</p></div><div className="ra-actions"><button className="tw-secondary" onClick={()=>setAdding(!adding)} aria-expanded={adding}><Plus size={16}/>新增文章</button><button className="tw-primary" disabled={busy||!topic && !watch?.sourceUrls?.length} onClick={()=>act('/search','POST',{})}><MagnifyingGlass size={16}/>{busy?'收集中…':'立即搜尋'}</button></div></header>
    <div className="ra-topic"><span>研究主題</span><strong>{topic || '尚未設定關鍵字，請至來源管理設定'}</strong><small>近 7 天新聞 · 固定公開來源</small></div>
    {error&&<p className="ra-notice" role="alert">{error}</p>}{notice&&<p className="ra-notice" role="status">{notice}</p>}
    {adding&&<section className="ra-add"><header><h3>新增文章</h3><button aria-label="關閉新增文章" onClick={()=>setAdding(false)}><X size={18}/></button></header><form onSubmit={e=>{e.preventDefault();act('','POST',{url,...(manual?{title,content}:{})});}}>
      <label>文章網址<input autoFocus type="url" required maxLength={2000} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://"/></label>
      <label className="ra-checkbox"><input type="checkbox" checked={manual} onChange={e=>setManual(e.target.checked)}/>自行貼入標題與內容</label>
      {manual&&<><label>標題<input required maxLength={300} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>內容<textarea required maxLength={50000} rows={7} value={content} onChange={e=>setContent(e.target.value)}/></label></>}
      <button className="tw-primary" disabled={busy}>{manual?'保存文章':'讀取網址並保存'}</button>
    </form></section>}
    <div className="ra-toolbar"><label className="ra-filter"><MagnifyingGlass size={17}/><input aria-label="搜尋已保存文章" value={filter} onChange={e=>{setFilter(e.target.value);setSelected(null);}} placeholder="搜尋標題或內容"/></label><select aria-label="文章類型" value={kind} onChange={e=>{setKind(e.target.value);setSelected(null);}}><option value="all">全部類型</option><option value="extracted">網頁文字</option><option value="summary">新聞摘要</option><option value="manual">手動提供</option></select><small>{visible.length} 篇</small></div>
    {loading ? <p className="ra-empty" role="status">正在讀取文章庫…</p> : !visible.length ? <div className="ra-empty"><h3>{rows.length?'沒有符合的文章':'開始建立研究資料庫'}</h3><p>{rows.length?'換個關鍵字，或查看其他類型。':'按「立即搜尋」收集研究主題，或新增一個文章網址。'}</p></div> :
    <div className={'ra-reader-layout'+(selected?' ra-reading':'')}>
      <div className="ra-list" aria-label="文章清單">{visible.map(r=><button key={r.id} className={'ra-row'+(r.id===article?.id?' selected':'')} aria-pressed={r.id===article?.id} onClick={()=>setSelected(r.id)}><span className="ra-row-meta"><span>{domain(r.url)}</span><time>{new Date(r.collectedAt).toLocaleDateString('zh-TW',{month:'numeric',day:'numeric'})}</time></span><strong>{r.title}</strong><p>{r.content.slice(0,100)}</p><span className="ra-badge">{labels[r.status]}</span></button>)}</div>
      {article&&<article className="ra-reader" aria-label="文章閱讀區" key={article.id}>
        <button className="ra-mobile-back" onClick={()=>setSelected(null)}><ArrowLeft size={16}/>返回清單</button>
        <div className="ra-reader-meta"><span className="ra-badge">{labels[article.status]}</span><span>{domain(article.url)}</span></div>
        <h2>{article.title}</h2><p className="ra-date">收集於 {new Date(article.collectedAt).toLocaleString('zh-TW')}</p>
        <div className="ra-reader-tools"><a href={article.url} target="_blank" rel="noreferrer">閱讀原文<ArrowSquareOut size={15}/></a><button onClick={()=>download(article.title+'.txt',article.title+'\n'+article.url+'\n\n'+article.content)}><DownloadSimple size={16}/>下載</button><button aria-label="移除這篇文章" disabled={busy} onClick={()=>act('/'+article.id,'DELETE')}><Trash size={16}/></button></div>
        <p className="ra-disclosure">{article.status==='summary'?'這是新聞摘要，完整內容請開啟原文。':article.limitations || '內容由使用者提供，尚未查證。'}</p>
        <div className="ra-body">{article.content.split(/\n+/).filter(Boolean).map((paragraph,i)=><p key={i}>{paragraph}</p>)}</div>
      </article>}
    </div>}
  </section>;
}
