import * as T from 'three';
import { onFloor } from './walk-motion';

export type WallOpening={id?:string;start:number;end:number;bottom:number;top:number;kind:'door'|'window'};
export type WallRecord={id:string;name:string;a:number[];b:number[];thickness:number;height:number;rooms:string[];lock:''|'structural'|'exterior'|'fixed';openings:WallOpening[];deleted:boolean;railing?:boolean};
import { isRoomFinish, type RoomFinish } from './finish-presets';
export type { RoomFinish } from './finish-presets';
import { WALL_COLORS, FLOOR_STYLES } from './finish-presets';
export { WALL_COLORS, FLOOR_STYLES } from './finish-presets';
export const DEFAULT_FINISH:RoomFinish={wall:'white',floor:'oak'};
export function wallLength(w:WallRecord){return Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);}
export function transformWall(w:WallRecord,dx:number,dz:number,radians:number):WallRecord{
 const next=structuredClone(w),cx=(w.a[0]+w.b[0])/2,cz=(w.a[1]+w.b[1])/2,c=Math.cos(radians),s=Math.sin(radians);
 for(const key of ['a','b'] as const){const x=w[key][0]-cx,z=w[key][1]-cz;next[key]=[cx+dx+x*c-z*s,cz+dz+x*s+z*c];}
 return next;
}
export type WallResizeHandle={end:-1|0|1;side:-1|0|1};
/** Resize in the wall's local axes, keeping the opposite edge/corner anchored.
 * Openings retain their physical size and longitudinal world position. */
