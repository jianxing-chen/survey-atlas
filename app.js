/* Survey Atlas · 应用逻辑（渲染 / 排序 / 筛选 / 档案抽屉 / 图表避让）
   依赖 data.js 先于本文件加载 */

/* =====================================================================
   数据区。字段说明：
   areaN/depthN/nN/rN 为排序用数值（deg²、代表波段 AB 星等、源数、光谱分辨率）
   ===================================================================== */

/* ---------------- 发布日历 ---------------- */

/* ---------------- 选型指南 ---------------- */

/* ---------------- 来源 ---------------- */

/* =====================================================================
   渲染逻辑
   ===================================================================== */
const $ = s => document.querySelector(s);
const state = {reg:'all', q:'', sortKey:null, sortAsc:true, pins:[]};

/* ---- 表格 ---- */
const COLS = [
 {k:'name',  label:'巡天 / 最新版本'},
 {k:'reg',   label:'类型'},
 {k:'facility',label:'设施（口径）'},
 {k:'dr',    label:'最新发布'},
 {k:'area',  label:'天区面积', n:'areaN'},
 {k:'bands', label:'波段 / 滤光片'},
 {k:'depth', label:'深度（极限星等 / 灵敏度）', n:'depthN'},
 {k:'spec',  label:'光谱分辨率 R / 波长范围', n:'rN'},
 {k:'nsrc',  label:'源数 / 光谱数', n:'nN'},
 {k:'status',label:'状态'},
 {k:'links', label:'数据入口'},
];
const statusMap = {done:['已完成','st-done'], run:['进行中','st-run'], next:['即将/巡天前','st-next']};

/* ---- 导航尺排序：波段按真实频谱排列（波长长→短），方法类单独一行 ---- */
const SPECTRUM_ORDER = ['radio','ir','img','uv','xray'];
const CROSSCUT_ORDER = ['xspec','gspec','time','astro'];
const SPECTRUM_EN = {radio:'RADIO', ir:'INFRARED', img:'OPTICAL', uv:'ULTRAVIOLET', xray:'X-RAY'};
/* 夜空底上使用的亮度变体（纸上仍用 REG 的深色） */
const LUM = {img:'#6FA8E8', ir:'#E8964E', uv:'#AC92F2', xspec:'#4FC99A', gspec:'#EF6D9D',
             radio:'#E86A70', xray:'#8FA9CB', time:'#E5BC55', astro:'#54C8DE'};

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

function buildHead(){
  $('#theadRow').innerHTML = COLS.map(c=>{
    const arr = state.sortKey===c.k ? `<span class="arr">${state.sortAsc?'▲':'▼'}</span>` : '';
    return `<th data-k="${c.k}" ${c.n?`data-n="${c.n}"`:''}>${c.label}${arr}</th>`;
  }).join('');
  document.querySelectorAll('#theadRow th').forEach(th=>{
    if(th.dataset.k==='links'){th.classList.add('nosort');return}
    th.addEventListener('click',()=>{
      const k = th.dataset.k;
      if(state.sortKey===k){state.sortAsc=!state.sortAsc}else{state.sortKey=k;state.sortAsc=true}
      buildHead(); renderRows(); syncURL();
    });
  });
}

function rowHTML(s){
  const reg = s.reg.map(r=>`<span class="tag" style="color:${REG[r].hex}"><i style="background:${REG[r].hex}"></i>${REG[r].label}</span>`).join('');
  const st = statusMap[s.status];
  const first = s.links[0];
  return `<tr data-id="${s.id}">
    <td><button class="pinbtn${state.pins.includes(s.id)?' on':''}" data-pin="${s.id}" aria-label="钉选 ${esc(s.name)} 参与对比" title="钉选对比">${state.pins.includes(s.id)?'◉':'○'}</button><span class="sname">${esc(s.name)}</span><span class="sdr">${esc(s.dr)}</span></td>
    <td>${reg}</td>
    <td class="dimtxt">${esc(s.facility)}</td>
    <td class="mono">${esc(s.drDate)}</td>
    <td class="mono">${esc(s.area)}</td>
    <td class="mono">${esc(s.bands)}</td>
    <td class="mono">${esc(s.depth)}</td>
    <td class="mono">${s.spec?esc(s.spec):'<span class="na">—</span>'}</td>
    <td class="mono">${esc(s.nsrc)}</td>
    <td><span class="tag ${st[1]}">${st[0]}</span></td>
    <td><a href="${first[1]}" target="_blank" rel="noopener">数据 ↗</a></td>
  </tr>`;
}

/* ---- 文本列排序器（数值列用 COLS 的 n 键） ---- */
const REG_ORDER = [...SPECTRUM_ORDER, ...CROSSCUT_ORDER];
const ST_ORD = {next:0, run:1, done:2};
const yearOf = s => { const m = String(s.dr+' '+s.drDate).match(/(19|20)\d{2}/); return m ? +m[0] : 0 };
const TEXT_SORT = {
  name:(a,b)=>a.name.localeCompare(b.name,'zh'),
  reg:(a,b)=>REG_ORDER.indexOf(a.reg[0])-REG_ORDER.indexOf(b.reg[0]) || a.name.localeCompare(b.name,'zh'),
  facility:(a,b)=>a.facility.localeCompare(b.facility,'zh') || a.name.localeCompare(b.name,'zh'),
  dr:(a,b)=>{const av=yearOf(a),bv=yearOf(b); if(!av&&!bv)return 0; if(!av)return 1; if(!bv)return -1; return av-bv || a.name.localeCompare(b.name,'zh')},
  bands:(a,b)=>a.bands.localeCompare(b.bands,'zh') || a.name.localeCompare(b.name,'zh'),
  status:(a,b)=>ST_ORD[a.status]-ST_ORD[b.status],
};

