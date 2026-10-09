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
const state = {reg:'all', q:'', sortKey:null, sortAsc:true};

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
      buildHead(); renderRows();
    });
  });
}

function rowHTML(s){
  const reg = s.reg.map(r=>`<span class="tag" style="color:${REG[r].hex}"><i style="background:${REG[r].hex}"></i>${REG[r].label}</span>`).join('');
  const st = statusMap[s.status];
  const first = s.links[0];
  return `<tr data-id="${s.id}">
    <td><span class="sname">${esc(s.name)}</span><span class="sdr">${esc(s.dr)}</span></td>
    <td>${reg}</td>
    <td class="dimtxt">${esc(s.facility)}</td>
    <td class="mono">${esc(s.drDate)}</td>
    <td class="mono">${esc(s.area)}</td>
    <td class="mono">${esc(s.bands)}</td>
    <td class="mono">${esc(s.depth)}</td>
    <td class="mono">${esc(s.spec)}</td>
    <td class="mono">${esc(s.nsrc)}</td>
    <td><span class="tag ${st[1]}">${st[0]}</span></td>
    <td><a href="${first[1]}" target="_blank" rel="noopener">数据 ↗</a></td>
  </tr>`;
}

/* ---- 文本列排序器（数值列用 COLS 的 n 键） ---- */
const REG_ORDER = Object.keys(REG);
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
  $('#countRow').textContent = `显示 ${list.length} / ${SURVEYS.length} 个巡天 · 点击行查看数据档案（← → 切换，Esc 关闭）`;
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
    b.onclick=()=>{state.reg=key;buildChips();renderRows();syncIndex()};
    bar.insertBefore(b,$('.searchbox'));
  };
  bar.querySelectorAll('.chip').forEach(e=>e.remove());
  mk('all','全部',null,SURVEYS.length);
  Object.entries(REG).forEach(([k,v])=>mk(k,v.label,v.hex,counts[k]||0));
  $('#q').addEventListener('input',e=>{state.q=e.target.value.trim();renderRows()});
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
  const sec=(t,b)=>b?`<div class="dw-sec"><h5>${t}</h5>${b}</div>`:'';
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
    <div class="dw-head">
      <h2 id="dwName">${esc(s.name)}</h2>
      <p class="dw-en">${esc(s.en)}</p>
      <div class="dw-tags">${tags}</div>
    </div>
    <dl class="kv">${kv}</dl>
    ${sec('发布了什么数据', d.p?`<p>${esc(d.p)}</p>`:'')}
    ${sec('数据形态与规模', d.v?`<p>${esc(d.v)}</p>`:'')}
    ${sec('观测节奏 / Cadence', d.c?`<p>${esc(d.c)}</p>`:'')}
    ${sec('怎么获取', d.a?`<p>${esc(d.a)}</p>`:'')}
    ${sec('观测了什么 · 适合做什么', `<p>${esc(s.sci)}</p>`)}
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

/* ---- 日历 ---- */
function buildTimeline(){
  $('#tlGrid').innerHTML = TIMELINE.map(t=>
    `<div class="tl-card ${t.kind==='future'?'future':''}" style="--bar:var(${t.c})">
      <div class="d">${esc(t.d)}</div><div class="t">${esc(t.t)}</div><div class="n">${esc(t.n)}</div>
    </div>`).join('');
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
    {n:'Roman', a:2000, d:27.0, c:REG.ir.hex, band:'HLSS NIR'},
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
  if(xLog){const raw=[100,300,1000,3000,10000,30000,41253];xticks=raw.filter(v=>v>=x0&&v<=x1)}
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

/* ---- hero 类别索引条（点击即筛选并跳到总表） ---- */
function buildIndex(){
  const counts={};
  SURVEYS.forEach(s=>s.reg.forEach(r=>counts[r]=(counts[r]||0)+1));
  const seg=[['all','全部巡天','#9aa3af',SURVEYS.length]]
    .concat(Object.entries(REG).map(([k,v])=>[k,v.label,v.hex,counts[k]||0]));
  $('#catIndex').innerHTML=seg.map(([k,label,c,n])=>
    `<button class="cseg" data-k="${k}" style="--seg:${c}" aria-label="筛选：${label}（${n}）"><span class="cn"><i></i>${label}</span><b>${n}</b></button>`).join('');
  $('#catIndex').querySelectorAll('.cseg').forEach(b=>b.onclick=()=>{
    state.reg=b.dataset.k;buildChips();renderRows();syncIndex();
    document.getElementById('table').scrollIntoView();
  });
  syncIndex();
}
function syncIndex(){
  document.querySelectorAll('.cseg').forEach(b=>b.classList.toggle('on',b.dataset.k===state.reg));
}

/* ---- init ---- */
$('#stN').textContent = SURVEYS.length;
$('#heroN').textContent = SURVEYS.length;
buildChips(); buildHead(); renderRows(); buildTimeline(); buildGuide(); buildSources(); buildIndex(); initDrawer();
$('#chartImg').innerHTML=chartImaging(); $('#chartSpec').innerHTML=chartSpec();
