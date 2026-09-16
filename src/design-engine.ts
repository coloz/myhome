import type { Layout, SavedEntity } from './layout';
import type { Project } from './viewer';
import type { CatalogItem } from './catalog-types';

/** Pure domain functions shared by the browser and the stdio MCP server. Units: m, rad, CNY. */
export type DesignBrief = {
  name:string; household:string; requirements:string; scenario:'family'|'work'|'elder';
  style:'warm'|'calm'|'natural'; budget:number; reservePercent:number;
  workRate:number; furnitureFactor:number; clearance:number;
};
export type DesignDocument = { schema:'home-design/v1'; id:string; updatedAt:string; templateId:'raw-shell'; brief:DesignBrief; layout:Layout; roomUses:Record<string,string> };
export type DesignIssue = { severity:'error'|'warning'|'info'; code:string; message:string; room?:string; entityIds:string[] };
export type DesignReport = {
  area:number; furnitureCount:number; issues:DesignIssue[]; unmeasured:number;
  rooms:{id:string;name:string;area:number;use:string;count:number}[];
  costs:{label:string;quantity:number;unit:string;unitPrice:number;amount:number}[];
  subtotal:number;reserve:number;total:number;budget:number;balance:number; assumptions:string[]; followUps:string[];
};
export const DESIGN_SCENARIOS:DesignBrief[] = [
  {name:'亲子成长 · 温润木色',household:'夫妻与一名学龄儿童，长辈偶尔留宿',requirements:'三间卧室；孩子有独立阅读角；客厅保留活动空间；增加收纳；厨卫位置不变。',scenario:'family',style:'warm',budget:240000,reservePercent:15,workRate:950,furnitureFactor:1,clearance:.8},
  {name:'双人办公 · 安静共居',household:'两位长期居家工作的成年人',requirements:'两间独立工作室，减少视频会议互相干扰；主卧休息；客餐厅用于交流，设备收纳集中。',scenario:'work',style:'calm',budget:220000,reservePercent:15,workRate:850,furnitureFactor:1,clearance:.85},
  {name:'长辈同住 · 从容生活',household:'夫妻与一位能独立行走的长辈',requirements:'主卧给长辈；次卧一给夫妻；次卧二作为家人留宿房；减少客厅中间家具，预留照护空间。',scenario:'elder',style:'natural',budget:260000,reservePercent:20,workRate:1100,furnitureFactor:1,clearance:.9},
];
export function validateBrief(value:unknown):DesignBrief {
  const b=value as DesignBrief;
  if(!b||!['family','work','elder'].includes(b.scenario)||!['warm','calm','natural'].includes(b.style))throw Error('请选择支持的家庭场景和风格。');
  for(const [key,max] of [['name',60],['household',400],['requirements',3000]] as const)if(typeof b[key]!=='string'||!b[key].trim()||b[key].length>max)throw Error('需求文字为空或超出长度限制：'+key);
  for(const [key,min,max] of [['budget',1000,10000000],['reservePercent',0,40],['workRate',0,10000],['furnitureFactor',.1,10],['clearance',.5,1.5]] as const)if(!Number.isFinite(b[key])||b[key]<min||b[key]>max)throw Error('无效设计参数：'+key);
  return structuredClone(b);
}
export function roomArea(p:number[][]){return Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;}
const round=(n:number)=>Math.round(n*100)/100;
type Point=[number,number];
function inside(p:Point,poly:number[][]){
  let yes=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }return yes;
}
function rectangle(x:number,z:number,w:number,d:number,angle=0):Point[]{
  const c=Math.cos(angle),s=Math.sin(angle);
  return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b])=>[x+a*c+b*s,z-a*s+b*c]);
}
function overlaps(a:Point[],b:Point[],tolerance=.015){
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],len=Math.hypot(q[0]-p[0],q[1]-p[1]);if(!len)continue;
    const axis=[-(q[1]-p[1])/len,(q[0]-p[0])/len];
    const aa=a.map(v=>v[0]*axis[0]+v[1]*axis[1]),bb=b.map(v=>v[0]*axis[0]+v[1]*axis[1]);
    if(Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb))<=tolerance)return false;
  }return true;
}
function footprint(e:SavedEntity,c:CatalogItem){return rectangle(e.position[0],e.position[2],c.dimensions![0]*e.scale,c.dimensions![1]*e.scale,e.rotation);}
function contained(box:Point[],poly:number[][]){return box.every((a,i)=>{const b=box[(i+1)%box.length];return [0,.25,.5,.75].every(t=>inside([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],poly));});}
const typePrices:Record<string,number>={bed:5500,sofa:6500,chair:850,table:1800,cabinet:3800,appliance:3200,vanity:2600,'单人床':3500,'升降桌':3200,'书桌':1800};