function filtered(){
  let list = SURVEYS.slice();
  if(state.reg!=='all') list = list.filter(s=>s.reg.includes(state.reg));
  if(state.q){
    const q = state.q.toLowerCase();
    list = list.filter(s=>[s.name,s.en,s.facility,s.bands,s.dr,s.sci,s.note].join(' ').toLowerCase().includes(q));
  }
  const col = COLS.find(c=>c.k===state.sortKey);
  if(col && col.n){
    const key = col.n;
    list.sort((a,b)=>{ // 无值(0/null)的行恒排末尾
      const av=a[key]||0, bv=b[key]||0;
      if(av===0&&bv===0)return 0;
      if(av===0)return 1; if(bv===0)return -1;
      const d=av-bv;
      return state.sortAsc?d:-d;
    });
  }else if(col && TEXT_SORT[col.k]){
    const cmp=TEXT_SORT[col.k];
    list.sort((a,b)=>{const d=cmp(a,b); return state.sortAsc?d:-d});
  }
  return list;
}

function renderRows(){
  const list = filtered();
  $('#tbody').innerHTML = list.map(rowHTML).join('');
  $('#countRow').textContent = `显示 ${list.length} / ${SURVEYS.length} 个巡天 · 点击行查看档案（← → 切换，Esc 关闭）· ○ 钉选至多 4 项并排对比`;
}

/* ---- 类型筛选 chips ---- */
function buildChips(){
  const counts = {};
  SURVEYS.forEach(s=>s.reg.forEach(r=>counts[r]=(counts[r]||0)+1));
  const bar = $('#filterbar');
  const mk = (key,label,color,count)=>{
    const b=document.createElement('button');
    b.className='chip'+(state.reg===key?' on':'');
    b.innerHTML=(color?`<span class="dot" style="background:${color}"></span>`:'')+label+(count?` <span class="cnt">${count}</span>`:'');
    b.onclick=()=>{state.reg=key;buildChips();renderRows();syncIndex();skySync();syncURL()};
    bar.insertBefore(b,$('.searchbox'));
  };
  bar.querySelectorAll('.chip').forEach(e=>e.remove());
  mk('all','全部',null,SURVEYS.length);
  [...SPECTRUM_ORDER,...CROSSCUT_ORDER].forEach(k=>mk(k,REG[k].label,REG[k].hex,counts[k]||0));
  $('#q').addEventListener('input',e=>{state.q=e.target.value.trim();renderRows();syncURL()});
}

/* ---- 档案卡 ---- */

/* ---- 档案抽屉（点击行打开：数据产品/规模/节奏/获取方式） ---- */
let dwCur=null, dwFocusBack=null;
function drawerHTML(s){
  const st=statusMap[s.status];
  const tags=s.reg.map(r=>`<span class="tag" style="color:${REG[r].hex}"><i style="background:${REG[r].hex}"></i>${REG[r].label}</span>`).join('')
    +`<span class="tag ${st[1]}">${st[0]}</span>`;
  const list=filtered(), i=list.findIndex(x=>x.id===s.id);
  const kv=[
    ['最新版本',`${esc(s.dr)}（${esc(s.drDate)}）`],
    ['设施',esc(s.facility)],
    ['天区',esc(s.area)],
    ['波段/滤光片',`<span class="mono">${esc(s.bands)}</span>`],
    ['深度',`<span class="mono">${esc(s.depth)}</span>`],
    ['分辨率/口径',esc(s.resAng)],
    ['源数/规模',`<span class="mono">${esc(s.nsrc)}</span>`],
    ...(s.spec?[['光谱 R',`<span class="mono">${esc(s.spec)}</span>`]]:[]),
  ].map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('');
  const sec=(t,en,b)=>b?`<div class="dw-sec"><h5>${t}<span>${en}</span></h5>${b}</div>`:'';
  const d=s.d||{};
  const links=s.links.map(l=>`<a href="${l[1]}" target="_blank" rel="noopener">${esc(l[0])} ↗</a>`).join('')
    +(s.paper?`<a class="paper" href="${s.paper[1]}" target="_blank" rel="noopener">📄 ${esc(s.paper[0])}</a>`:'');
  return `
    <div class="dw-top">
      <div class="dw-nav">
        <button id="dwPrev" ${i<=0?'disabled':''} aria-label="上一个（←）">‹</button>
        <span>${i+1} / ${list.length}</span>
        <button id="dwNext" ${i>=list.length-1?'disabled':''} aria-label="下一个（→）">›</button>
      </div>
      <button class="dw-close" id="dwClose">✕ 关闭（Esc）</button>
    </div>
    <div class="dw-plateid">Archive Plate · ${esc(s.id.toUpperCase())}</div>
    <div class="dw-head">
      <h2 id="dwName">${esc(s.name)}</h2>
      <p class="dw-en">${esc(s.en)}</p>
      <div class="dw-tags">${tags}<span class="stamp ${st[1]}">${st[0]}</span></div>
    </div>
    <dl class="kv">${kv}</dl>
    ${sec('巡天计划','PROGRAMME', d.s?`<p>${esc(d.s)}</p>`:'')}
    ${sec('发布了什么数据','RELEASED', d.p?`<p>${esc(d.p)}</p>`:'')}
    ${sec('数据形态与规模','FORMAT & SCALE', d.v?`<p>${esc(d.v)}</p>`:'')}
    ${sec('观测节奏','CADENCE', d.c?`<p>${esc(d.c)}</p>`:'')}
    ${sec('怎么获取','ACCESS', d.a?`<p>${esc(d.a)}</p>`:'')}
    ${sec('观测了什么 · 适合做什么','SCIENCE FIT', `<p>${esc(s.sci)}</p>`)}
    ${s.note?`<div class="dw-note">${esc(s.note)}</div>`:''}
    <div class="dw-links">${links}</div>`;
}
function openDrawer(id){
  const s=SURVEYS.find(x=>x.id===id); if(!s)return;
  if(!dwCur)dwFocusBack=document.activeElement;
  dwCur=id;
  $('#drawer').innerHTML=drawerHTML(s);
  $('#drawer').classList.add('open'); $('#overlay').classList.add('open');
  document.body.style.overflow='hidden';
  $('#dwClose').focus();
  const step=dir=>{const list=filtered();const i=list.findIndex(x=>x.id===dwCur);
    const nx=list[i+dir]; if(nx)openDrawer(nx.id);};
  $('#dwPrev').onclick=()=>step(-1); $('#dwNext').onclick=()=>step(1);
  $('#dwClose').onclick=closeDrawer;
  try{history.replaceState(null,'','#d-'+id)}catch(e){}
}
function closeDrawer(){
  dwCur=null;
  $('#drawer').classList.remove('open'); $('#overlay').classList.remove('open');
  document.body.style.overflow='';
  if(dwFocusBack&&dwFocusBack.focus)dwFocusBack.focus(); dwFocusBack=null;
  try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
}
function initDrawer(){
  $('#tbody').addEventListener('click',e=>{
    if(e.target.closest('a'))return;
    const pin=e.target.closest('.pinbtn');
    if(pin){togglePin(pin.dataset.pin);return}
    const tr=e.target.closest('tr[data-id]'); if(tr)openDrawer(tr.dataset.id);
  });
  $('#overlay').onclick=closeDrawer;
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&dwCur){closeDrawer();return}
    if(dwCur&&e.key==='ArrowLeft'){$('#dwPrev')?.click();return}
    if(dwCur&&e.key==='ArrowRight'){$('#dwNext')?.click();return}
    if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){e.preventDefault();$('#q').focus()}
  });
  const tryHash=()=>{const m=location.hash.match(/^#d-([a-z0-9_]+)$/i);
    if(m&&SURVEYS.some(x=>x.id===m[1]))openDrawer(m[1]);};
  tryHash();
  window.addEventListener('hashchange',tryHash);
}

