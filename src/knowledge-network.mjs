// Local TF-IDF vectors: lexical similarity, not semantic model embeddings.
const stop = new Set(['公司','我們','以及','可以','提供','關於','更多','產品','服務','最新','消息','新聞','活動','所有','文章','聯絡','英文','研究','the','and','with','from','this','that','https','www','com','copyright']);
function terms(text) {
  const words = new Intl.Segmenter('zh-TW',{granularity:'word'}).segment(text.toLowerCase());
  return [...words].filter(w=>w.isWordLike && w.segment.length>1 && !stop.has(w.segment)).map(w=>w.segment);
}
export function knowledgeNetwork(resources) {
 const nodes=resources.filter(r=>r.kind!=='research').map(r=>({id:r.id,name:r.name||'未命名資料',kind:r.kind,url:r.url,content:r.content||'',fetchedAt:r.fetchedAt}));
 const counts=nodes.map(n=>{const m=new Map();for(const t of terms(n.content.slice(0,12000)))m.set(t,(m.get(t)||0)+1);return m;});
 const df=new Map();counts.forEach(m=>m.forEach((_,t)=>df.set(t,(df.get(t)||0)+1)));
 const vectors=counts.map(m=>{const v=new Map([...m].map(([t,c])=>[t,(1+Math.log(c))*Math.log(1+nodes.length/(df.get(t)||1))]));const norm=Math.hypot(...v.values());return new Map([...v].map(([t,w])=>[t,w/(norm||1)]));});
 const candidates=[];
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const common=[...vectors[i]].filter(([t])=>vectors[j].has(t)).map(([t,w])=>({term:t,weight:w*vectors[j].get(t)})).sort((a,b)=>b.weight-a.weight);
  const score=common.reduce((n,x)=>n+x.weight,0);
  if(score>=0.12 && common.length>=2)candidates.push({id:`${i}:${j}`,from:nodes[i].id,to:nodes[j].id,score:Math.min(1,score),terms:common.slice(0,6).map(x=>x.term)});
 }
 // Each document contributes its top three connections; isolated documents stay visible.
 const keep=new Set();for(const n of nodes)candidates.filter(e=>e.from===n.id||e.to===n.id).sort((a,b)=>b.score-a.score).slice(0,3).forEach(e=>keep.add(e.id));
 const edges=candidates.filter(e=>keep.has(e.id));
 const positions=Object.fromEntries(nodes.map((n,i)=>[n.id,{x:500+Math.cos(i*2*Math.PI/Math.max(1,nodes.length))*260,y:320+Math.sin(i*2*Math.PI/Math.max(1,nodes.length))*210}]));
 if(nodes.length===1)positions[nodes[0].id]={x:500,y:320};
 return {nodes,edges,positions};
}