export function generateDesign(project:Project,catalog:CatalogItem[],input:DesignBrief,id:string):DesignDocument {
  const brief=validateBrief(input);
  if(project.version!=='2026-09-15-raw-shell')throw Error('自动布置目前适用于原始清水房户型。');
  const entities:SavedEntity[]=[];
  const add=(catalogId:string,room:string,x:number,z:number,angle=0)=>{
    if(!catalog.some(c=>c.id===catalogId&&!c.retired&&c.dimensions))throw Error('缺少可用模型：'+catalogId);
    entities.push({id:`design-${entities.length+1}`,catalogId,room,position:[x,0,z],rotation:angle*Math.PI/180,scale:1,deleted:false});
  };
  const work=brief.scenario==='work',elder=brief.scenario==='elder';
  // Door approaches and the east-west circulation strip remain free.
  add('ph-sofa_02','living',2.2,-1.45,180);
  if(!elder)add('ph-coffee_table_round_01','living',2.2,-2.8);
  else add('ph-side_table_01','living',.85,-1.45);
  add('ph-modern_wooden_cabinet','living',4.6,-.55);
  add('ph-round_wooden_table_02','living',5,-4.65);
  for(const [x,z,a] of [[4.2,-4.65,90],[5.8,-4.65,-90],[5,-3.85,180],[5,-5.45,0]])add('ph-dining_chair_02','living',x,z,a);
  add('ph-drawer_cabinet','entry',1.72,-4.7,90);
  add('blend0-largeFridge','kitchen',-.65,-2.87);
  add('ph-electric_stove','kitchen',-1.78,-1.95,90);
  add('scopia-japanese-toilet','bath-main',9.9,-6.25);
  add('scopia-clothes_washing_machine','bath-guest',3.38,-7.62);
  add('scopia-japanese-toilet','bath-guest',2.7,-7.5);
  add('blend0-bedWithTexture','master',8.85,-2.45);
  add('ph-side_table_01','master',10.13,-2.55);
  add('ph-vintage_cabinet_01','master',9.25,-4.38);
  if(brief.scenario==='family'){
    add('ph-round_wooden_table_02','living',4.8,-2);
    add('ph-dining_chair_02','living',4.8,-2.8,180);
  }
  const roomUses:Record<string,string>={living:elder?'用餐、会客与照护活动':'用餐、会客与共享活动',entry:'换鞋与日常物品收纳',kitchen:'原位烹饪',master:elder?'长辈卧室':'夫妻卧室','bath-main':'保留原位湿区','bath-guest':'卫浴与洗衣',passage:'通行，保持净空',garden:'光厅保持原状'};
  if(brief.scenario==='family')roomUses['living']='用餐、会客与独立亲子阅读角';
  for(const [room,cx] of [['bed-west',5.35],['bed-east',8.35]] as const){
    if(work){
      add(room==='bed-west'?'detail-standing-desk':'detail-desk',room,cx,-9.45);
      add('ph-dining_chair_02',room,cx,-8.65,180);
      add('ph-drawer_cabinet',room,cx+(room==='bed-west'?-1:.82),-7.8,90);
      roomUses[room]=room==='bed-west'?'独立工作室 A（升降桌）':'独立工作室 B（抽屉书桌）';
    }else{
      add(brief.scenario==='family'&&room==='bed-west'?'detail-bed-single':'blend0-bedWithTexture',room,cx,-9.1);
      add('ph-side_table_01',room,room==='bed-west'?4.25:9.45,-7.25);
      roomUses[room]=room==='bed-west'?(elder?'家人留宿房':'儿童卧室（单人床）'):(elder?'夫妻卧室':'长辈留宿房');
    }
  }
  const wall=brief.style==='calm'?'blue':brief.style==='natural'?'sage':'white';
  const floor=brief.style==='calm'?'light-oak':'oak';
  const rooms=Object.fromEntries(project.rooms.map(r=>[r.id,{visible:true,decorated:!r.greeneryOnly}]));
  const finishes=Object.fromEntries(project.rooms.filter(r=>!r.greeneryOnly).map(r=>[r.id,{wall,floor:/bath|kitchen/.test(r.id)?'tile':floor}]));
  return {schema:'home-design/v1',id,updatedAt:new Date().toISOString(),templateId:'raw-shell',brief,roomUses,layout:{format:'home-simulator',version:2,modelVersion:project.version,modelRevision:project.revision??1,entities,rooms,walls:structuredClone(project.walls??[]),finishes}};
}