/* ---- 日历：双轨（已发布 / 未来 18 个月） ---- */
function buildTimeline(){
  const past=TIMELINE.filter(t=>t.kind!=='future'), fut=TIMELINE.filter(t=>t.kind==='future');
  const row=t=>`<div class="tl-row"><span class="d">${esc(t.d)}</span><i style="background:${LUMVAR[t.c]||'#8FA9CB'}"></i>
    <div class="tx"><b>${esc(t.t)}</b><span>${esc(t.n)}</span></div></div>`;
  const rowsPerCol=Math.ceil(past.length/2);
  $('#tlGrid').innerHTML=`
    <div class="tl-past">
      <div class="tl-cap">已发布 <b>${past.length}</b><span>2024 → 现在</span></div>
      <div class="tl-rows cols2" style="grid-template-rows:repeat(${rowsPerCol},auto)">${past.map(row).join('')}</div>
    </div>
    <aside class="tl-next">
      <div class="tl-cap fu">未来 18 个月 <b>${fut.length}</b></div>
      <div class="tl-rows">${fut.map(row).join('')}</div>
    </aside>`;
}

/* ---- 选型指南 ---- */
function buildGuide(){
  $('#guideGrid').innerHTML = GUIDE.map(g=>
    `<div class="gcard"><h4><span class="gi">${g.icon}</span>${esc(g.t)}</h4><p>${esc(g.p)}</p>
      <div class="picks">${g.picks.map(p=>`<b>${esc(p)}</b>`).join('')}</div></div>`).join('');
}

/* ---- 来源 ---- */
function buildSources(){
  $('#srcList').innerHTML = SOURCES.map(s=>`<li><a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])}</a></li>`).join('');
}