export function resizeWall(w:WallRecord,handle:WallResizeHandle,along:number,across:number):WallRecord{
 if(w.lock)throw new Error('锁定墙体不能调整尺寸。');
 if(!Number.isFinite(along)||!Number.isFinite(across)||(!handle.end&&!handle.side))throw new Error('墙体尺寸无效。');
 const next=structuredClone(w),L=wallLength(w),ux=(w.b[0]-w.a[0])/L,uz=(w.b[1]-w.a[1])/L;
 const start=handle.end===-1?along:0,end=handle.end===1?L+along:L;
 let low=-w.thickness/2,high=w.thickness/2;
 if(handle.side===-1)low=T.MathUtils.clamp(low+across,high-.4,high-.06);
 if(handle.side===1)high=T.MathUtils.clamp(high+across,low+.06,low+.4);
 if(end-start<.1-.00000001)throw new Error('墙体不能缩至10厘米以下，也不能翻转。');
 const offset=(low+high)/2;
 next.a=[w.a[0]+ux*start-uz*offset,w.a[1]+uz*start+ux*offset];
 next.b=[w.a[0]+ux*end-uz*offset,w.a[1]+uz*end+ux*offset];
 next.thickness=Math.round((high-low)*1e10)/1e10;
 next.openings=next.openings.map(o=>({...o,start:o.start-start,end:o.end-start}));
 return next;
}
export function wallDistance(p:number[],w:WallRecord){const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],t=T.MathUtils.clamp(((p[0]-w.a[0])*dx+(p[1]-w.a[1])*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(p[0]-w.a[0]-t*dx,p[1]-w.a[1]-t*dz);}
// IDs describe edit ownership, not structural geometry; adding IDs must not rebuild
// original curved glass or invalidate protected walls in older saved layouts.
function signature(w:WallRecord){return JSON.stringify([w.a,w.b,w.thickness,w.height,w.openings.map(({start,end,bottom,top,kind})=>[start,end,bottom,top,kind]),w.deleted,w.railing??false,w.lock,w.rooms]);}
export function wallChanged(w:WallRecord,b:WallRecord){return signature(w)!==signature(b);}
export function withOpeningIds(walls:WallRecord[]):WallRecord[]{return walls.map(w=>({...structuredClone(w),openings:w.openings.map((o,i)=>({...o,id:o.id??`${w.id}:opening:${i}`}))}));}
export function validateOpenings(w:WallRecord){
 const L=wallLength(w),ids=new Set<string>();
 if(w.openings.length>64)throw new Error('一面墙最多64个洞口。');
 for(const [i,o] of w.openings.entries()){
  if(![o.start,o.end,o.bottom,o.top].every(Number.isFinite)||o.start<-.000001||o.end>L+.000001||o.end-o.start<.07||o.bottom<0||o.top>w.height+.000001||o.top-o.bottom<.07||!['door','window'].includes(o.kind))throw new Error('门窗洞口超出墙体，或宽高过小。');
  if(o.id!==undefined&&(typeof o.id!=='string'||o.id.length>160||!o.id||ids.has(o.id)))throw new Error('洞口标识无效或重复。');
  if(o.id)ids.add(o.id);
  for(const other of w.openings.slice(0,i))if(o.start<other.end-.000001&&o.end>other.start+.000001&&o.bottom<other.top-.000001&&o.top>other.bottom+.000001)throw new Error('门窗洞口不能相互重叠。');
 }
}
export function validateWalls(input:unknown,base:WallRecord[],rooms:{id:string;polygon:number[][]}[]):WallRecord[]{
 if(input===undefined)return withOpeningIds(base);
 if(!Array.isArray(input)||input.length>250)throw new Error('墙体记录无效，最多250堵。');
 const defaults=new Map(base.map(w=>[w.id,w])),seen=new Set<string>();
 const result=input.map((w:WallRecord)=>{
  if(!w||typeof w.id!=='string'||w.id.length>100||seen.has(w.id)||typeof w.name!=='string'||w.name.length>100||![w.a,w.b].every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<40))||!Number.isFinite(w.thickness)||w.thickness<.015||w.thickness>.4||!Number.isFinite(w.height)||w.height<.3||w.height>3||typeof w.deleted!=='boolean'||!['','structural','exterior','fixed'].includes(w.lock)||!Array.isArray(w.rooms)||!w.rooms.length||!w.rooms.every(id=>rooms.some(r=>r.id===id))||!Array.isArray(w.openings))throw new Error('墙体参数无效。');
  seen.add(w.id);const old=defaults.get(w.id),L=wallLength(w);
  if(old?.lock&&wallChanged(w,old))throw new Error(old.lock==='fixed'?'此处已确认为固定墙体，不能修改或删除。':'黑色实墙与外围墙已锁定，不能修改或删除。');
  if(!old&&(!w.id.startsWith('wall-')||w.lock||w.railing))throw new Error('新增墙体不能修改原图的保护规则。');
  if(!w.lock&&w.thickness<.06)throw new Error('隔墙厚度至少6厘米。');
  if(old&&w.lock!==old.lock)throw new Error('不能更改墙体保护规则。');
  if(L<.08||L>20)throw new Error('墙体长度应在0.08至20米内。');
  validateOpenings(w);
  if(!w.deleted&&(!old||wallChanged(w,old))){
   for(let i=0;i<=Math.ceil(L*20);i++){const t=i/Math.ceil(L*20),x=w.a[0]+(w.b[0]-w.a[0])*t,z=w.a[1]+(w.b[1]-w.a[1])*t;
    if(!onFloor(x,z,rooms.map(r=>r.polygon)))throw new Error('请在现有户型范围内绘制墙体。');
   }
   // Reject crossings of protected wall bodies; endpoint joins remain possible.
   for(const p of base.filter(p=>p.lock)){
    const ax=w.b[0]-w.a[0],az=w.b[1]-w.a[1],bx=p.b[0]-p.a[0],bz=p.b[1]-p.a[1],d=ax*bz-az*bx;
    if(Math.abs(d)<1e-8)continue;
    const cx=p.a[0]-w.a[0],cz=p.a[1]-w.a[1],t=(cx*bz-cz*bx)/d,u=(cx*az-cz*ax)/d;
    if(t>.015&&t<.985&&u>.015&&u<.985)throw new Error('新增或调整的隔墙不能穿过锁定墙体。');
   }
  }
  return structuredClone(old?.lock?old:w);
 });
 for(const w of base)if(!seen.has(w.id))throw new Error('方案缺少原始墙体记录；删除隔墙需保留其删除标记。');
 const normalized=withOpeningIds(result);for(const w of normalized)validateOpenings(w);return normalized;
}
export function validateFinishes(input:unknown,roomIds:string[]):Record<string,RoomFinish>{
 if(input===undefined)return {};
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('装修材质记录无效。');
 const result:Record<string,RoomFinish>={};
 for(const [id,v] of Object.entries(input)){if(!roomIds.includes(id)||!isRoomFinish(v))throw new Error('装修材质或墙面颜色不受支持。');result[id]={wall:v.wall,floor:v.floor,...(v.wallColor!==undefined?{wallColor:v.wallColor.toLowerCase()}:{})};}
 return result;
}
/** One complete wall with true openings, kept as a single semantic edit unit. */
export function makeWall(w:WallRecord):T.Group{
 const g=new T.Group();g.name=w.name;g.userData={wallId:w.id,wallLock:w.lock};const L=wallLength(w),angle=-Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0]);
 const material=new T.MeshStandardMaterial({color:'#eeeae1',roughness:.85});
 function part(s:number,e:number,lo:number,hi:number,layer='wall',mat:T.Material=material,width=w.thickness,openingId?:string){
  if(e-s<.00001||hi-lo<.00001)return;
  const mesh=new T.Mesh(new T.BoxGeometry(e-s,hi-lo,width),mat),t=(s+e)/2/L;
  mesh.position.set(w.a[0]+(w.b[0]-w.a[0])*t,(lo+hi)/2,w.a[1]+(w.b[1]-w.a[1])*t);mesh.rotation.y=angle;
  mesh.userData={wallId:w.id,room:w.rooms[0],rooms:w.rooms,layer,cutaway:w.id,wallLock:w.lock,...(openingId?{openingId}:{})};mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);
 }
 const breaks=[...new Set([0,L,...w.openings.flatMap(o=>[o.start,o.end])])].sort((a,b)=>a-b);
 for(let i=0;i<breaks.length-1;i++){
  const s=breaks[i],e=breaks[i+1],cuts=w.openings.filter(o=>o.start<(s+e)/2&&o.end>(s+e)/2).sort((a,b)=>a.bottom-b.bottom);let bottom=0;
  for(const o of cuts){part(s,e,bottom,o.bottom);bottom=Math.max(bottom,o.top);}part(s,e,bottom,w.height);
 }
 for(const [index,o] of w.openings.entries()){
  const trim=new T.MeshStandardMaterial({color:'#777c7d',metalness:.7,roughness:.3}),layer=o.kind==='window'?'window':'door';
  const id=o.id??`${w.id}:opening:${index}`;
  part(o.start,o.start+.035,o.bottom,o.top,layer,trim,.055,id);part(o.end-.035,o.end,o.bottom,o.top,layer,trim,.055,id);part(o.start,o.end,o.top-.035,o.top,layer,trim,.055,id);
  if(o.kind==='window'){
   part(o.start,o.end,o.bottom,o.bottom+.035,layer,trim,.055,id);
   part(o.start+.035,o.end-.035,o.bottom+.035,o.top-.035,layer,new T.MeshStandardMaterial({color:'#bad8e0',transparent:true,opacity:.13,depthWrite:false,side:T.DoubleSide}),.015,id);
   if(o.end-o.start>1.5)part((o.start+o.end)/2-.018,(o.start+o.end)/2+.018,o.bottom,o.top,layer,trim,.055,id);
  }
 }
 return g;
}