/** Validate before any save/import. Locked walls and original room state keys are immutable. */
export function validateDesign(value:unknown,project:Project,catalog:CatalogItem[]):DesignDocument {
  const d=value as DesignDocument;
  if(!d||d.schema!=='home-design/v1'||d.templateId!=='raw-shell'||typeof d.id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(d.id))throw Error('设计文件格式或标识无效。');
  if(typeof d.updatedAt!=='string'||!Number.isFinite(Date.parse(d.updatedAt)))throw Error('设计版本时间无效。');
  validateBrief(d.brief);
  const l=d.layout;
  if(!l||l.format!=='home-simulator'||l.version!==2||l.modelVersion!==project.version||l.modelRevision!==(project.revision??1)||!Array.isArray(l.entities)||l.entities.length>600||!l.rooms)throw Error('布局或户型版本不匹配。');
  const ids=new Set<string>(),rooms=new Set(project.rooms.map(r=>r.id));
  for(const e of l.entities){
    if(!e||typeof e.id!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(e.id)||ids.has(e.id)||!rooms.has(e.room)||!catalog.some(c=>c.id===e.catalogId&&!c.retired)||e.sourceId||!Array.isArray(e.position)||e.position.length!==3||!e.position.every(n=>Number.isFinite(n)&&Math.abs(n)<100)||!Number.isFinite(e.rotation)||!Number.isFinite(e.scale)||e.scale<.3||e.scale>3||typeof e.deleted!=='boolean'||(e.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(e.color)))throw Error('家具数据无效或使用了不可用模型。');
    ids.add(e.id);
  }
  for(const id of rooms){if(typeof l.rooms[id]?.visible!=='boolean'||typeof l.rooms[id]?.decorated!=='boolean')throw Error('缺少房间状态。');}
  if(!l.finishes||Object.entries(l.finishes).some(([id,f])=>!rooms.has(id)||!f||!['white','cream','blue','sage'].includes(f.wall)||!['oak','light-oak','tile','terrazzo'].includes(f.floor)))throw Error('墙地面材料无效。');
  // MCP scope is furnishing and finishes; walls remain exactly the measured template.
  if(JSON.stringify(l.walls)!==JSON.stringify(project.walls))throw Error('MCP 设计不允许改动户型墙体；请在墙体编辑器中处理。');
  if(!d.roomUses||Object.entries(d.roomUses).some(([key,text])=>!rooms.has(key)||typeof text!=='string'||text.length>300))throw Error('房间用途无效。');
  return structuredClone(d);
}