/* ---- 天图（Mollweide 近似足迹，数据来自 footprints.js） ---- */
function buildSky(){
  const grat=SKY_GRAT.map(p=>p?`<path class="sk-g" d="${p}"/>`:'').join('');
  const mw=SKY_MILKY.map(p=>`<path class="sk-mw" d="${p}"/>`).join('');
  const byId=Object.fromEntries(SURVEYS.map(s=>[s.id,s]));
  const fps=[];
  for(const [id,o] of Object.entries(SKY_FP)){
    const s=byId[id]; if(!s) continue;
    const c=REG[s.reg[0]].hex;
    for(const p of o.paths) fps.push(`<path class="sk-fp ${o.style}" fill="${c}" d="${p}" data-id="${id}"><title>${esc(s.name)}</title></path>`);
    for(const d of o.dots) fps.push(`<path class="sk-dot" fill="${c}" d="M${d[0]} ${d[1]-4.5} L${d[0]+4.5} ${d[1]} L${d[0]} ${d[1]+4.5} L${d[0]-4.5} ${d[1]} Z" data-id="${id}"><title>${esc(s.name)}</title></path>`);
  }
  $('#skyMap').innerHTML=`
  <svg viewBox="0 0 720 360" role="img" aria-label="巡天足迹天图（近似示意）">
    <defs><clipPath id="skyClip"><ellipse cx="${SKY_ELLIPSE.cx}" cy="${SKY_ELLIPSE.cy}" rx="${SKY_ELLIPSE.rx}" ry="${SKY_ELLIPSE.ry}"/></clipPath></defs>
    <ellipse class="sk-mw-bg" cx="${SKY_ELLIPSE.cx}" cy="${SKY_ELLIPSE.cy}" rx="${SKY_ELLIPSE.rx}" ry="${SKY_ELLIPSE.ry}"/>
    <g clip-path="url(#skyClip)">${mw}${grat}</g>
    <ellipse class="sk-bound" cx="${SKY_ELLIPSE.cx}" cy="${SKY_ELLIPSE.cy}" rx="${SKY_ELLIPSE.rx}" ry="${SKY_ELLIPSE.ry}"/>
    <g clip-path="url(#skyClip)" id="skyFPs">${fps.join('')}</g>
  </svg>`;
  /* 全天巡天 chip 行 */
  $('#skyFull').innerHTML=SKY_FULL.map(id=>{const s=byId[id];return s?`<button class="sfchip" data-id="${id}">${esc(s.name)}</button>`:''}).join('');
  $('#skyFull').querySelectorAll('.sfchip').forEach(b=>b.onclick=()=>openDrawer(b.dataset.id));
  /* tooltip + 点击开档案 */
  const tip=$('#skyTip'), box=$('.skybox');
  const show=(id,ev)=>{
    const s=byId[id]; if(!s)return;
    tip.innerHTML=`<b>${esc(s.name)}</b><span>${esc(s.area||'全天')}</span><i>点击查看档案 ↗</i>`;
    tip.hidden=false;
    const r=box.getBoundingClientRect();
    tip.style.left=Math.min(r.width-160,Math.max(4,ev.clientX-r.left+14))+'px';
    tip.style.top=(ev.clientY-r.top-44)+'px';
  };
  $('#skyFPs').addEventListener('mousemove',e=>{
    const t=e.target.closest('[data-id]'); t?show(t.dataset.id,e):tip.hidden=true;
  });
  $('#skyFPs').addEventListener('mouseleave',()=>tip.hidden=true);
  $('#skyFPs').addEventListener('click',e=>{
    const t=e.target.closest('[data-id]'); if(t)openDrawer(t.dataset.id);
  });
  skySync();
}
function skySync(){
  if(!document.getElementById('skyFPs'))return;
  document.querySelectorAll('#skyFPs [data-id]').forEach(p=>{
    const s=SURVEYS.find(x=>x.id===p.dataset.id);
    p.classList.toggle('dim', state.reg!=='all'&&!s.reg.includes(state.reg));
  });
}

/* ---- 巡天年表（1995→2033 甘特） ---- */
function buildGantt(){
  const Y0=1995,Y1=2033,NOW=2026.79;
  const rows=SURVEYS.slice().sort((a,b)=>a.t0-b.t0||a.name.localeCompare(b.name,'zh'));
  const RH=15.5,H=rows.length*RH+46,W=880,ML=104,MR=14;
  const X=y=>ML+(Math.max(Y0,Math.min(Y1,y))-Y0)/(Y1-Y0)*(W-ML-MR);
  let ticks='';
  for(let y=Y0;y<=Y1;y+=5) ticks+=`<line class="gt-ax" x1="${X(y)}" y1="20" x2="${X(y)}" y2="${H-22}"/>
    <text class="gt-yl" x="${X(y)}" y="${H-8}" text-anchor="middle">${y}</text>`;
  const bars=rows.map((s,i)=>{
    const c=REG[s.reg[0]].hex, cy=26+i*RH+7, st=s.status;
    const t0=s.t0, end=s.t1??(st==='run'?NOW:(s.tp??NOW)), planned=s.tp;
    let bar='';
    const solidEnd=st==='run'?Math.min(NOW,end):end;
    if(st==='done') bar=`<rect x="${X(t0)}" y="${cy-3.4}" width="${Math.max(1.5,X(solidEnd)-X(t0))}" height="6.8" rx="3" fill="${c}" opacity=".38"/>`;
    if(st==='run') bar=`<rect x="${X(t0)}" y="${cy-3.4}" width="${Math.max(1.5,X(solidEnd)-X(t0))}" height="6.8" rx="3" fill="${c}" opacity=".85"/>`;
    if(st==='next') bar=`<rect x="${X(t0)}" y="${cy-3.4}" width="${Math.max(1.5,X(planned??t0+2)-X(t0))}" height="6.8" rx="3" fill="none" stroke="${c}" stroke-width="1.2" stroke-dasharray="3 2.5" opacity=".8"/>`;
    if(st==='run'&&planned) bar+=`<rect x="${X(NOW)}" y="${cy-3.4}" width="${Math.max(0,X(planned)-X(NOW))}" height="6.8" rx="3" fill="none" stroke="${c}" stroke-width="1.2" stroke-dasharray="3 2.5" opacity=".55"/>`;
    const dy=yearOf(s);
    const dr=(dy>=t0-1&&dy<=Y1)?`<path class="gt-dr" d="M${X(dy)} ${cy-4.5} L${X(dy)+3.6} ${cy} L${X(dy)} ${cy+4.5} L${X(dy)-3.6} ${cy} Z"/>`:'';
    return `<g class="gt-row" data-id="${s.id}">
      <rect class="gt-hit" x="0" y="${26+i*RH}" width="${W}" height="${RH}"/>
      <text class="gt-lb" x="${ML-9}" y="${cy+3.2}" text-anchor="end">${esc(s.name.length>11?s.name.slice(0,10)+'…':s.name)}</text>
      ${bar}${dr}</g>`;
  }).join('');
  $('#ganttWrap').innerHTML=`
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="巡天年表 1995–2033">
    ${ticks}
    <line class="gt-now" x1="${X(NOW)}" y1="18" x2="${X(NOW)}" y2="${H-22}"/>
    <text class="gt-nowlb" x="${X(NOW)}" y="12" text-anchor="middle">今天 · 2026-10</text>
    ${bars}
  </svg>
  <p class="gt-note">色 = 波段类型（与频谱尺一致）；实线 = 已观测，虚线 = 规划；◆ = 主要数据发布（年份取自「最新发布」）。</p>`;
  $('#ganttWrap').addEventListener('click',e=>{
    const g=e.target.closest('.gt-row'); if(g)openDrawer(g.dataset.id);
  });
}

