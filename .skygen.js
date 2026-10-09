/* 一次性生成器：巡天足迹 → Mollweide 投影 SVG path（输出 footprints.js）
   坐标：赤道 J2000；投影：Mollweide（λ0 = 180°，即 RA 180 在中心，缝在 RA 0/360）
   迹型：band（赤纬带，Mollweide 纬线为水平直线→直接用水平条）
        box（RA×Dec 矩形，弯曲经线边界→采样多边形）
        gal（银道坐标多边形/条带 → 转换到赤道）
        dot（深场/定点）
        full（全天，渲染为虚线外圈 + 下方 chip 行） */
'use strict';
const fs = require('fs');

/* ---------- 银道 → 赤道（ICRS, J2000，Hipparcos 旋转矩阵） ---------- */
const M = [ // ICRS → galactic
 [-0.0548755604,-0.8734370902,-0.4838350155],
 [+0.4941094279,-0.4448296300,+0.7469822445],
 [-0.8676661490,-0.1980763734,+0.4559837762]];
function galToEq(l,b){ // l,b in deg → {ra,dec} deg
  const L=l*Math.PI/180, B=b*Math.PI/180;
  const xg=Math.cos(B)*Math.cos(L), yg=Math.cos(B)*Math.sin(L), zg=Math.sin(B);
  const x = M[0][0]*xg+M[1][0]*yg+M[2][0]*zg;
  const y = M[0][1]*xg+M[1][1]*yg+M[2][1]*zg;
  const z = M[0][2]*xg+M[1][2]*yg+M[2][2]*zg;
  let ra=Math.atan2(y,x)*180/Math.PI; if(ra<0)ra+=360;
  return {ra, dec:Math.asin(z)*180/Math.PI};
}
/* 自检：银心 l=0,b=0 → RA≈266.4°, Dec≈−28.9° */
{const c=galToEq(0,0);
 if(Math.abs(c.ra-266.4)>1.5||Math.abs(c.dec+28.94)>1.5) throw new Error('galToEq 校验失败: '+JSON.stringify(c));}

/* ---------- Mollweide（归一化：x∈[−2.828,2.828], y∈[−1.414,1.414]） ---------- */
const S=125, CX=360, CY=180; // → viewBox 0 0 720 360
function proj(ra,dec){
  let lam=ra-180; if(lam>180)lam-=360; if(lam<-180)lam+=360; // λ0=180
  const phi=Math.max(-89.99,Math.min(89.99,dec))*Math.PI/180, L=lam*Math.PI/180;
  let th=phi, i=0;
  do{ th-= (2*th+Math.sin(2*th)-Math.PI*Math.sin(phi))/(2+2*Math.cos(2*th)); i++ }while(i<60);
  return [CX+(2*Math.sqrt(2)/Math.PI)*L*S, CY-Math.sqrt(2)*Math.sin(th)*S];
}
const px=p=>p[0].toFixed(1)+' '+p[1].toFixed(1);

/* ---------- 多边形 → path（自动在 λ 缝 ±180 处断开为多条 path） ---------- */
function polysToPaths(pts){ // pts: [[ra,dec],...] 闭环（不重复首点）
  const segs=[[]]; let prev=null;
  for(const p of pts){
    if(prev!==null){
      let dl=p[0]-prev[0];
      if(Math.abs(dl)>180){ // 跨缝：在缝处分段
        if(segs[segs.length-1].length>1) segs.push([]);
        prev=p; segs[segs.length-1].push(p); prev=p; continue;
      }
    }
    segs[segs.length-1].push(p); prev=p;
  }
  const out=[];
  for(const s of segs){
    if(s.length<3) continue;
    out.push('M'+s.map(pt=>px(proj(pt[0],pt[1]))).join(' L ')+' Z');
  }
  return out;
}
/* RA×Dec 矩形（经线边采样为弧） */
function box(ra0,ra1,d0,d1){ // 允许 ra1>360（跨缝自然处理）
  const pts=[];
  for(let r=ra0;r<=ra1;r+=3) pts.push([((r%360)+360)%360, d1]);
  for(let d=d1;d>=d0;d-=3) pts.push([((ra1%360)+360)%360, d]);
  for(let r=ra1;r>=ra0;r-=3) pts.push([((r%360)+360)%360, d0]);
  for(let d=d0;d<=d1;d+=3) pts.push([((ra0%360)+360)%360, d]);
  return polysToPaths(pts);
}
/* 银道条带：l∈[l0,l1]，半宽 hw（可线性变化 hw0→hw1），沿银道面 */
function galBand(l0,l1,hw0,hw1){
  const top=[],bot=[],N=Math.max(8,Math.round(Math.abs(l1-l0)/2.5));
  for(let i=0;i<=N;i++){
    const l=l0+(l1-l0)*i/N, hw=hw0+(hw1-hw0)*i/N;
    const a=galToEq(l, hw), b=galToEq(l,-hw);
    top.push([a.ra,a.dec]); bot.push([b.ra,b.dec]);
  }
  return polysToPaths(top.concat(bot.reverse()));
}
/* 银道半球（西银半球 l 180→360，经极点闭合） */
function galHalfWest(){
  const pts=[];
  for(let l=180;l<=360;l+=4) pts.push(galToEq(l,0));           // 沿银道 l=180→360
  const up=[]; for(let b=0;b<=88;b+=6) up.push(galToEq(360,b)); // l=0(=360) 经线上行到极
  const down=[]; for(let b=88;b>=0;b-=6) down.push(galToEq(180,b)); // l=180 经线下行
  const all=pts.concat(up,down.map(p=>p)); // up 到极，再沿 l=180 回赤道
  return polysToPaths(pts.concat(up, down).map(p=>[p.ra,p.dec]));
}

