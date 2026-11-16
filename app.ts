// Browser UI, bundled into ui.ts by tools/build.py. No remote scripts execute.
const pendingRequests = new Map();
let requestSequence = 0;
window.__mangeReply = (id, reply) => {
  const pending = pendingRequests.get(id);
  if (!pending) return;
  pendingRequests.delete(id); clearTimeout(pending.timer);
  if (!reply || typeof reply !== 'object') return pending.reject(Error('脚本回调格式异常'));
  if (reply.error) return pending.reject(Error(reply.error));
  if (!Object.prototype.hasOwnProperty.call(reply, 'value')) return pending.reject(Error('脚本回调缺少结果'));
  pending.resolve(reply.value);
};
const bridge = (op, extra = {}) => new Promise((resolve, reject) => {
  const id = 'mange-' + (++requestSequence);
  const fail = error => {
    const pending = pendingRequests.get(id); if (!pending) return;
    clearTimeout(pending.timer); pendingRequests.delete(id); reject(error);
  };
  const timer = setTimeout(() => fail(Error('请求超时（'+op+'），原生脚本尚未返回处理结果')), 25000);
  pendingRequests.set(id, {resolve, reject, timer});
  try {
    // Delivery acknowledgement is not the operation result. Only __mangeReply resolves this request.
    const delivery = window.webkit.messageHandlers.mange.postMessage({id, op, ...extra});
    if (delivery && typeof delivery.catch === 'function') delivery.catch(fail);
  } catch (error) { fail(error); }
});
const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const button = (text, fn) => { const e = el('button', text); e.onclick = () => run(fn); return e; };
const run = async fn => { try { await fn(); } catch(e) { $('#notice').textContent=String(e.message || e); } };
const key = b => b.source + '|' + b.url;
let state, book, current = 0, page = 0, token = 0, pages = [], loading = false, restore = null, scrollTimer;
let readerScreen = 'home';
let saves = Promise.resolve();
const save = () => { const value = JSON.parse(JSON.stringify(state)); saves = saves.catch(()=>{}).then(()=>bridge('save',{value})); saves.catch(e=>{$('#notice').textContent=String(e)}); return saves; };
const safeURL = (url, base) => { const u = new URL(url, base); if(u.protocol !== 'https:') throw Error('源中的链接必须使用 HTTPS'); return u.href; };
const source = id => { const s = state.sources.find(s=>s.id===id); if(!s) throw Error('请重新导入此漫画的源'); return s; };
const doc = async url => {
  const response=await bridge('document',{url});
  const text=typeof response==='string'?response:response?.html;
  if(typeof text!=='string')throw Error('网页在脚本通信中丢失，返回类型：'+typeof response+'，字段：'+Object.keys(response||{}).join(','));
  if(!text.trim())throw Error('收到的网页内容为空');
  const d=new DOMParser().parseFromString(text.replace(/^\uFEFF/,''),'text/html');
  d.mangeURL=typeof response==='string'?url:response.url||url;
  d.mangeSize=text.length;
  return d;
};
const pick = (e, selector) => selector === ':scope' ? e : e.querySelector(selector);
const attr = (e,s,a) => pick(e,s)?.getAttribute(a) || '';
function validate(s) {
  if(!s || typeof s.id!=='string' || !s.id || typeof s.name!=='string') throw Error('源缺少 id 或名称');
  safeURL(s.baseUrl); if(s.kind && s.kind!=='html') throw Error('仅支持 HTML 源');
  for(const [group, fields] of Object.entries({search:['url','items','title','link','cover'],detail:['chapters','title','link'],reader:['images']}))
    for(const f of fields) if(typeof s[group]?.[f]!=='string' || !s[group][f]) throw Error('源字段不完整：'+group+'.'+f);
  for(const q of [s.search.items,s.search.title,s.search.link,s.search.cover,s.detail.chapters,s.detail.title,s.detail.link,s.reader.images]) document.createDocumentFragment().querySelector(q);
  return s;
}
async function importSource() {
  const input = prompt('输入 GitHub JSON 文件链接或 Raw HTTPS 链接'); if(!input) return;
  const u = new URL(input); if(u.hostname==='github.com') { const p=u.pathname.split('/'); if(p[3]!=='blob') throw Error('请输入具体 JSON 文件链接'); u.hostname='raw.githubusercontent.com'; p.splice(3,1); u.pathname=p.join('/'); }
  const s=validate(JSON.parse(await bridge('fetch',{url:safeURL(u.href)})));
  state.sources=state.sources.filter(x=>x.id!==s.id).concat(s); state.active=s.id; await save(); home();
}
function longPress(e, action) {
  let timer, fired=false; e.addEventListener('click',ev=>{if(fired){ev.stopImmediatePropagation();ev.preventDefault();fired=false}},true); e.addEventListener('pointerdown',()=>timer=setTimeout(()=>{timer=null;fired=true;run(action)},650));
  for(const t of ['pointerup','pointercancel','pointermove']) e.addEventListener(t,()=>clearTimeout(timer));
  e.addEventListener('contextmenu',ev=>{ev.preventDefault();run(action)});
}
function home() {
  cancelReaderTap();
  clearTimeout(scrollTimer);
  token++; book=null; pages=[]; restore=null; loading=false;
  if ($('#directory').open) $('#directory').close();
  $('#reader').hidden=true; $('#pages').replaceChildren(); $('#home').hidden=false;
  setReaderScreen('home');
  $('#notice').textContent='';
  $('#content').replaceChildren(); $('#heading').textContent='书架';
  const select=$('#sources'); select.replaceChildren();
  for(const s of state.sources) { const o=el('option',s.name); o.value=s.id; o.selected=s.id===state.active; select.append(o); }
  for(const b of state.books) card(b,true);
  if(!state.books.length) $('#content').append(el('p','书架还是空的，搜索漫画后加入书架。','empty'));
  window.scrollTo(0,0);
}
function card(b,shelf) {
  const c=el('article',null,'card'), img=el('img'); img.src=b.cover; img.alt=b.title; img.loading='lazy';
  c.append(img,el('p',b.title)); const p=state.progress[key(b)]; if(p)c.append(el('small','读到第 '+(p.chapter+1)+' 章'));
  c.onclick=()=>run(()=>openBook(b,shelf));
  if(shelf)longPress(c,async()=>{if(confirm('从书架移除《'+b.title+'》及阅读记录？')){state.books=state.books.filter(x=>key(x)!==key(b)); delete state.progress[key(b)];await save();home()}});
  $('#content').append(c);
}
async function search() {
  const id=++token,s=source(state.active), q=$('#query').value.trim();
  $('#notice').textContent=''; $('#heading').textContent='搜索中…'; $('#content').replaceChildren();
  const url=safeURL(q?s.search.url.replaceAll('{query}',encodeURIComponent(q)):s.search.browseUrl||s.search.url.replaceAll('{query}',''),s.baseUrl);
  let d;
  try { d=await doc(url); } catch(e) { if(id===token){$('#heading').textContent='搜索失败';$('#notice').textContent=s.name+'：'+String(e.message||e);}return; }
  if(id!==token)return;
  const seen=new Set();
  const add=(title,link,cover)=>{
    if(!title||!link)return;
    const resolved=safeURL(link,d.mangeURL||url);
    if(seen.has(resolved))return;seen.add(resolved);
    card({source:s.id,title,url:resolved,cover:cover?safeURL(cover,d.mangeURL||url):''},false);
  };
  const matched=d.querySelectorAll(s.search.items);
  for(const e of matched) {
    add(pick(e,s.search.title)?.textContent.trim(),attr(e,s.search.link,s.search.linkAttr||'href'),attr(e,s.search.cover,s.search.coverAttr||'src'));
  }
  // Guazi exposes the same search results as structured data and semantic links.
  if(!seen.size&&s.id==='guazi'&&s.baseUrl===DEFAULT_SOURCE.baseUrl){
    const visit=node=>{
      if(!node||typeof node!=='object')return;
      if(Array.isArray(node)){node.forEach(visit);return}
      if(node['@type']==='ListItem'){
        const item=node.item||node;
        const title=item.name||node.name,link=item.url||node.url;
        if(title&&link&&new URL(link,url).pathname==='/comic.php'){
          const a=Array.from(d.querySelectorAll('a[href]')).find(a=>{try{return safeURL(a.getAttribute('href'),url)===safeURL(link,url)}catch{return false}});
          add(title,link,a?.querySelector('img')?.getAttribute('src')||'');
        }
      }
      if(node.mainEntity)visit(node.mainEntity);if(node.itemListElement)visit(node.itemListElement);if(node['@graph'])visit(node['@graph']);
    };
    for(const e of d.querySelectorAll('script[type="application/ld+json"]')){try{visit(JSON.parse(e.textContent))}catch{}}
    if(!seen.size)for(const a of d.querySelectorAll('h3 a[href],a[title][href]')){
      const link=a.getAttribute('href');if(new URL(link,url).pathname!=='/comic.php')continue;
      const parent=a.closest('article')||a.parentElement;
      add(a.textContent.trim()||a.title,link,parent.querySelector('img')?.getAttribute('src')||'');
    }
  }
  const count=seen.size;
  $('#heading').textContent=count?'搜索结果':'搜索未成功';
  if(!count){
    $('#notice').textContent='收到网页，但未提取到漫画。页面标题：'+(d.title||'（无标题）');
    const details=el('details'),summary=el('summary','查看搜索诊断');
    details.append(summary,el('p','源：'+s.name+'；匹配条目：'+matched.length+'；网页长度：'+d.mangeSize),el('p','请求：'+url),el('p','实际地址：'+d.mangeURL),el('p',(d.body?.textContent||'').replace(/\s+/g,' ').trim().slice(0,220)));
    $('#content').append(details);
  }
}
async function openBook(b,resume) {
  const id=++token,s=source(b.source); $('#heading').textContent='正在读取目录…';
  const d=await doc(b.url); if(id!==token)return;
  const chapters=Array.from(d.querySelectorAll(s.detail.chapters)).map(e=>({title:pick(e,s.detail.title)?.textContent.trim()||'章节',url:safeURL(attr(e,s.detail.link,s.detail.linkAttr||'href'),b.url)}));
  if(s.detail.reverse)chapters.reverse(); if(!chapters.length)throw Error('目录为空，网站结构可能已变更');
  book={...b,chapters}; const progress=state.progress[key(b)]; current=Math.min(progress?.chapter||0,chapters.length-1);
  if(resume)return read(current,progress?.page||0,progress?.ratio||0);
  $('#content').replaceChildren();$('#heading').textContent=b.title;
  $('#content').append(button('← 书架',home),button('加入书架',async()=>{if(!state.books.some(x=>key(x)===key(b))){state.books.push(b);await save()}alert('已加入书架')}),button('继续阅读',()=>read(current,progress?.page||0,progress?.ratio||0)));
  const list=chapterButtons(el('div',null,'chapters'), '▶ ', read);
  $('#content').append(list);
  revealChapter(list, document.scrollingElement, $('#home header'));
}
function chapterButtons(list, prefix, select) {
  list.replaceChildren(...book.chapters.map((chapter, index) => {
    const selected = index === current;
    const row = button((selected ? prefix : '') + chapter.title, () => select(index));
    if (selected) {
      row.className = 'selected';
      row.setAttribute('aria-current', 'true');
    }
    return row;
  }));
  return list;
}
function revealChapter(list, scroller, header) {
  requestAnimationFrame(() => {
    const row = list.querySelector('[aria-current]');
    if (!row?.getClientRects().length) return;
    const bounds = row.getBoundingClientRect();
    const top = header ? header.getBoundingClientRect().bottom : scroller.getBoundingClientRect().top;
    const bottom = header ? scroller.clientHeight : top + scroller.clientHeight;
    if (bounds.top >= top && bounds.bottom <= bottom) return;
    scroller.scrollTop += (bounds.top + bounds.bottom - top - bottom) / 2;
  });
}
async function chapterImages(index) {
  const s=source(book.source),url=book.chapters[index].url,d=await doc(url);
  const urls=Array.from(d.querySelectorAll(s.reader.images)).map(e=>e.getAttribute(s.reader.imageAttr||'src')).filter(Boolean).map(u=>safeURL(u,d.mangeURL));
  if(!urls.length)throw Error('没有解析到图片，请检查源或网站访问限制');
  return {urls, referer: d.mangeURL};
}
async function read(index,p=0,ratio=0) {
  if(index<0||index>=book.chapters.length)return;
  cancelReaderTap();
  clearTimeout(scrollTimer);
  const id=++token;loading=true;current=index;page=p;pages=[];restore={p,ratio};
  $('#home').hidden=true;$('#reader').hidden=false;$('#reader').dataset.mode=state.mode;
  $('#pages').replaceChildren();$('#viewport').scrollTop=0;
  $('#tail').replaceChildren(el('p','正在加载章节…'));
  setReaderScreen('reader');
  try {
    const chapter=await chapterImages(index);if(id!==token)return;
    append(chapter,index);
    if(state.mode==='paged')showPage(p,true);
    else pages.slice(0,p+1).forEach(e=>e.img.loading='eager');
    restorePosition();
    $('#tail').textContent='';
  } catch(e) {
    if(id===token)$('#tail').replaceChildren(el('p','章节加载失败：'+String(e.message||e)),button('重试',()=>read(index,p,ratio)));
  }
  finally{if(id===token)loading=false}
}
function append({urls,referer},chapter) {
  const id=token;
  urls.forEach((url,i)=>{
    const wrap=el('div',null,'page');wrap.dataset.chapter=chapter;wrap.dataset.page=i;
    const img=el('img');img.alt='第 '+(i+1)+' 页';img.loading='lazy';img.referrerPolicy='no-referrer';img.draggable=false;
    const status=el('div',null,'image-status');
    const label='第 '+(i+1)+' 页';
    const entry={chapter,page:i,wrap,img,settled:false};
    let fallback=false;
    const retry=async()=>{
      fallback=true;
      status.replaceChildren(el('p',label+'正在加载…'));
      try {
        const data=await bridge('image',{url,referer});
        if(id===token){img.loading='eager';img.src=data}
      } catch(e) {
        if(id===token)failed(String(e.message||e));
      }
    };
    const failed=message=>{
      entry.settled=true;
      status.replaceChildren(el('p',label+'加载失败：'+message),button('重试图片',retry));
      restorePosition();
    };
    img.onload=()=>{
      if(id!==token)return;
      entry.settled=true;
      delete wrap.dataset.pending;
      if(restore)restorePosition();
      else if(state.mode==='paged'&&pages[page]===entry)remember();
    };
    img.onerror=()=>{
      if(id!==token)return;
      if(fallback)failed('收到的图片无法显示');
      else void retry();
    };
    wrap.dataset.pending='';
    status.append(el('p',label+'正在加载…'));
    wrap.append(img,status);zoom(wrap,img);$('#pages').append(wrap);pages.push(entry);
    img.src=url;
  });
}
function restorePosition(){
  if(!restore)return;
  const index=Math.min(restore.p,pages.length-1), e=pages[index];
  if(!e)return;
  const ready=state.mode==='paged'?e.settled:pages.slice(0,index+1).every(p=>p.settled);
  if(!ready)return;
  const {ratio}=restore;restore=null;page=index;
  $('#viewport').scrollTop=e.wrap.offsetTop+ratio*e.wrap.clientHeight;
  if(e.img.naturalWidth)remember();
}
function showPage(p, restoring=false) {
  if(!restoring)restore=null;
  page=Math.max(0,Math.min(p,pages.length-1));
  pages.forEach((e,i)=>e.wrap.hidden=i!==page);
  pages[page].img.loading='eager';
  $('#viewport').scrollTop=0;
  if(!restoring)remember();
}
function remember() {
  if(!book||restore||!pages.length)return;
  const e=pages[page];if(!e?.img.naturalWidth)return;current=e.chapter;
  state.progress[key(book)]={chapter:e.chapter,page:e.page,ratio:Math.max(0,($('#viewport').scrollTop-e.wrap.offsetTop)/Math.max(1,e.wrap.clientHeight))};save();bars();
}
function bars(){
  $('#top').hidden=$('#bottom').hidden=readerScreen!=='reader-controls';
  $('#title').textContent=book?.chapters[current]?.title||'';
  $('#prev').disabled=current<=0;
  $('#next').disabled=!book||current>=book.chapters.length-1;
}
function setReaderScreen(screen){
  const wasHome=readerScreen==='home';
  readerScreen=screen;
  const isHome=screen==='home';
  if(wasHome!==isHome){
    void bridge('screen',{value:isHome?'home':'reader'}).catch(error=>console.error('MANGE screen:',error));
  }
  bars();
}
async function advance(delta) {
  if(loading)return;
  if(state.mode==='paged') {if(page+delta>=0&&page+delta<pages.length){showPage(page+delta);return}return read(current+delta,delta<0?0:0)}
  return read(current+delta);
}
$('#viewport').onscroll=()=>{
  clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{
    if($('#reader').hidden||restore||!pages.length)return;
    if(state.mode==='scroll'){
      const y=$('#viewport').scrollTop+50;
      const i=pages.findIndex(e=>e.wrap.offsetTop+e.wrap.clientHeight>y);
      if(i>=0)page=i;
    }
    remember();
  },200);
  if(state.mode==='scroll'&&!loading&&!restore&&pages.length&&$('#viewport').scrollTop+$('#viewport').clientHeight>$('#viewport').scrollHeight-1200)run(loadNext);
};
async function loadNext(){const ch=pages.at(-1).chapter+1;if(ch>=book.chapters.length)return;const id=token;loading=true;$('#tail').textContent='预加载下一章…';try{const chapter=await chapterImages(ch);if(id===token){append(chapter,ch);$('#tail').textContent=''}}catch(e){if(id===token)$('#tail').replaceChildren(button('下一章加载失败，点击重试',loadNext))}finally{if(id===token)loading=false}}
function directory(){
  const dlg=$('#directory'),list=$('#chapterlist');
  chapterButtons(list,'▶ 正在阅读 · ',i=>{dlg.close();return read(i)});
  dlg.showModal();
  revealChapter(list,list);
}
const doubleTapZoom = new WeakMap();
let readerTap, pendingTap;
function cancelReaderTap(){
  readerTap=null;
  if(pendingTap)clearTimeout(pendingTap.timer);
  pendingTap=null;
}
function toggleReaderBars(){
  if(readerScreen!=='home')setReaderScreen(readerScreen==='reader'?'reader-controls':'reader');
}
const viewport=$('#viewport');
viewport.onpointerdown=e=>{
  if(!e.isPrimary||e.button!==0||e.target.closest('button')){
    cancelReaderTap();
    return;
  }
  readerTap={id:e.pointerId,x:e.clientX,y:e.clientY,time:Date.now(),target:e.target};
};
viewport.onpointermove=e=>{
  if(readerTap?.id===e.pointerId&&Math.hypot(e.clientX-readerTap.x,e.clientY-readerTap.y)>10)readerTap=null;
};
viewport.onpointercancel=cancelReaderTap;
viewport.onpointerup=e=>{
  const tap=readerTap;
  readerTap=null;
  if(!tap||tap.id!==e.pointerId||Date.now()-tap.time>=350||Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>10)return;
  const zoom=doubleTapZoom.get(tap.target);
  if(!zoom){
    cancelReaderTap();
    toggleReaderBars();
  }else if(pendingTap?.target===tap.target){
    cancelReaderTap();
    zoom();
  }else{
    cancelReaderTap();
    pendingTap={target:tap.target,timer:setTimeout(()=>{
      pendingTap=null;
      toggleReaderBars();
    },300)};
  }
};
function zoom(w,img){let pts=new Map(),scale=1,x=0,y=0,start=null;
 const apply=()=>{x=Math.min(0,Math.max(w.clientWidth*(1-scale),x));y=Math.min(0,Math.max(w.clientHeight*(1-scale),y));img.style.transform=`translate(${x}px,${y}px) scale(${scale})`;w.style.touchAction=scale>1?'none':'pan-y'};
 doubleTapZoom.set(img,()=>{scale=scale>1?1:2;x=scale===1?0:-w.clientWidth/2;y=scale===1?0:-w.clientHeight/2;apply()});
 w.onpointerdown=e=>{if(e.target!==img)return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});if(scale>1||pts.size>1)w.setPointerCapture(e.pointerId);if(pts.size===1)start={x:e.clientX,y:e.clientY};};
 w.onpointermove=e=>{if(!pts.has(e.pointerId))return;const old=pts.get(e.pointerId),others=[...pts.entries()].filter(([id])=>id!==e.pointerId);
 if(others.length){const a=others[0][1],before=Math.hypot(old.x-a.x,old.y-a.y),after=Math.hypot(e.clientX-a.x,e.clientY-a.y);const next=Math.max(1,Math.min(4,scale*after/Math.max(before,1))),r=next/scale,rect=w.getBoundingClientRect(),px=(e.clientX+a.x)/2-rect.left,py=(e.clientY+a.y)/2-rect.top;x=px-(px-x)*r;y=py-(py-y)*r;scale=next;apply();e.preventDefault()}else if(scale>1){x+=e.clientX-old.x;y+=e.clientY-old.y;apply();e.preventDefault()}pts.set(e.pointerId,{x:e.clientX,y:e.clientY});};
 w.onpointerup=e=>{const multi=pts.size>1;pts.delete(e.pointerId);if(multi){start=null;return}if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;
 if(scale===1&&state.mode==='paged'&&Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)run(()=>advance(dx<0?1:-1));
 start=null;};w.onpointercancel=e=>{pts.delete(e.pointerId);start=null};
}
$('#queryform').onsubmit=e=>{e.preventDefault();run(search)};$('#import').onclick=()=>run(importSource);$('#shelf').onclick=home;
$('#sources').onchange=()=>{state.active=$('#sources').value;save()};$('#removeSource').onclick=()=>run(async()=>{if(state.sources.length<2)throw Error('最后一个源不可删除');if(confirm('删除当前源？')){state.sources=state.sources.filter(s=>s.id!==state.active);state.active=state.sources[0].id;await save();home()}});
$('#back').onclick=()=>{remember();home()};$('#prev').onclick=()=>run(()=>read(current-1));$('#next').onclick=()=>run(()=>read(current+1));$('#catalog').onclick=directory;
$('#mode').onclick=()=>run(()=>{
  remember();
  const p=pages[page], ratio=restore?.ratio??state.progress[key(book)]?.ratio??0;
  state.mode=state.mode==='scroll'?'paged':'scroll';
  void save();
  return read(p?.chapter??current,p?.page??page,ratio);
});
$('#closeDirectory').onclick=()=>$('#directory').close();
(async()=>{
  try {
    state=await bridge('load')||{sources:[DEFAULT_SOURCE],active:DEFAULT_SOURCE.id,books:[],progress:{},mode:'scroll'};
    if(!Array.isArray(state.sources)||!state.sources.length)state.sources=[DEFAULT_SOURCE];
    state.sources=state.sources.map(s=>{
      if(s.id===DEFAULT_SOURCE.id&&s.baseUrl===DEFAULT_SOURCE.baseUrl&&s.search?.link==='a[href^=/comic.php]')return DEFAULT_SOURCE;
      return s;
    });
    if(!state.sources.some(s=>s.id===state.active))state.active=state.sources[0].id;
    home();
    await window.webkit.messageHandlers.mangeStatus.postMessage({});
    void save();
  } catch(e) {
    const error=String(e.message||e);
    $('#notice').textContent='启动失败：'+error;
    await window.webkit.messageHandlers.mangeStatus.postMessage({error});
  }
})();