/* ---- 获取手册 / 名词表 / 更新日志 ---- */
function buildAccess(){
  $('#accGrid').innerHTML=ARCHIVES.map(a=>`
    <div class="acard">
      <h4>${esc(a.name)}</h4>
      ${a.hosts.length?`<div class="ac-hosts">${a.hosts.map(h=>`<button data-id="${h}">${esc((SURVEYS.find(x=>x.id===h)||{}).name||h)}</button>`).join('')}</div>`:''}
      <p>${esc(a.how)}</p>
      <dl class="ac-kv">
        <dt>批量</dt><dd>${esc(a.batch)}</dd>
        <dt>注册</dt><dd>${esc(a.auth)}</dd>
      </dl>
      <div class="ac-links">${a.links.map(l=>`<a href="${l[1]}" target="_blank" rel="noopener">${esc(l[0])} ↗</a>`).join('')}</div>
    </div>`).join('');
  $('#accGrid').querySelectorAll('.ac-hosts button').forEach(b=>b.onclick=()=>openDrawer(b.dataset.id));
}
function buildGlossary(){
  $('#glossList').innerHTML=GLOSSARY.map(g=>`
    <div class="gl-item"><dt>${esc(g[0])}<i>${esc(g[1])}</i></dt><dd>${esc(g[2])}</dd></div>`).join('');
}
function buildChangelog(){
  $('#chgList').innerHTML=CHANGES.map(c=>`
    <div class="chg"><b>${esc(c.d)}</b><ul>${c.items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div>`).join('');
}

/* ---- 对比模式（钉选 ≤4 项并排对照） ---- */
function togglePin(id){
  const i=state.pins.indexOf(id);
  if(i>=0) state.pins.splice(i,1);
  else { if(state.pins.length>=4) state.pins.shift(); state.pins.push(id); }
  renderRows(); renderCmpBar(); syncURL();
}
function renderCmpBar(){
  const bar=$('#cmpBar');
  if(!state.pins.length){bar.hidden=true;return}
  bar.hidden=false;
  const chips=state.pins.map(id=>{const s=SURVEYS.find(x=>x.id===id);
    return `<button class="cb-chip" data-rm="${id}">${esc(s.name)}<b>×</b></button>`}).join('');
  bar.innerHTML=`<span class="cb-lab">钉选 ${state.pins.length}/4</span>${chips}
    <button class="cb-go" id="cmpGo">并排对比 →</button>
    <button class="cb-clr" id="cmpClr">清空</button>`;
  bar.querySelectorAll('.cb-chip').forEach(b=>b.onclick=()=>togglePin(b.dataset.rm));
  $('#cmpGo').onclick=openCompare;
  $('#cmpClr').onclick=()=>{state.pins=[];renderRows();renderCmpBar();syncURL()};
}
function openCompare(){
  const list=state.pins.map(id=>SURVEYS.find(x=>x.id===id));
  const F=[
    ['类型',s=>s.reg.map(r=>REG[r].label).join(' / ')],
    ['设施',s=>s.facility],['最新发布',s=>`${s.dr}（${s.drDate}）`],
    ['天区',s=>s.area],['波段',s=>s.bands],['深度',s=>s.depth],
    ['光谱 R',s=>s.spec||'—'],['源数/规模',s=>s.nsrc],
    ['状态',s=>statusMap[s.status][0]],
    ['巡天计划',s=>(s.d.s||'').slice(0,150)+'…'],
    ['怎么获取',s=>s.d.a||'—'],
  ];
  const head=`<tr><th></th>${list.map(s=>`<th>${esc(s.name)}</th>`).join('')}</tr>`;
  const body=F.map(([k,f])=>`<tr><th>${k}</th>${list.map(s=>`<td>${esc(f(s))}</td>`).join('')}</tr>`).join('');
  if(!dwCur)dwFocusBack=document.activeElement;
  dwCur='__cmp__';
  $('#drawer').innerHTML=`
    <div class="dw-top">
      <div class="dw-nav"><span>对比 ${list.length} 项</span></div>
      <button class="dw-close" id="dwClose">✕ 关闭（Esc）</button>
    </div>
    <div class="cmp-tbl-box"><table class="cmp-tbl">${head}${body}</table></div>`;
  $('#drawer').classList.add('open'); $('#overlay').classList.add('open');
  document.body.style.overflow='hidden';
  $('#dwClose').onclick=closeDrawer; $('#dwClose').focus();
}

/* ---- URL 状态持久化 ---- */
function syncURL(){
  try{
    const u=new URL(location.href);
    u.searchParams.delete('q');u.searchParams.delete('reg');u.searchParams.delete('sort');u.searchParams.delete('asc');u.searchParams.delete('pin');
    if(state.q)u.searchParams.set('q',state.q);
    if(state.reg&&state.reg!=='all')u.searchParams.set('reg',state.reg);
    if(state.sortKey)u.searchParams.set('sort',state.sortKey);
    if(state.sortKey&&!state.sortAsc)u.searchParams.set('asc','0');
    if(state.pins.length)u.searchParams.set('pin',state.pins.join(','));
    history.replaceState(null,'',u);
  }catch(e){}
}
function applyURL(){
  try{
    const p=new URL(location.href).searchParams;
    const q=p.get('q'); if(q){state.q=q;$('#q').value=q}
    const reg=p.get('reg'); if(reg&&REG[reg])state.reg=reg;
    const so=p.get('sort'); if(so&&COLS.some(c=>c.k===so)){state.sortKey=so;state.sortAsc=p.get('asc')!=='0'}
    const pin=p.get('pin');
    if(pin)state.pins=pin.split(',').filter(id=>SURVEYS.some(s=>s.id===id)).slice(0,4);
  }catch(e){}
}