export function analyzeDesign(project:Project,catalog:CatalogItem[],layout:Layout,brief:DesignBrief,uses:Record<string,string>={}):DesignReport {
  validateBrief(brief);
  const issues:DesignIssue[]=[],costs:DesignReport['costs']=[];
  const active=layout.entities.filter(e=>!e.deleted),byId=new Map(catalog.filter(c=>!c.retired).map(c=>[c.id,c]));
  const measured=active.flatMap(e=>{const c=byId.get(e.catalogId??'');return c?.dimensions?[{e,c,box:footprint(e,c),bottom:e.position[1],top:e.position[1]+c.dimensions[2]*e.scale}]:[];});
  const push=(severity:DesignIssue['severity'],code:string,message:string,room?:string,entityIds:string[]=[])=>issues.push({severity,code,message,room,entityIds});
  for(const m of measured){
    const room=project.rooms.find(r=>r.id===m.e.room);
    if(room&&!contained(m.box,room.polygon))push('error','outside',`${m.c.name}超出${room.name}边界`,room.id,[m.e.id]);
    if(m.bottom<-.01||m.top>project.height)push('error','height',`${m.c.name}超出地面或层高范围`,m.e.room,[m.e.id]);
    if(room?.greeneryOnly)push('warning','public-space',`${room.name}仅适合可移动绿化，请复核${m.c.name}`,room.id,[m.e.id]);
    for(const w of layout.walls??project.walls??[]){
      if(w.deleted||w.railing)continue;
      const len=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);if(!len)continue;
      const angle=-Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0]),ux=(w.b[0]-w.a[0])/len,uz=(w.b[1]-w.a[1])/len;
      const sections=[0,len,...w.openings.flatMap(o=>[o.start,o.end])].sort((a,b)=>a-b);
      for(let i=1;i<sections.length;i++){
        const start=sections[i-1],end=sections[i],mid=(start+end)/2;if(end-start<.001)continue;
        const opening=w.openings.find(o=>mid>o.start&&mid<o.end);
        if(opening&&m.bottom>=opening.bottom&&m.top<=opening.top)continue;
        if(m.bottom>=w.height)continue;
        if(overlaps(m.box,rectangle(w.a[0]+ux*mid,w.a[1]+uz*mid,end-start,w.thickness,angle))){push('error','wall',`${m.c.name}与${w.name}相交`,m.e.room,[m.e.id]);break;}
      }
      if(m.bottom>.1)continue;
      for(const o of w.openings.filter(o=>o.kind==='door')){
        const mid=(o.start+o.end)/2;
        if(overlaps(m.box,rectangle(w.a[0]+ux*mid,w.a[1]+uz*mid,o.end-o.start,brief.clearance*2+w.thickness,angle)))push('warning','door',`${m.c.name}进入${w.name}门口预留区（两侧各 ${brief.clearance} m）`,m.e.room,[m.e.id]);
      }
    }
  }
  for(let i=0;i<measured.length;i++)for(let j=i+1;j<measured.length;j++){
    const a=measured[i],b=measured[j];
    if(Math.min(a.top,b.top)-Math.max(a.bottom,b.bottom)>.02&&overlaps(a.box,b.box))push('error','overlap',`${a.c.name}与${b.c.name}重叠`,a.e.room,[a.e.id,b.e.id]);
  }
  const unmeasured=active.length-measured.length;
  if(unmeasured)push('warning','unmeasured',`${unmeasured} 件原始模型家具缺少目录尺寸与单价，未计入碰撞检查和家具预算`);
  const rooms=project.rooms.filter(r=>!r.greeneryOnly).map(r=>({id:r.id,name:r.name,area:round(roomArea(r.polygon)),use:uses[r.id]??r.name,count:active.filter(e=>e.room===r.id).length}));
  const area=round(rooms.reduce((n,r)=>n+r.area,0));
  const addCost=(label:string,quantity:number,unit:string,unitPrice:number)=>costs.push({label,quantity:round(quantity),unit,unitPrice:round(unitPrice),amount:Math.round(quantity*unitPrice)});
  const counts=new Map<string,number>();for(const {c} of measured)counts.set(c.id,(counts.get(c.id)??0)+1);
  for(const [id,n] of counts){const c=byId.get(id)!;addCost(c.name,n,'件',(typePrices[c.type]??1800)*brief.furnitureFactor);}
  for(const r of project.rooms.filter(r=>!r.greeneryOnly)){
    const f=layout.finishes?.[r.id]??{wall:'white',floor:'oak'};
    addCost(r.name+'地面（含 8% 损耗）',roomArea(r.polygon)*1.08,'㎡',({oak:220,'light-oak':180,tile:150,terrazzo:260}[f.floor]??220));
    const perimeter=r.polygon.reduce((n,a,i)=>{const b=r.polygon[(i+1)%r.polygon.length];return n+Math.hypot(a[0]-b[0],a[1]-b[1]);},0);
    addCost(r.name+'墙面（毛面积估算）',perimeter*project.height,'㎡',f.wall==='white'?45:55);
  }
  addCost('基础施工、厨卫固定配置及机电暂列',area,'㎡',brief.workRate);
  const subtotal=costs.reduce((n,c)=>n+c.amount,0),reserve=Math.round(subtotal*brief.reservePercent/100),total=subtotal+reserve;
  if(total>brief.budget)push('warning','budget',`模拟总价超出预算 ¥${(total-brief.budget).toLocaleString('zh-CN')}`);
  push('info','scope','已检查目录家具包围盒、墙段和门口预留区；未验证连续通路、门扇开启轨迹、窗户操作、采光、机电或施工合规。');
  const followUps=['复测户型、净高与设备尺寸；当前面积来自模型多边形，不是产权面积。','深化厨房台面、水槽、淋浴、洗面台及机电点位；暂列费未形成工程量清单。','现场确认采光、照明回路、插座和收纳开门空间；材质颜色不代表材料性能。',brief.scenario==='family'?'儿童阅读桌椅与衣柜需深化选型，柜体固定、防夹与圆角需要现场核实。':brief.scenario==='work'?'已布置升降桌和抽屉书桌；人体工学椅、屏幕、网络、工作照明与隔声仍需深化。':'实测床边照护通道、夜间照明、扶手及防滑；本方案未验证轮椅通行。'];
  return {area,furnitureCount:active.length,issues,unmeasured,rooms,costs,subtotal,reserve,total,budget:brief.budget,balance:brief.budget-total,assumptions:['货币：人民币；所有单价为软件内演示假设，不是品牌报价或市场询价。','家具尺寸顺序：宽 × 深 × 高；缩放不代表可购买的产品规格。','墙面按房间周长 × 层高估算，未扣门窗；地面加 8% 损耗。','基础暂列费覆盖未建模的施工与厨卫固定配置；目录家电另计。税费、设计费等需实际报价确认。','房间隐藏或清水房显示仅改变视图；预算仍包含所有未删除家具和设定装修。'],followUps};
}
