import * as T from 'three';
import { HomeViewer } from './viewer';
import { CATALOG, makeFurniture } from './catalog';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { migrateLegacyLayout, upgradeModelLayout, type SavedEntity, type Layout } from './layout';
import { SCHEMES, type Scheme } from './schemes';
export type { Layout } from './layout';
type Entity={id:string;name:string;group:T.Group;room:string;sourceId?:string;catalogId?:string;original:boolean;deleted:boolean;color?:string};
export type Selection={id:string;name:string;room:string;x:number;z:number;angle:number;scale:number;color:string};
export type EditorStatus={selection:Selection|null;undo:number;redo:number;count:number;message:string;legacyBackup?:boolean;items:{id:string;name:string;room:string}[]};
export class HomeEditor extends HomeViewer {
 entities=new Map<string,Entity>();
 selectedEntity:string|null=null;
 editEnabled=true;
 readOnly=false;
 setReadOnly(value:boolean){this.readOnly=value;if(value)this.setObjectsLocked(true);}
 private lockedObjects=false;
 get objectsLocked(){return this.lockedObjects;}
 onEdit=(_s:EditorStatus)=>{};
 onLayoutChange=(_layout:Layout)=>{};
 private undoStack:Layout[]=[];private redoStack:Layout[]=[];
 private key:string;
 private initial!:Layout;
 private savedAt='';
 private legacyBackup='';
 private picker=new T.Raycaster();
 private plane=new T.Plane(new T.Vector3(0,1,0),0);
 private outline=new T.BoxHelper(new T.Object3D(),0xb5a365);
 private drag?:{id:string;pointerId:number;offset:T.Vector3;start:{x:number;y:number};before:Layout;moved:boolean};
 private cleanups:(()=>void)[]=[];
 constructor(host:HTMLElement,scheme:Scheme=SCHEMES[0]){
  super(host,scheme);this.key=scheme.storageKey;this.outline.visible=false;this.outline.renderOrder=999;const m=this.outline.material as T.LineBasicMaterial;m.depthTest=false;this.scene.add(this.outline);
  const canvas=this.renderer.domElement;
  const down=(e:PointerEvent)=>this.down(e),move=(e:PointerEvent)=>this.move(e),up=(e:PointerEvent)=>this.up(e);
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',up,true);
  const keys=(e:KeyboardEvent)=>{
   if(this.roaming||this.readOnly)return;
   const el=e.target as HTMLElement;if(el.matches('input,select,textarea')||el.isContentEditable)return;
   if(e.key==='Delete'||e.key==='Backspace'){if(this.selectedEntity){e.preventDefault();this.removeSelected();}}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?this.redo():this.undo();}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();this.redo();}
   if(e.key==='Escape')this.select(null);
  };
  document.addEventListener('keydown',keys);
  const dragover=(e:DragEvent)=>{if(e.dataTransfer?.types.includes('application/x-home-furniture'))e.preventDefault();};
  const drop=(e:DragEvent)=>{if(this.roaming)return;const id=e.dataTransfer?.getData('application/x-home-furniture');if(id){e.preventDefault();this.addCatalog(id,e.clientX,e.clientY);}};
  canvas.addEventListener('dragover',dragover);canvas.addEventListener('drop',drop);
  this.cleanups.push(()=>{canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',up,true);document.removeEventListener('keydown',keys);canvas.removeEventListener('dragover',dragover);canvas.removeEventListener('drop',drop);});
 }
 override async load(progress:(n:number)=>void){
  await super.load(progress);
  const groups=new Map<string,{meshes:T.Mesh[];name:string;room:string}>();
  for(const p of this.parts){
   let o:T.Object3D|null=p.mesh;while(o&&!o.userData['entityId'])o=o.parent;
   if(!o)continue;
   const id=o.userData['entityId'];if(!groups.has(id))groups.set(id,{meshes:[],name:o.userData['entityName'],room:p.room});groups.get(id)!.meshes.push(p.mesh);
  }
  for(const [id,data] of groups){
   const box=new T.Box3();for(const o of data.meshes)box.expandByObject(o);
   const center=box.getCenter(new T.Vector3());const g=new T.Group();g.name=data.name;g.position.set(center.x,0,center.z);g.userData['furnitureId']=id;this.model.add(g);g.updateMatrixWorld(true);
   for(const m of data.meshes)g.attach(m);
   const en:Entity={id,name:data.name,room:data.room,group:g,original:true,deleted:false};this.entities.set(id,en);
   // One room/layer/visibility owner for every component, including parts crossing a room edge.
   for(const p of this.parts)if(data.meshes.includes(p.mesh)){p.room=data.room;p.rooms=[data.room];p.cutaway='';}
  }
  this.initial=this.snapshot();
  try{
   this.legacyBackup=localStorage.getItem(this.key+':before-assemblies-v2')??'';
   const s=localStorage.getItem(this.key);
   if(s){
    const parsed=JSON.parse(s),data=this.validate(parsed);
    const upgraded=(parsed.modelRevision??1)<(this.project.revision??1);
    if(upgraded){const key=this.key+':before-model-revision-'+this.project.revision;if(!localStorage.getItem(key))localStorage.setItem(key,s);}
    if(parsed.version===1&&!this.legacyBackup){this.legacyBackup=s;localStorage.setItem(this.key+':before-assemblies-v2',s);}
    this.applyLayout(data);
    if(parsed.version===1){localStorage.setItem(this.key,JSON.stringify(this.snapshot()));this.savedAt='已整合旧方案的家具部件 · 原存档已备份';}
    else if(upgraded){localStorage.setItem(this.key,JSON.stringify(this.snapshot()));this.savedAt='已更新柜体、内窗与玄关凹位 · 保留原布置';}
    else this.savedAt='已恢复上次保存的方案';
   }
  }catch{this.savedAt='已载入初始方案；旧存档未使用';}
  this.notify();
 }
 private entity(){return !this.readOnly&&!this.objectsLocked&&this.selectedEntity?this.entities.get(this.selectedEntity):undefined;}
 setObjectsLocked(value:boolean){
  this.lockedObjects=value;
  if(value){
   const drag=this.drag;this.drag=undefined;
   if(drag){
    if(this.renderer.domElement.hasPointerCapture(drag.pointerId))this.renderer.domElement.releasePointerCapture(drag.pointerId);
    this.controls.enabled=!this.roaming;this.applyLayout(drag.before);
   }
   this.select(null);
  }
 }
 private rayAt(x:number,y:number){
  const r=this.renderer.domElement.getBoundingClientRect();this.picker.setFromCamera(new T.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),this.camera);
 }
 private hitFloor(x:number,y:number){this.rayAt(x,y);return this.picker.ray.intersectPlane(this.plane,new T.Vector3());}
 private down(e:PointerEvent){
  if(this.readOnly||this.objectsLocked||this.roaming||!this.editEnabled||e.button!==0||!this.project||e.altKey)return;
  this.rayAt(e.clientX,e.clientY);
  const objects=[...this.entities.values()].filter(en=>!en.deleted&&this.states[en.room]?.visible&&this.states[en.room]?.decorated).map(en=>en.group);
  const hit=this.picker.intersectObjects(objects,true).find(h=>h.object.visible);if(!hit){this.select(null);return;}
  let o:T.Object3D|null=hit.object;while(o&&!o.userData['furnitureId'])o=o.parent;if(!o)return;
  const id=o.userData['furnitureId'];this.select(id);
  const pt=this.hitFloor(e.clientX,e.clientY);if(!pt)return;
  this.drag={id,pointerId:e.pointerId,offset:this.entities.get(id)!.group.position.clone().sub(pt),start:{x:e.clientX,y:e.clientY},before:this.snapshot(),moved:false};
  this.controls.enabled=false;e.stopImmediatePropagation();this.renderer.domElement.setPointerCapture(e.pointerId);
 }
 private move(e:PointerEvent){
  if(!this.drag)return;e.stopImmediatePropagation();
  if(!this.drag.moved&&Math.hypot(e.clientX-this.drag.start.x,e.clientY-this.drag.start.y)<4)return;
  const p=this.hitFloor(e.clientX,e.clientY);if(!p)return;this.drag.moved=true;p.add(this.drag.offset);
  const en=this.entities.get(this.drag.id)!;en.group.position.x=Math.round(p.x*20)/20;en.group.position.z=Math.round(p.z*20)/20;
  en.group.updateMatrixWorld(true);this.outline.setFromObject(en.group);this.renderer.shadowMap.needsUpdate=true;
 }
 private up(e:PointerEvent){
  if(!this.drag)return;e.stopImmediatePropagation();const d=this.drag;this.drag=undefined;this.controls.enabled=true;
  if(this.renderer.domElement.hasPointerCapture(e.pointerId))this.renderer.domElement.releasePointerCapture(e.pointerId);
  if(d.moved){const en=this.entities.get(d.id)!;this.updateEntityRoom(en);this.undoStack.push(d.before);this.redoStack=[];this.commit('家具位置已保存');}
 }
 private updateEntityRoom(en:Entity){
  const p=en.group.position;
  const contains=(poly:number[][])=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];if(((zi>p.z)!==(zj>p.z))&&p.x<(xj-xi)*(p.z-zi)/(zj-zi)+xi)yes=!yes;}return yes;};
  en.room=this.project.rooms.find(r=>contains(r.polygon))?.id??en.room;
  this.syncEntityRoom(en);
 }
 private syncEntityRoom(en:Entity){
  en.group.traverse(o=>{const part=this.parts.find(p=>p.mesh===o);if(part){part.room=en.room;part.rooms=[en.room];part.cutaway='';part.box.setFromObject(o);}});
 }
 select(id:string|null){
  if(id&&(this.readOnly||this.objectsLocked))return;
  this.selectedEntity=id;const en=this.entity();this.outline.visible=!!en&&!en.deleted&&this.states[en.room]?.visible&&this.states[en.room]?.decorated;
  if(en)this.outline.setFromObject(en.group);this.notify();
 }
 focusEntity(id:string){
  if(this.readOnly||this.objectsLocked)return;
  const en=this.entities.get(id);if(!en||en.deleted)return;
  this.states[en.room]={visible:true,decorated:true};this.applyStates();this.navigate(en.room);this.select(id);
 }
 private before(){if(this.readOnly)return;this.undoStack.push(this.snapshot());if(this.undoStack.length>60)this.undoStack.shift();this.redoStack=[];}
 private commit(message:string){
  this.applyStates();this.renderer.shadowMap.needsUpdate=true;
  if(this.entity())this.outline.setFromObject(this.entity()!.group);
  if(this.readOnly){this.notify();return;}
  const layout=this.snapshot();
  try{localStorage.setItem(this.key,JSON.stringify(layout));this.savedAt=message+' · 本地已保存';}catch{this.savedAt='浏览器存储不可用，请导出方案文件';}
  this.onLayoutChange(layout);
  this.notify();
 }
 private notify(){
  const en=this.entity();const visible=en&&!en.deleted;
  this.onEdit({selection:visible?{id:en.id,name:en.name,room:en.room,x:en.group.position.x,z:en.group.position.z,angle:en.group.rotation.y*180/Math.PI,scale:en.group.scale.x,color:en.color??''}:null,
   undo:this.undoStack.length,redo:this.redoStack.length,count:[...this.entities.values()].filter(x=>!x.deleted).length,message:this.savedAt,legacyBackup:!!this.legacyBackup,
   items:[...this.entities.values()].filter(x=>!x.deleted).map(x=>({id:x.id,name:x.name,room:x.room}))});
 }
 addCatalog(id:string,x?:number,y?:number){
  if(this.readOnly||this.objectsLocked)return;
  const spec=CATALOG.find(x=>x.id===id);if(!spec)return;
  this.before();const room=this.project.rooms.find(r=>r.id===this.selected)??this.project.rooms[0];
  const pos=x!==undefined&&y!==undefined?this.hitFloor(x,y):new T.Vector3(room.center[0],0,room.center[2]);if(!pos)return;
  const eid='add-'+crypto.randomUUID();const en:Entity={id:eid,name:spec.name,room:room.id,catalogId:id,group:makeFurniture(id),original:false,deleted:false};
  en.group.position.copy(pos);this.register(en);this.updateEntityRoom(en);this.states[en.room]={visible:true,decorated:true};this.select(eid);this.commit('已添加 '+spec.name);
 }
 private register(en:Entity){
  en.group.userData['furnitureId']=en.id;this.model.add(en.group);en.group.updateMatrixWorld(true);
  en.group.traverse(o=>{if(o instanceof T.Mesh)this.parts.push({mesh:o,room:en.room,rooms:[en.room],layer:'decor',cutaway:'',box:new T.Box3().setFromObject(o),original:o.material});});
  this.entities.set(en.id,en);
 }
 removeSelected(){const en=this.entity();if(!en)return;this.before();en.deleted=true;en.group.visible=false;this.select(null);this.commit('已删除家具，可撤销');}
 duplicate(){
  const src=this.entity();if(!src)return;this.before();
  const en:Entity={...src,id:'copy-'+crypto.randomUUID(),group:src.group.clone(true),original:false,sourceId:src.original?src.id:src.sourceId,deleted:false};
  en.group.position.x+=.45;en.group.position.z+=.45;this.register(en);this.updateEntityRoom(en);this.select(en.id);this.commit('已复制家具');
 }
 setTransform(key:'x'|'z'|'angle'|'scale',value:number){
  const en=this.entity();if(!en||!Number.isFinite(value))return;
  this.before();
  if(key==='x'||key==='z')en.group.position[key]=T.MathUtils.clamp(value,-30,30);
  if(key==='angle')en.group.rotation.y=value*Math.PI/180;
  if(key==='scale')en.group.scale.setScalar(T.MathUtils.clamp(value,.3,3));
  en.group.updateMatrixWorld(true);this.updateEntityRoom(en);this.commit('家具参数已更新');
 }
 rotate(delta:number){const en=this.entity();if(en)this.setTransform('angle',en.group.rotation.y*180/Math.PI+delta);}
 setColor(color:string){
  const en=this.entity();if(!en||!/^#[0-9a-f]{6}$/i.test(color))return;this.before();en.color=color;this.paint(en);this.commit('家具配色已更新');
 }
 private paint(en:Entity){
  en.group.traverse(o=>{
   if(!(o instanceof T.Mesh))return;
   const part=this.parts.find(p=>p.mesh===o);if(!part)return;
   const originals=Array.isArray(part.original)?part.original:[part.original];
   const mats=originals.map(m=>{
    const mm=m as T.MeshStandardMaterial;if(!en.color||mm.metalness>.5||mm.transparent)return m;
    const copy=mm.clone();copy.color.set(en.color);copy.map=null;return copy;
   });
   o.material=Array.isArray(part.original)?mats:mats[0];
  });
 }
 override setRoom(id:string,key:'visible'|'decorated',value:boolean){if(!this.initial){super.setRoom(id,key,value);return;}this.before();super.setRoom(id,key,value);this.commit('房间状态已更新');}
 override setAllDecor(value:boolean){if(!this.initial){super.setAllDecor(value);return;}this.before();super.setAllDecor(value);this.commit(value?'显示全屋装修':'切换为清水房');}
 override setAllVisible(){if(!this.initial){super.setAllVisible();return;}this.before();super.setAllVisible();this.commit('全部房间已恢复');}
 override applyStates(){super.applyStates();for(const en of this.entities.values())en.group.visible=!en.deleted;const en=this.entity();this.outline.visible=!!en&&!en.deleted&&!!this.states[en.room]?.visible&&!!this.states[en.room]?.decorated;}
 snapshot():Layout{return {format:'home-simulator',version:2,modelVersion:this.project.version,modelRevision:this.project.revision??1,rooms:structuredClone(this.states),entities:[...this.entities.values()].map(en=>({id:en.id,sourceId:en.sourceId,catalogId:en.catalogId,room:en.room,position:en.group.position.toArray(),rotation:en.group.rotation.y,scale:en.group.scale.x,deleted:en.deleted,color:en.color}))};}
 private applyLayout(data:Layout){
  this.select(null);
  for(const [id,en] of this.entities){if(!en.original){const set=new Set<T.Object3D>();en.group.traverse(o=>set.add(o));this.parts=this.parts.filter(p=>!set.has(p.mesh));this.model.remove(en.group);this.entities.delete(id);}}
  for(const state of data.entities){
   let en=this.entities.get(state.id);
   if(!en){
    const source=state.sourceId?this.entities.get(state.sourceId):null;
    if(!source&&!state.catalogId)continue;
    const spec=CATALOG.find(c=>c.id===state.catalogId);
    en={id:state.id,name:source?.name??spec!.name,group:source?source.group.clone(true):makeFurniture(state.catalogId!),room:state.room,sourceId:state.sourceId,catalogId:state.catalogId,original:false,deleted:state.deleted};
    this.register(en);
   }
   en.room=state.room;en.group.position.fromArray(state.position);en.group.rotation.set(0,state.rotation,0);en.group.scale.setScalar(state.scale);en.deleted=state.deleted;en.color=state.color;
   en.group.updateMatrixWorld(true);this.syncEntityRoom(en);this.paint(en);
  }
  this.states=structuredClone(data.rooms);this.applyStates();
 }
 undo(){if(this.readOnly)return;const old=this.undoStack.pop();if(!old)return;this.redoStack.push(this.snapshot());this.applyLayout(old);this.commit('已撤销');}
 redo(){if(this.readOnly)return;const next=this.redoStack.pop();if(!next)return;this.undoStack.push(this.snapshot());this.applyLayout(next);this.commit('已重做');}
 reset(){if(this.readOnly)return;this.before();this.applyLayout(this.initial);this.commit('已恢复初始布置，可撤销');}
 validate(data:unknown):Layout{
  const d=data as Layout;
  if(!d||d.format!=='home-simulator'||![1,2].includes(d.version)||!Array.isArray(d.entities)||d.entities.length>600||!d.rooms)throw new Error('方案文件格式不匹配。');
  if(d.modelVersion!==this.project.version)throw new Error('此文件属于另一套户型或模型版本，请先切换到对应方案再导入。');
  const legacy=d.version===1;
  if(legacy&&(!this.project.assemblies||!this.project.legacyEntities))throw new Error('此模型缺少旧版方案迁移信息。');
  const originalIds=new Set(legacy?this.project.legacyEntities!.map(e=>e.id):[...this.entities.values()].filter(e=>e.original).map(e=>e.id));
  const ids=new Set<string>();
  for(const e of d.entities){
   if(typeof e.id!=='string'||ids.has(e.id)||!this.states[e.room]||!Array.isArray(e.position)||e.position.length!==3||!e.position.every(v=>Number.isFinite(v)&&Math.abs(v)<100)||!Number.isFinite(e.rotation)||!Number.isFinite(e.scale)||e.scale<.3||e.scale>3||typeof e.deleted!=='boolean'||(e.color&&!/^#[0-9a-f]{6}$/i.test(e.color)))throw new Error('方案含无效家具参数。');
   if(e.catalogId&&!CATALOG.some(x=>x.id===e.catalogId))throw new Error('方案包含不支持的家具样式。');
   if(e.sourceId&&!originalIds.has(e.sourceId))throw new Error('方案引用的原始家具不存在。');
   if(!originalIds.has(e.id)&&!e.catalogId&&!e.sourceId)throw new Error('方案缺少家具来源。');
   ids.add(e.id);
  }
  for(const r of this.project.rooms){const state=d.rooms[r.id];if(!state||typeof state.visible!=='boolean'||typeof state.decorated!=='boolean')throw new Error('方案缺少房间状态。');}
  if(!legacy){const upgraded=upgradeModelLayout(d,this.initial,this.project.layoutUpdate);if(upgraded!==d)return this.validate(upgraded);}
  for(const id of originalIds)if(!ids.has(id))throw new Error('方案缺少原始家具记录。');
  if(legacy){
   const bases=new Map(this.initial.entities.map(e=>[e.id,e.position]));
   return this.validate(migrateLegacyLayout(d,this.project.assemblies!,this.project.legacyEntities!,bases));
  }
  return d;
 }
 importLayout(data:unknown){if(this.readOnly)throw new Error('请先登录再导入方案。');const valid=this.validate(data);this.before();this.applyLayout(valid);this.commit('方案已导入');}
 restoreLayout(data:unknown){
  const valid=this.validate(data);this.applyLayout(valid);this.undoStack=[];this.redoStack=[];
  this.renderer.shadowMap.needsUpdate=true;
  try{
   const old=localStorage.getItem(this.key);
   if(old&&!localStorage.getItem(this.key+':before-cloud'))localStorage.setItem(this.key+':before-cloud',old);
   localStorage.setItem(this.key,JSON.stringify(this.snapshot()));
  }catch{}
  this.savedAt='已恢复方案布置';this.notify();
 }
 initialLayout(){return structuredClone(this.initial);}
 exportLayout(){const blob=new Blob([JSON.stringify(this.snapshot(),null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=this.scheme.name+'-我的布置.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 exportLegacyBackup(){if(!this.legacyBackup)return;const u=URL.createObjectURL(new Blob([this.legacyBackup],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='家具合并前的原始方案.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 async exportGlb(){
  const copy=this.model.clone(true),originalNodes:T.Object3D[]=[],copyNodes:T.Object3D[]=[];
  this.model.traverse(o=>originalNodes.push(o));copy.traverse(o=>copyNodes.push(o));
  const partMap=new Map(this.parts.map(p=>[p.mesh as T.Object3D,p]));
  copyNodes.forEach((o,i)=>{
   const p=partMap.get(originalNodes[i]);
   if(p){
    o.visible=p.rooms.some(id=>this.states[id]?.visible);
    if(['decor','finish','greenery'].includes(p.layer))o.visible&&=this.states[p.room]?.decorated??true;
    o.userData['room']=p.room;o.userData['rooms']=p.rooms;
   }
   const id=o.userData['furnitureId'];if(id)o.visible=!this.entities.get(id)?.deleted;
  });
  const scenery=this.exterior.clone(true);scenery.visible=true;copy.add(scenery);
  const result=await new GLTFExporter().parseAsync(copy,{binary:true,onlyVisible:true,trs:true});
  const blob=new Blob([result as ArrayBuffer],{type:'model/gltf-binary'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=this.scheme.name+'-我的布置.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  this.savedAt='已导出当前三维方案';this.notify();
 }
 componentDebug(id:string){const en=this.entities.get(id);if(!en)return null;en.group.updateWorldMatrix(true,true);const parts:unknown[]=[];en.group.traverse(o=>{if(o instanceof T.Mesh){const p=this.parts.find(p=>p.mesh===o);parts.push({id:o.uuid,room:p?.room,local:o.matrix.toArray(),world:o.matrixWorld.toArray(),visible:en.group.visible&&o.visible,material:(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name)});}});return {id,name:en.name,transform:en.group.matrixWorld.toArray(),parts};}
 override debug(){return {...super.debug(),selection:this.selectedEntity,history:{undo:this.undoStack.length,redo:this.redoStack.length},entities:[...this.entities.values()].map(e=>{const center=new T.Box3().setFromObject(e.group).getCenter(new T.Vector3());const v=center.project(this.camera);const rect=this.renderer.domElement.getBoundingClientRect();return {id:e.id,name:e.name,room:e.room,deleted:e.deleted,position:e.group.position.toArray(),rotation:e.group.rotation.y,scale:e.group.scale.x,screen:[rect.left+(v.x*.5+.5)*rect.width,rect.top+(-v.y*.5+.5)*rect.height]};})};}
 override destroy(){for(const fn of this.cleanups)fn();this.outline.geometry.dispose();(this.outline.material as T.Material).dispose();super.destroy();}
}