/* ---- 图表（纯 SVG）---- */
function chartImaging(){
  const data = [
    {n:'2MASS', a:41253, d:16.9, c:REG.ir.hex, band:'J(Vega→等效)'},
    {n:'WISE', a:41253, d:17.7, c:REG.ir.hex, band:'W1'},
    {n:'GALEX', a:41253, d:20.8, c:REG.uv.hex, band:'NUV', lo:[8,15]},
    {n:'SPHEREx', a:41253, d:19.5, c:REG.ir.hex, band:'NIR/通道'},
    {n:'Gaia', a:41253, d:20.7, c:REG.astro.hex, band:'G'},
    {n:'SkyMapper', a:20900, d:21.2, c:REG.img.hex, band:'堆叠'},
    {n:'VHS', a:17000, d:21.1, c:REG.ir.hex, band:'J'},
    {n:'PS1', a:30850, d:23.2, c:REG.img.hex, band:'r'},
    {n:'SDSS', a:14555, d:23.1, c:REG.img.hex, band:'r'},
    {n:'Legacy', a:30000, d:23.9, c:REG.img.hex, band:'r (DR10)'},
    {n:'ZTF', a:30000, d:20.5, c:REG.time.hex, band:'单次 r'},
    {n:'DES', a:5000, d:24.6, c:REG.img.hex, band:'r 10σ'},
    {n:'KiDS', a:1347, d:24.9, c:REG.img.hex, band:'r'},
    {n:'Euclid', a:14000, d:24.5, c:REG.img.hex, band:'IE 宽场'},
    {n:'HSC', a:2200, d:26.6, c:REG.img.hex, band:'r Wide', lo:[-8,-6], anchor:'end'},
    {n:'Rubin', a:18000, d:27.5, c:REG.time.hex, band:'10yr 堆叠 r'},
    {n:'Roman', a:2400, d:27.0, c:REG.ir.hex, band:'HLWAS'},
    {n:'DEVILS', a:4.5, d:27.2, c:REG.ir.hex, band:'Y 叠VIDEO', lo:[8,15]},
    {n:'COSMOS-Web', a:0.54, d:27.8, c:REG.ir.hex, band:'F277W', lo:[8,10]},
    {n:'UltraVISTA', a:1.8, d:25.3, c:REG.ir.hex, band:'Ks 超深'},
    {n:'DELVE', a:21000, d:24.0, c:REG.img.hex, band:'r', lo:[8,15]},
    {n:'VIKING', a:1500, d:21.2, c:REG.ir.hex, band:'Ks', lo:[-8,-6], anchor:'end'},
    {n:'VVV', a:1700, d:18.0, c:REG.ir.hex, band:'Ks 单历元'},
    {n:'UKIDSS LAS', a:4000, d:20.0, c:REG.ir.hex, band:'K (AB)'},
    {n:'S-PLUS', a:3000, d:21.0, c:REG.img.hex, band:'r', lo:[9,17]},
    {n:'J-PLUS', a:3192, d:21.3, c:REG.img.hex, band:'r', lo:[7,-5]},
    {n:'J-PAS EDR', a:12, d:21.5, c:REG.img.hex, band:'中带', lo:[8,15]},
  ];
  return scatterSVG({
    title:'成像/测光：天区面积 × 深度',
    sub:'纵轴为代表波段 5σ（DES 为 10σ、Rubin 为十年堆叠）极限星等；虚线右下=广而浅，左上=窄而深。',
    data, xKey:'a', yKey:'d', xLog:true,
    xLabel:'天区面积 deg²（log）', yLabel:'极限星等 (mag)',
    fmtX:v=>v>=1000?Math.round(v/1000)+'k':v,
    fmtY:v=>v.toFixed(1),
  });
}
function chartSpec(){
  const data = [
    {n:'DESI DR1', a:14000, d:7.27, c:REG.xspec.hex},
    {n:'LAMOST DR13', a:10000, d:7.49, c:REG.gspec.hex},
    {n:'SDSS-V DR20', a:30000, d:6.7, c:REG.xspec.hex, lo:[-8,-5], anchor:'end'},
    {n:'eBOSS', a:10000, d:6.6, c:REG.xspec.hex},
    {n:'GALAH DR4', a:20000, d:5.96, c:REG.gspec.hex},
    {n:'APOGEE-2', a:30000, d:5.82, c:REG.gspec.hex},
    {n:'RAVE DR6', a:20000, d:5.72, c:REG.gspec.hex, lo:[8,15]},
    {n:'Gaia-ESO', a:10000, d:5.06, c:REG.gspec.hex},
    {n:'GAMA DR4', a:286, d:5.48, c:REG.xspec.hex},
    {n:'HETDEX PDR1', a:440, d:5.34, c:REG.xspec.hex},
    {n:'6dFGRS', a:17000, d:5.4, c:REG.xspec.hex},
    {n:'DEVILS DR1', a:4.5, d:3.9, c:REG.xspec.hex, lo:[8,15]},
    {n:'VIPERS', a:24, d:4.94, c:REG.xspec.hex},
    {n:'PFS（目标）', a:2000, d:6.6, c:REG.xspec.hex, hollow:true},
    {n:'4MOST（计划）', a:20000, d:7.4, c:REG.xspec.hex, hollow:true},
    {n:'WEAVE（计划）', a:10000, d:7.2, c:REG.xspec.hex, hollow:true},
  ];
  return scatterSVG({
    title:'光谱巡天：天区面积 × 光谱数量',
    sub:'纵轴为 log₁₀(光谱/源数)；空心圈为规划值（4MOST/WEAVE）。Gaia（18 亿源测光）未画入以免压缩坐标。',
    data, xKey:'a', yKey:'d', xLog:true, yIsLog10:true,
    xLabel:'天区面积 deg²（log）', yLabel:'log₁₀ N（光谱数）',
    fmtX:v=>v>=1000?Math.round(v/1000)+'k':v,
    fmtY:v=>{const n=Math.pow(10,v);return n>=1e6?Math.round(n/1e6)+'M':Math.round(n/1e3)+'k'},
  });
}
function scatterSVG({title,sub,data,xKey,yKey,xLog,yIsLog10,xLabel,yLabel,fmtX,fmtY}){
  const W=640,H=430, ml=56,mr=16,mt=14,mb=44;
  const xs=data.map(d=>d[xKey]).filter(v=>v>0), ys=data.map(d=>d[yKey]);
  const xmin=Math.min(...xs), xmax=Math.max(...xs), ymin=Math.min(...ys), ymax=Math.max(...ys);
  const pad=(xmax/xmin)**0.12, ypad=(ymax-ymin)*0.14+0.4;
  const x0=xmin/pad, x1=xmax*pad, y0=ymin-ypad, y1=ymax+ypad;
  const X=v=>ml+((xLog?Math.log10(v/x0):v-x0)/((xLog?Math.log10(x1/x0):x1-x0)))*(W-ml-mr);
  const Y=v=>H-mb-((v-y0)/(y1-y0))*(H-mt-mb);
  // x 刻度
  let xticks=[];
  if(xLog){const raw=[100,300,1000,3000,10000,40000];xticks=raw.filter(v=>v>=x0&&v<=x1)}
  else {for(let i=0;i<=5;i++)xticks.push(x0+(x1-x0)*i/5)}
  const yticks=[];for(let i=0;i<=5;i++)yticks.push(y0+(y1-y0)*i/5);
  // ---- 标签贪心避让（压已放标签 > 出绘图区 > 压其他数据点）----
  const dots=data.map(d=>({x:X(d[xKey]),y:Y(d[yKey])}));
  const boxOf=(x,y,w,a)=>a===1?[x-w,y-9.5,w,11]:a===2?[x-w/2,y-9.5,w,11]:[x,y-9.5,w,11];
  const hit=(b,as)=>as.some(o=>b[0]<o[0]+o[2]+1&&o[0]-1<b[0]+b[2]&&b[1]<o[1]+o[3]+1&&o[1]-1<b[1]+b[3]);
  const outside=b=>b[0]<ml||b[1]<mt||b[0]+b[2]>W-mr||b[1]+b[3]>H-mb;
  const textW=s=>{let w=0;for(const ch of s)w+=ch.charCodeAt(0)>0x2E80?11:6.7;return w+7};
  const CAND=[[7,-5,0],[9,14,0],[-9,-5,1],[-9,14,1],[8,-15,0],[-8,-15,1],[1,-18,2],[1,17,2],[13,4,0],[-13,4,1],[7,8,0],[-7,8,1]];
  const placed=[], layout=[];
  data.forEach((d,i)=>{
    const w=textW(d.n);
    const pref=d.lo?[[d.lo[0],d.lo[1],d.anchor==='end'?1:0]]:[];
    const others=dots.filter((_,j)=>j!==i).map(q=>[q.x-7,q.y-7,14,14]);
    let best=null;
    for(const c of pref.concat(CAND)){
      const [dx,dy,a]=c, b=boxOf(dots[i].x+dx,dots[i].y+dy,w,a);
      const sc=(hit(b,placed)?8:0)+(outside(b)?5:0)+(hit(b,others)?2:0);
      if(sc===0){best={dx,dy,a};break}
      if(!best||sc<best.sc)best={dx,dy,a,sc};
    }
    placed.push(boxOf(dots[i].x+best.dx,dots[i].y+best.dy,w,best.a)); layout.push(best);
  });
  let pts='';
  data.forEach((d,i)=>{
    const x=dots[i].x, y=dots[i].y;
    const fill=d.hollow?'none':d.c;
    pts+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${fill}" stroke="${d.c}" stroke-width="1.6"><title>${d.n}（${d.band||''}）</title></circle>`;
    const L=layout[i], anch=L.a===1?'text-anchor="end"':L.a===2?'text-anchor="middle"':'';
    pts+=`<text class="pt-label" ${anch} x="${(x+L.dx).toFixed(1)}" y="${(y+L.dy).toFixed(1)}">${d.n}</text>`;
  });
  return `<h3>${title}</h3><p>${sub}</p>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
    ${xticks.map(v=>`<line class="axis" x1="${X(v)}" y1="${mt}" x2="${X(v)}" y2="${H-mb}"/>
      <text class="axlbl" x="${X(v)}" y="${H-mb+16}" text-anchor="middle">${fmtX(v)}</text>`).join('')}
    ${yticks.map(v=>`<line class="axis" x1="${ml}" y1="${Y(v)}" x2="${W-mr}" y2="${Y(v)}"/>
      <text class="axlbl" x="${ml-8}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end">${fmtY(v)}</text>`).join('')}
    <text class="axlbl" x="${(ml+W-mr)/2}" y="${H-6}" text-anchor="middle">${xLabel}</text>
    <text class="axlbl" transform="rotate(-90 14 ${(mt+H-mb)/2})" x="14" y="${(mt+H-mb)/2}" text-anchor="middle">${yLabel}</text>
    ${pts}
  </svg>`;
}