/* ---------- 网格与银河带 ---------- */
function graticule(){
  const paths=[];
  const P=(ra,dec)=>px(proj(ra,dec));
  // 纬线（水平直线，剪到椭圆内）：椭圆边界 x = a·cos(t), y = b·sin(t)
  for(const d of [-60,-30,0,30,60]){
    const y=proj(180,d)[1], a=2*Math.sqrt(2)*S, b=Math.sqrt(2)*S;
    const x=Math.sqrt(Math.max(0,1-(y-CY)*(y-CY)/(b*b)))*a;
    paths.push(`M${(CX-x).toFixed(1)} ${y.toFixed(1)} L${(CX+x).toFixed(1)} ${y.toFixed(1)}`);
  }
  // 经线（每 30° 全椭圆弧）
  for(let ra=210;ra<=330;ra+=30){ // λ0=180 → 经线 RA 210..330 即 λ −150..150? 直接画 λ∈{−150..150}\{0}
  }
  for(const lam of [-150,-120,-90,-60,-30,0,30,60,90,120,150]){
    const ra=180+lam, pts=[];
    for(let d=-90;d<=90;d+=5) pts.push(P(ra,d));
    paths.push('M'+pts.join(' L'));
  }
  // 边界椭圆
  paths.push('');
  return {lines:paths, ellipse:{cx:CX,cy:CY,rx:(2*Math.sqrt(2)*S).toFixed(1),ry:(Math.sqrt(2)*S).toFixed(1)}};
}
function milkyWay(){ // |b|≤13° 的银河带
  const top=[],bot=[];
  for(let l=0;l<=360;l+=4){ const a=galToEq(l,13),b=galToEq(l,-13); top.push([a.ra,a.dec]); bot.push([b.ra,b.dec]); }
  return polysToPaths(top.concat(bot.reverse()));
}