/* ---- hero 频谱导航尺（波段按频谱排列，点击筛选并跳到总表） ---- */
const LUMVAR = {'--c-img':LUM.img,'--c-ir':LUM.ir,'--c-uv':LUM.uv,'--c-xspec':LUM.xspec,'--c-gspec':LUM.gspec,
                '--c-radio':LUM.radio,'--c-xray':LUM.xray,'--c-time':LUM.time,'--c-astro':LUM.astro};
function buildRuler(){
  const counts={};
  SURVEYS.forEach(s=>s.reg.forEach(r=>counts[r]=(counts[r]||0)+1));
  $('#rulerBands').innerHTML = SPECTRUM_ORDER.map(k=>{
    const v=REG[k];
    return `<button class="rseg" data-k="${k}" style="--seg:${LUM[k]}" aria-pressed="false" aria-label="筛选：${v.label}（${counts[k]||0}）">
      <span class="rt"><span class="rn">${v.label}</span><b>${counts[k]||0}</b></span>
      <span class="re">${SPECTRUM_EN[k]}</span></button>`}).join('');
  const mkx=(k,label,c,n)=>`<button class="xseg${state.reg===k?' on':''}" data-k="${k}" aria-pressed="${state.reg===k}">
    ${c?`<i style="background:${c}"></i>`:''}${label}<span>${n}</span></button>`;
  $('#rulerX').innerHTML = mkx('all','全部',null,SURVEYS.length)
    + CROSSCUT_ORDER.map(k=>mkx(k,REG[k].label,REG[k].hex,counts[k]||0)).join('');
  document.querySelectorAll('#rulerBands .rseg, #rulerX .xseg').forEach(b=>b.onclick=()=>{
    state.reg=b.dataset.k; buildChips(); renderRows(); syncIndex(); skySync(); syncURL();
    document.getElementById('table').scrollIntoView();
  });
  syncIndex();
}
function syncIndex(){
  document.querySelectorAll('#rulerBands .rseg').forEach(b=>b.setAttribute('aria-pressed', b.dataset.k===state.reg));
  document.querySelectorAll('#rulerX .xseg').forEach(b=>b.classList.toggle('on',b.dataset.k===state.reg));
}

/* ---- header：回顶 / 搜索 / 滚动进度（频谱条）/ 章节 scrollspy ---- */
/* 注：部分内嵌环境对程序化 smooth 滚动 no-op，这里用 rAF 自绘保证一致 */
function scrollToEl(el, offset=0){
  const target=()=>el.getBoundingClientRect().top + window.scrollY - offset;
  /* 后台标签页/隐藏 webview 中 rAF 与平滑滚动会被暂停，直接跳转 */
  if(matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden){window.scrollTo(0,target());return}
  const t0=performance.now(), D=700;
  const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  const step=n=>{
    const p=Math.min(1,(n-t0)/D);
    /* 每帧重算目标，抵消字体加载等引起的布局位移 */
    window.scrollTo(0, target()*p + window.scrollY*(1-p));
    if(p<1)requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function initHeader(){
  document.querySelector('.brand').addEventListener('click',e=>{
    e.preventDefault(); scrollToEl(document.body, 0);
  });
  $('#hdrSearch').addEventListener('click',()=>{
    const el=document.getElementById('table');
    scrollToEl(el, 64);
    setTimeout(()=>{
      $('#q').focus({preventScroll:true});
      /* 字体迟加载可能移动布局，聚焦时再校正一次 */
      const top=el.getBoundingClientRect().top;
      if(Math.abs(top-64)>8) window.scrollTo(0, window.scrollY + top - 64);
    }, 450);
  });
  const bar=$('#scrollbar'); let ticking=false;
  const upd=()=>{ticking=false;const h=document.documentElement;
    bar.style.width=(h.scrollTop/Math.max(1,h.scrollHeight-h.clientHeight)*100)+'%'};
  addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(upd)}},{passive:true}); upd();
  const links=[...document.querySelectorAll('nav.toc a')];
  const setActive=id=>links.forEach(a=>{
    const on=a.dataset.sec===id;
    a.classList.toggle('on',on);
    on?a.setAttribute('aria-current','true'):a.removeAttribute('aria-current');
  });
  const io=new IntersectionObserver(es=>{
    es.forEach(e=>{if(e.isIntersecting)setActive(e.target.id)});
  },{rootMargin:'-25% 0px -65% 0px'});
  links.map(a=>document.getElementById(a.dataset.sec)).filter(Boolean).forEach(s=>io.observe(s));
}

/* ---- init ---- */
$('#stN').textContent = SURVEYS.length;
$('#heroN').textContent = SURVEYS.length;
$('#stLinks').textContent = SURVEYS.reduce((a,s)=>a+s.links.length,0);
const _next = TIMELINE.find(t=>t.kind==='future');
if(_next){
  $('#stNextD').textContent = _next.d.replace(/（.*?）/,'');
  $('#stNextT').textContent = '下一站 · '+_next.t.replace(/（.*?）/,'');
}
applyURL();
buildChips(); buildHead(); renderRows(); renderCmpBar(); buildTimeline(); buildGuide(); buildSources(); buildRuler(); initDrawer(); initHeader();
buildSky(); buildGantt(); buildAccess(); buildGlossary(); buildChangelog();
$('#chartImg').innerHTML=chartImaging(); $('#chartSpec').innerHTML=chartSpec();