/* ---------- 每巡天足迹定义 ---------- */
const FP = {
  /* 成像·光学 */
  sdss:    {band:[-10,65], dot:'scattered', style:'dot'},
  ps1:     {band:[-30,90]},
  des:     {box:[30,110,-70,-25]},
  legacy:  {band:[-40,45], style:'dot'},
  hsc:     {box:[[130,250,-2,8],[330,380,-2,8]]},   // 380→跨缝拆 330..360+0..20
  kids:    {box:[[150,230,-3,3],[330,360,-35,-28]]},
  skymapper:{band:[-90,16]},
  delve:   {band:[-90,15]},
  jplus:   {band:[-10,60], style:'dot'},
  splus:   {band:[-45,5], style:'dot'},
  jpas:    {band:[-10,70], style:'dot'},
  rubin:   {band:[-72,12]},
  /* 红外/紫外 */
  twomass: {full:1}, wise:{full:1}, galex:{full:1},
  vhs:     {band:[-90,2]},
  uhs:     {band:[0,60], style:'dot'},
  viking:  {box:[[150,230,-3,3],[330,360,-35,-28]], style:'dot'},
  vvv:     {gal:[[-10,10,8,8],[-70,-10,4,8],[-125,-70,2.5,4]]},
  ukidss:  {band:[-5,60], style:'dot', dots:[[34,-5]]},
  ultravista:{dots:[[150.1,2.2]]},
  cosmosweb:{dots:[[150.1,2.2]]},
  neowise: {full:1},
  /* 空间任务 */
  gaia:    {full:1},
  euclid:  {box:[[70,180,-55,20],[220,345,-30,20]]},
  spherex: {full:1},
  roman:   {band:[-35,35], style:'dash', dots:[[266.4,-28.9]]}, // 规划示意 + 银核 GBTDS
  csst:    {band:[-30,60], style:'dash'},
  /* 光谱·河外 */
  desi:    {band:[-20,65], style:'dot'},
  sdssv:   {full:1},
  eboss:   {band:[-10,60], style:'dot'},
  lamost:  {band:[-10,70], style:'dot'},
  gama:    {dots:[[135,0],[180,0],[215,0],[351,-32]]},
  devils:  {dots:[[150.1,2.2],[35,-4.5],[53,-27.8]]},
  hetdex:  {box:[[190,230,8,15],[25,60,0,8]], style:'dot'},
  '4most': {band:[-90,20], style:'dash'},
  weave:   {band:[0,70], style:'dot'},
  vipers:  {box:[[32,36,-7,-3],[328,332,-7,-3]], style:'dot'},
  pfs:     {band:[-5,60], style:'dot'},
  moons:   {gal:[[-70,20,2,2]], style:'dash'},
  '2df6df':{band:[-90,-10], style:'dot', box:[[315,355,-33,-27],[150,230,-3,3]]},
  /* 光谱·银河系 */
  apogee:  {gal:[[0,360,2.5,2.5]], style:'dot'},
  galah:   {band:[-90,-10], style:'dot'},
  gaiaeso: {band:[-90,10], style:'dot'},
  rave:    {band:[-90,-15], style:'dot'},
  /* 射电 */
  lotss:   {band:[0,90]},
  racs:    {band:[-90,49]},
  emu:     {band:[-90,30]},
  vlass:   {band:[-40,90]},
  nvss:    {band:[-40,90]},
  gleam:   {band:[-90,30]},
  apertif: {band:[0,70], style:'dot'},
  /* X 射线 */
  erosita: {halfWest:1},
  xxl:     {dots:[[35,-4.5],[6,-55]]},
  ep:      {full:1},
  /* 时域 */
  ztf:     {band:[-30,88]},
  tess:    {full:1},
  asassn:  {full:1},
  atlas:   {full:1},
};

/* ---------- 编译 ---------- */
const out={};
for(const [id,def] of Object.entries(FP)){
  const o={paths:[],dots:[],style:def.style||'solid'};
  if(def.band){
    const y0=proj(180,def.band[0])[1], y1=proj(180,def.band[1])[1];
    const a=2*Math.sqrt(2)*S, b=Math.sqrt(2)*S;
    const xAt=y=>Math.sqrt(Math.max(0,1-(y-CY)*(y-CY)/(b*b)))*a;
    o.paths.push(`M${(CX-xAt(y0)).toFixed(1)} ${y0.toFixed(1)} L${(CX+xAt(y0)).toFixed(1)} ${y0.toFixed(1)} L${(CX+xAt(y1)).toFixed(1)} ${y1.toFixed(1)} L${(CX-xAt(y1)).toFixed(1)} ${y1.toFixed(1)} Z`);
    o.clipBand=[y0,y1];
  }
  const boxes=def.box?(Array.isArray(def.box[0])?def.box:[def.box]):[];
  for(const bx of boxes) o.paths.push(...box(bx[0],bx[1],bx[2],bx[3]));
  if(def.gal) for(const g of def.gal) o.paths.push(...galBand(g[0],g[1],g[2],g[3]));
  if(def.halfWest) o.paths.push(...galHalfWest());
  for(const d of def.dots||[]) o.dots.push(proj(d[0],d[1]).map(v=>+v.toFixed(1)));
  if(!o.paths.length && !o.dots.length && !def.full) throw new Error(id+': 空足迹');
  out[id]=o;
}
const full=Object.entries(FP).filter(([k,v])=>v.full).map(([k])=>k);
const g=graticule();
const js=`/* Survey Atlas · 足迹数据（由 .skygen.js 生成，勿手改）
   坐标：赤道 J2000 / Mollweide（λ0=180°，viewBox 0 0 720 360）
   近似示意（≈）：以各巡天官方 footprint 文件为准 */
const SKY_ELLIPSE=${JSON.stringify(g.ellipse)};
const SKY_GRAT=${JSON.stringify(g.lines)};
const SKY_MILKY=${JSON.stringify(milkyWay())};
const SKY_FP=${JSON.stringify(out)};
const SKY_FULL=${JSON.stringify(full)};
`;
fs.writeFileSync('footprints.js', js);
console.log('footprints.js 生成完毕');
console.log('巡天足迹:', Object.keys(out).length, '| 全天 chip:', full.length, '| 银河带 path:', milkyWay().length);
