import * as T from 'three';
import { HomeViewer } from './viewer';
import { catalogItem, makeFurniture, loadCatalog } from './catalog';
import {loadFurnitureModel,disposeFurnitureModel,libraryCacheStats} from './model-library';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { migrateLegacyLayout, upgradeModelLayout, type SavedEntity, type Layout } from './layout';
import { SCHEMES, type Scheme } from './schemes';
import { makeWall, validateWalls, validateOpenings, withOpeningIds, validateFinishes, wallChanged, wallDistance, wallLength, transformWall, resizeWall, DEFAULT_FINISH, type WallRecord, type WallOpening, type RoomFinish, type WallResizeHandle } from './architecture';
import { inPolygon } from './walk-motion';
import { validateBrief } from './design-engine';
export type { Layout } from './layout';
type Entity={id:string;name:string;group:T.Group;room:string;sourceId?:string;catalogId?:string;original:boolean;deleted:boolean;color?:string};
export type Selection={id:string;name:string;room:string;x:number;y:number;z:number;angle:number;scale:number;color:string;catalogId?:string;modelStatus?:string};
export type EditorStatus={selection:Selection|null;undo:number;redo:number;count:number;message:string;legacyBackup?:boolean;items:{id:string;name:string;room:string}[]};
export type ArchitectureStatus={tool:'off'|'select'|'draw';selection:WallRecord|null;walls:WallRecord[];message:string;pending:boolean;dragging:boolean;openingWall:WallRecord|null;openingId:string|null};
export class HomeEditor extends HomeViewer {
 entities=new Map<string,Entity>();
 private closed=false;
 private modelLoads=new Map<string,Promise<void>>();
 onModelError=(_message:string)=>{};
 selectedEntity:string|null=null;
 editEnabled=true;
 readOnly=false;
 setReadOnly(value:boolean){this.readOnly=value;if(value){this.setObjectsLocked(true);this.setWallTool('off');}}
 wallRecords:WallRecord[]=[];
 wallTool:'off'|'select'|'draw'='off';
 selectedWall:string|null=null;
 private openingWallId:string|null=null;
 private selectedOpeningId:string|null=null;
 private openingEdit?:{before:Layout;wall:WallRecord;selection:string|null};
 onArchitecture=(_s:ArchitectureStatus)=>{};
 private wallMessage='';private wallStart?:number[];
 private wallGuides=new T.Group();
 private preview?:T.Line;
 private wallDrag?:{pointerId:number;original:WallRecord;start:number[];screen:number[];before:Layout;rotating:boolean;resize?:WallResizeHandle;moved:boolean};
 private guidePixelScale=0;
 private lockedObjects=false;
 get objectsLocked(){return this.lockedObjects;}
 onEdit=(_s:EditorStatus)=>{};
 onLayoutChange=(_layout:Layout)=>{};
 private undoStack:Layout[]=[];private redoStack:Layout[]=[];
 private key:string;
 private initial!:Layout;
 private designMetadata?:Layout['design'];
 private savedAt='';
 private legacyBackup='';
 private picker=new T.Raycaster();
 private plane=new T.Plane(new T.Vector3(0,1,0),0);
 private outline=new T.BoxHelper(new T.Object3D(),0x007aff);
 private drag?:{id:string;pointerId:number;offset:T.Vector3;start:{x:number;y:number};before:Layout;moved:boolean};
 private cleanups:(()=>void)[]=[];
 constructor(host:HTMLElement,scheme:Scheme=SCHEMES[0]){
  super(host,scheme);this.key=scheme.storageKey;this.outline.visible=false;this.outline.renderOrder=999;const m=this.outline.material as T.LineBasicMaterial;m.depthTest=false;this.scene.add(this.outline);
  this.scene.add(this.wallGuides);
  const zoomGuides=()=>{if(this.wallTool!=='off'&&Math.abs(this.wallPixelScale()-this.guidePixelScale)>.000001)this.drawWallGuides();};
  this.controls.addEventListener('change',zoomGuides);this.cleanups.push(()=>this.controls.removeEventListener('change',zoomGuides));
  const canvas=this.renderer.domElement;
  const down=(e:PointerEvent)=>this.down(e),move=(e:PointerEvent)=>this.move(e),up=(e:PointerEvent)=>this.up(e);
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',up,true);
  const cancelWall=()=>{this.finishWallDrag(false);this.finishOpeningEdit(false);};window.addEventListener('blur',cancelWall);this.cleanups.push(()=>window.removeEventListener('blur',cancelWall));
  const openFace=(e:MouseEvent)=>{
   if(this.roaming||!this.project?.walls||this.wallTool==='draw')return;
   this.rayAt(e.clientX,e.clientY);const hit=this.picker.intersectObjects(this.parts.filter(p=>!p.disabled&&p.mesh.visible&&p.wallId).map(p=>p.mesh),false)[0];
   if(hit?.object.userData['wallId'])this.openWallOpenings(hit.object.userData['wallId'],hit.object.userData['openingId']);
  };
  canvas.addEventListener('dblclick',openFace);this.cleanups.push(()=>canvas.removeEventListener('dblclick',openFace));
  const keys=(e:KeyboardEvent)=>{
   if(this.roaming||this.readOnly||this.openingWallId)return;
   const el=e.target as HTMLElement;if(el.matches('input,select,textarea')||el.isContentEditable)return;
   if(e.key==='Tab'){
    const en=this.entity();
    if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.isComposing||!this.editEnabled||this.wallTool!=='off'||this.drag||!en||en.deleted||!this.states[en.room]?.visible||!this.states[en.room]?.decorated||document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]'))return;
    e.preventDefault();
    // One physical press is one undoable turn; holding Tab must not spin continuously.
    if(!e.repeat)this.rotate(90);
    return;
   }
   if(e.key==='Delete'||e.key==='Backspace'){if(this.wallTool!=='off'&&this.selectedWall){e.preventDefault();this.deleteWall();}else if(this.selectedEntity){e.preventDefault();this.removeSelected();}}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?this.redo():this.undo();}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();this.redo();}
   if(e.key==='Escape'){if(this.wallTool!=='off'){this.wallStart=undefined;this.setWallTool('select');}this.select(null);}
  };
  document.addEventListener('keydown',keys);
  const dragover=(e:DragEvent)=>{if(e.dataTransfer?.types.includes('application/x-home-furniture'))e.preventDefault();};
  const drop=(e:DragEvent)=>{if(this.roaming)return;const id=e.dataTransfer?.getData('application/x-home-furniture');if(id){e.preventDefault();this.addCatalog(id,e.clientX,e.clientY);}};
  canvas.addEventListener('dragover',dragover);canvas.addEventListener('drop',drop);
  this.cleanups.push(()=>{canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',up,true);document.removeEventListener('keydown',keys);canvas.removeEventListener('dragover',dragover);canvas.removeEventListener('drop',drop);});
 }
 override async load(progress:(n:number)=>void){
  await Promise.all([super.load(progress),loadCatalog()]);
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
  this.wallRecords=withOpeningIds(this.project.walls??[]);
  for(const p of this.parts.filter(p=>p.wallId&&['window','door'].includes(p.layer))){
   const w=this.wallRecords.find(w=>w.id===p.wallId);if(!w)continue;
   const c=p.box.getCenter(new T.Vector3()),L=wallLength(w),t=((c.x-w.a[0])*(w.b[0]-w.a[0])+(c.z-w.a[1])*(w.b[1]-w.a[1]))/L;
   const o=w.openings.find(o=>t>=o.start-.04&&t<=o.end+.04&&c.y>=o.bottom-.04&&c.y<=o.top+.04);
   if(o)p.mesh.userData['openingId']=o.id;
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
    else if(upgraded){localStorage.setItem(this.key,JSON.stringify(this.snapshot()));this.savedAt='已更新户型细节 · 保留已保存的布置';}
    else this.savedAt='已恢复上次保存的方案';
   }
  }catch{this.savedAt='已载入初始方案；旧存档未使用';}
  this.notify();this.notifyWalls();
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
  if(this.openingWallId)return;
  if(this.wallTool!=='off'&&this.mode==='plan'&&e.button===0&&!this.readOnly){this.wallPointer(e);return;}
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
  if(this.wallDrag){this.moveWallPointer(e);return;}
  if(this.wallTool==='select'&&this.mode==='plan')this.wallCursor(e);
  if(this.wallTool==='draw'&&this.wallStart&&this.mode==='plan'){const p=this.hitFloor(e.clientX,e.clientY);if(p)this.drawPreview([p.x,p.z],e.shiftKey);}
  if(!this.drag)return;e.stopImmediatePropagation();
  if(!this.drag.moved&&Math.hypot(e.clientX-this.drag.start.x,e.clientY-this.drag.start.y)<4)return;
  const p=this.hitFloor(e.clientX,e.clientY);if(!p)return;this.drag.moved=true;p.add(this.drag.offset);
  const en=this.entities.get(this.drag.id)!;en.group.position.x=Math.round(p.x*20)/20;en.group.position.z=Math.round(p.z*20)/20;
  en.group.updateMatrixWorld(true);this.outline.setFromObject(en.group);this.renderer.shadowMap.needsUpdate=true;
 }
 private up(e:PointerEvent){
  if(this.wallDrag){e.stopImmediatePropagation();this.finishWallDrag(e.type!=='pointercancel');return;}
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
  this.selectedEntity=id;this.updateOutline();this.notify();
 }
 focusEntity(id:string){
  if(this.readOnly||this.objectsLocked)return;
  const en=this.entities.get(id);if(!en||en.deleted)return;
  this.states[en.room]={visible:true,decorated:true};this.applyStates();this.navigate(en.room);this.select(id);
 }
 private before(){if(this.readOnly)return;this.undoStack.push(this.snapshot());if(this.undoStack.length>60)this.undoStack.shift();this.redoStack=[];}
 private commit(message:string){
  this.applyStates();this.renderer.shadowMap.needsUpdate=true;
  this.updateOutline();
  if(this.readOnly){this.notify();return;}
  const layout=this.snapshot();
  try{localStorage.setItem(this.key,JSON.stringify(layout));this.savedAt=message+' · 本地已保存';}catch{this.savedAt='浏览器存储不可用，请导出方案文件';}
  this.onLayoutChange(layout);
  this.notify();
 }
 private notify(){
  const en=this.entity();const visible=en&&!en.deleted;
  this.onEdit({selection:visible?{id:en.id,name:en.name,room:en.room,x:en.group.position.x,y:en.group.position.y,z:en.group.position.z,angle:en.group.rotation.y*180/Math.PI,scale:en.group.scale.x,color:en.color??'',catalogId:en.catalogId,modelStatus:en.group.userData['modelRetired']?'retired':en.group.userData['modelError']?'error':en.group.userData['modelPending']?'loading':'ready'}:null,
   undo:this.undoStack.length,redo:this.redoStack.length,count:[...this.entities.values()].filter(x=>!x.deleted).length,message:this.savedAt,legacyBackup:!!this.legacyBackup,
   items:[...this.entities.values()].filter(x=>!x.deleted).map(x=>({id:x.id,name:(x.group.userData['modelRetired']?'待替换 · ':'')+x.name,room:x.room}))});
  this.notifyWalls();
 }
 addCatalog(id:string,x?:number,y?:number,color?:string){
  if(this.readOnly||this.objectsLocked)return;
  this.setWallTool('off');
  const spec=catalogItem(id);if(!spec||spec.retired||!spec.model)return;
  if([...this.entities.values()].filter(e=>!e.deleted).length>=500){this.onModelError('单个方案最多放置500件家具，请先删除部分物件。');return;}
  this.before();const room=this.project.rooms.find(r=>r.id===this.selected)??this.project.rooms[0];
  const pos=x!==undefined&&y!==undefined?this.hitFloor(x,y):new T.Vector3(room.center[0],0,room.center[2]);if(!pos)return;
  const eid='add-'+crypto.randomUUID();const en:Entity={id:eid,name:spec.name,room:room.id,catalogId:id,group:makeFurniture(id),original:false,deleted:false,color};
  en.group.position.copy(pos);en.group.position.y=spec.elevation??0;this.register(en);this.paint(en);this.updateEntityRoom(en);this.states[en.room]={visible:true,decorated:true};this.select(eid);this.commit('已添加 '+spec.name);
 }
 private register(en:Entity){
  en.group.userData['furnitureId']=en.id;this.model.add(en.group);en.group.updateMatrixWorld(true);
  en.group.traverse(o=>{if(o instanceof T.Mesh)this.parts.push({mesh:o,room:en.room,rooms:[en.room],layer:'decor',cutaway:'',box:new T.Box3().setFromObject(o),original:o.material});});
  this.entities.set(en.id,en);
  if(en.group.userData['modelPending'])this.hydrate(en);
 }
 private hydrate(en:Entity){
  const spec=catalogItem(en.catalogId);if(!spec?.model||this.closed)return;
  const group=en.group;group.userData['modelError']=false;
  const job=loadFurnitureModel(spec.model).then(model=>{
   if(this.closed||this.entities.get(en.id)!==en){disposeFurnitureModel(model);return;}
   const old=new Set<T.Object3D>();group.traverse(o=>old.add(o));this.parts=this.parts.filter(p=>!old.has(p.mesh));
   disposeFurnitureModel(group);group.clear();group.add(model);group.userData['modelPending']=false;group.updateMatrixWorld(true);
   model.traverse(o=>{if(o instanceof T.Mesh)this.parts.push({mesh:o,room:en.room,rooms:[en.room],layer:'decor',cutaway:'',box:new T.Box3().setFromObject(o),original:o.material});});
   this.paint(en);this.applyStates();this.renderer.shadowMap.needsUpdate=true;if(this.entity()===en)this.outline.setFromObject(group);this.notify();
  }).catch(()=>{if(!this.closed&&this.entities.get(en.id)===en){group.userData['modelError']=true;if(!en.deleted)this.onModelError(en.name+'：模型加载失败，可在选中物件面板重试。');this.notify();}}).finally(()=>{if(this.modelLoads.get(en.id)===job)this.modelLoads.delete(en.id);});
  this.modelLoads.set(en.id,job);
 }
 retrySelectedModel(){const en=this.entity();if(en&&!this.modelLoads.has(en.id)&&en.group.userData['modelPending'])this.hydrate(en);}
 replaceCatalog(id:string){
  const old=this.entity(),spec=catalogItem(id);if(!old||old.original||!old.catalogId||!spec?.model||spec.retired)return false;
  this.before();const group=makeFurniture(id);group.position.copy(old.group.position);group.quaternion.copy(old.group.quaternion);group.scale.copy(old.group.scale);
  const nodes=new Set<T.Object3D>();old.group.traverse(o=>nodes.add(o));this.parts=this.parts.filter(p=>!nodes.has(p.mesh));
  this.model.remove(old.group);disposeFurnitureModel(old.group);this.entities.delete(old.id);
  const en:Entity={...old,name:spec.name,catalogId:id,sourceId:undefined,group,color:undefined};
  this.register(en);this.select(en.id);this.commit('已替换家具，保留位置与朝向');return true;
 }
 removeSelected(){const en=this.entity();if(!en)return;this.before();en.deleted=true;en.group.visible=false;this.select(null);this.commit('已删除家具，可撤销');}
 duplicate(){
  const src=this.entity();if(!src||src.group.userData['modelRetired'])return;this.before();
  const copy=src.catalogId?makeFurniture(src.catalogId):src.group.clone(true);if(src.catalogId){copy.position.copy(src.group.position);copy.quaternion.copy(src.group.quaternion);copy.scale.copy(src.group.scale);}
  const en:Entity={...src,id:'copy-'+crypto.randomUUID(),group:copy,original:false,sourceId:src.original?src.id:src.sourceId,deleted:false};
  en.group.position.x+=.45;en.group.position.z+=.45;this.register(en);this.paint(en);this.updateEntityRoom(en);this.select(en.id);this.commit('已复制家具');
 }
 setTransform(key:'x'|'y'|'z'|'angle'|'scale',value:number){
  const en=this.entity();if(!en||!Number.isFinite(value))return;
  this.before();
  if(key==='x'||key==='z')en.group.position[key]=T.MathUtils.clamp(value,-30,30);
  if(key==='y')en.group.position.y=T.MathUtils.clamp(value,0,this.project.height);
  if(key==='angle')en.group.rotation.y=value*Math.PI/180;
  if(key==='scale')en.group.scale.setScalar(T.MathUtils.clamp(value,.3,3));
  en.group.updateMatrixWorld(true);this.updateEntityRoom(en);this.commit('家具参数已更新');
 }
 rotate(delta:number){const en=this.entity();if(en)this.setTransform('angle',en.group.rotation.y*180/Math.PI+delta);}
 setColor(color:string){
  const en=this.entity();if(!en||en.catalogId||!/^#[0-9a-f]{6}$/i.test(color))return;this.before();en.color=color;this.paint(en);this.commit('家具配色已更新');
 }
 private paint(en:Entity){
  en.group.traverse(o=>{
   if(!(o instanceof T.Mesh))return;
   const part=this.parts.find(p=>p.mesh===o);if(!part)return;
   const originals=Array.isArray(part.original)?part.original:[part.original];
   const mats=originals.map(m=>{
    const mm=m as T.MeshStandardMaterial;if(en.catalogId||!en.color||mm.metalness>.5||mm.transparent)return m;
    const copy=mm.clone();copy.color.set(en.color);return copy;
   });
   const previous=Array.isArray(o.material)?o.material:[o.material];
   for(const m of previous)if(!originals.includes(m))m.dispose();
   o.material=Array.isArray(part.original)?mats:mats[0];
  });
 }
 override setRoom(id:string,key:'visible'|'decorated',value:boolean){if(!this.initial){super.setRoom(id,key,value);return;}this.before();super.setRoom(id,key,value);this.commit('房间状态已更新');}
 override setAllDecor(value:boolean){if(!this.initial){super.setAllDecor(value);return;}this.before();super.setAllDecor(value);this.commit(value?'显示全屋装修':'切换为清水房');}
 override setAllVisible(){if(!this.initial){super.setAllVisible();return;}this.before();super.setAllVisible();this.commit('全部房间已恢复');}
 private updateOutline(){const en=this.entity();this.outline.visible=!!en&&!en.deleted&&!en.group.userData['modelPending']&&!en.group.userData['modelRetired']&&!!this.states[en.room]?.visible&&!!this.states[en.room]?.decorated;if(this.outline.visible)this.outline.setFromObject(en!.group);}
 override applyStates(){super.applyStates();for(const en of this.entities.values())en.group.visible=!en.deleted;this.updateOutline();if(this.wallTool!=='off')this.drawWallGuides();}
 snapshot():Layout{return {format:'home-simulator',version:2,modelVersion:this.project.version,modelRevision:this.project.revision??1,rooms:structuredClone(this.states),...(this.designMetadata?{design:structuredClone(this.designMetadata)}:{}),...(this.project.walls?{walls:structuredClone(this.wallRecords),finishes:structuredClone(this.finishes)}:{}),entities:[...this.entities.values()].map(en=>({id:en.id,sourceId:en.sourceId,catalogId:en.catalogId,room:en.room,position:en.group.position.toArray(),rotation:en.group.rotation.y,scale:en.group.scale.x,deleted:en.deleted,color:en.color}))};}
 private applyLayout(data:Layout){
  this.designMetadata=data.design?structuredClone(data.design):undefined;
  this.select(null);
  this.selectedWall=this.openingWallId;this.wallStart=undefined;
  if(this.project.walls){this.wallRecords=withOpeningIds(data.walls??this.project.walls);this.finishes=structuredClone(data.finishes??{});this.rebuildWalls();}
  if(this.openingWallId&&!this.wallRecords.some(w=>w.id===this.openingWallId&&!w.deleted)){this.openingWallId=null;this.selectedOpeningId=null;this.freezeView(false);}
  for(const [id,en] of this.entities){if(!en.original){const set=new Set<T.Object3D>();en.group.traverse(o=>set.add(o));this.parts=this.parts.filter(p=>!set.has(p.mesh));this.model.remove(en.group);if(en.catalogId)disposeFurnitureModel(en.group);this.entities.delete(id);}}
  for(const state of data.entities){
   let en=this.entities.get(state.id);
   if(!en){
    const source=state.sourceId?this.entities.get(state.sourceId):null;
    if(!source&&!state.catalogId)continue;
    const spec=catalogItem(state.catalogId);
    en={id:state.id,name:source?.name??spec!.name,group:source?source.group.clone(true):makeFurniture(state.catalogId!),room:state.room,sourceId:state.sourceId,catalogId:state.catalogId,original:false,deleted:state.deleted};
    this.register(en);
   }
   en.room=state.room;en.group.position.fromArray(state.position);en.group.rotation.set(0,state.rotation,0);en.group.scale.setScalar(state.scale);en.deleted=state.deleted;en.color=state.color;
   en.group.updateMatrixWorld(true);this.syncEntityRoom(en);this.paint(en);
  }
  this.states=structuredClone(data.rooms);this.applyStates();
 }
 undo(){if(this.readOnly)return;this.finishOpeningEdit(false);const old=this.undoStack.pop();if(!old)return;this.redoStack.push(this.snapshot());this.applyLayout(old);this.commit('已撤销');}
 redo(){if(this.readOnly)return;this.finishOpeningEdit(false);const next=this.redoStack.pop();if(!next)return;this.undoStack.push(this.snapshot());this.applyLayout(next);this.commit('已重做');}
 reset(){if(this.readOnly)return;this.before();this.applyLayout(this.initial);this.commit('已恢复初始布置，可撤销');}
 validate(data:unknown):Layout{
  const d=data as Layout;
  if(!d||d.format!=='home-simulator'||![1,2].includes(d.version)||!Array.isArray(d.entities)||d.entities.length>600||!d.rooms)throw new Error('方案文件格式不匹配。');
  if(d.modelVersion!==this.project.version)throw new Error('此文件属于另一套户型或模型版本，请先切换到对应方案再导入。');
  if(d.design){validateBrief(d.design.brief);if(!d.design.roomUses||Object.entries(d.design.roomUses).some(([id,use])=>!this.states[id]||typeof use!=='string'||use.length>300))throw Error('房间用途信息无效。');}
  const legacy=d.version===1;
  if(legacy&&(!this.project.assemblies||!this.project.legacyEntities))throw new Error('此模型缺少旧版方案迁移信息。');
  const originalIds=new Set(legacy?this.project.legacyEntities!.map(e=>e.id):[...this.entities.values()].filter(e=>e.original).map(e=>e.id));
  const ids=new Set<string>();
  for(const e of d.entities){
   if(typeof e.id!=='string'||ids.has(e.id)||!this.states[e.room]||!Array.isArray(e.position)||e.position.length!==3||!e.position.every(v=>Number.isFinite(v)&&Math.abs(v)<100)||!Number.isFinite(e.rotation)||!Number.isFinite(e.scale)||e.scale<.3||e.scale>3||typeof e.deleted!=='boolean'||(e.color&&!/^#[0-9a-f]{6}$/i.test(e.color)))throw new Error('方案含无效家具参数。');
   if(e.catalogId&&!catalogItem(e.catalogId))throw new Error('方案包含不支持的家具样式。');
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
  if(this.project.walls)return {...d,walls:validateWalls(d.walls,this.project.walls,this.project.rooms),finishes:validateFinishes(d.finishes,this.project.rooms.map(r=>r.id))};
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
  await Promise.all([...this.modelLoads.values(),this.waitForFinishTextures()]);
  if(this.closed)throw Error('方案已切换');
  if([...this.entities.values()].some(e=>!e.deleted&&e.group.userData['modelRetired']))throw Error('请先替换或删除已下架的家具，再导出 GLB。JSON 可保留全部位置记录。');
  if([...this.entities.values()].some(e=>!e.deleted&&e.group.userData['modelPending']))throw Error('请等待家具加载完成或重试失败的模型');
  const copy=this.model.clone(true),originalNodes:T.Object3D[]=[],copyNodes:T.Object3D[]=[];
  this.model.traverse(o=>originalNodes.push(o));copy.traverse(o=>copyNodes.push(o));
  const partMap=new Map(this.parts.map(p=>[p.mesh as T.Object3D,p]));
  copyNodes.forEach((o,i)=>{
   const p=partMap.get(originalNodes[i]);
   if(p){
    o.visible=!p.disabled&&p.rooms.some(id=>this.states[id]?.visible);
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
 componentDebug(id:string){const en=this.entities.get(id);if(!en)return null;en.group.updateWorldMatrix(true,true);const parts:unknown[]=[];en.group.traverse(o=>{if(o instanceof T.Mesh){const p=this.parts.find(p=>p.mesh===o);parts.push({id:o.uuid,room:p?.room,local:o.matrix.toArray(),world:o.matrixWorld.toArray(),visible:en.group.visible&&o.visible,textured:(Array.isArray(o.material)?o.material:[o.material]).some(m=>!!(m as T.MeshStandardMaterial).map),material:(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name)});}});return {id,name:en.name,modelPending:!!en.group.userData['modelPending'],bounds:new T.Box3().setFromObject(en.group).getSize(new T.Vector3()).toArray(),transform:en.group.matrixWorld.toArray(),parts};}
 override debug(){return {...super.debug(),library:{cache:libraryCacheStats(),pending:this.modelLoads.size},architecture:{tool:this.wallTool,handles:this.wallHandleDebug(),walls:structuredClone(this.wallRecords),selected:this.selectedWall,finishes:structuredClone(this.finishes),parts:this.parts.filter(p=>p.wallId).map(p=>({id:p.wallId,disabled:!!p.disabled,visible:p.mesh.visible,layer:p.layer,dynamic:!!p.dynamicWall,bounds:[p.box.min.toArray(),p.box.max.toArray()]}))},selection:this.selectedEntity,history:{undo:this.undoStack.length,redo:this.redoStack.length},entities:[...this.entities.values()].map(e=>{const center=new T.Box3().setFromObject(e.group).getCenter(new T.Vector3());const v=center.project(this.camera);const rect=this.renderer.domElement.getBoundingClientRect();return {id:e.id,name:e.name,room:e.room,deleted:e.deleted,position:e.group.position.toArray(),rotation:e.group.rotation.y,scale:e.group.scale.x,screen:[rect.left+(v.x*.5+.5)*rect.width,rect.top+(-v.y*.5+.5)*rect.height]};})};}
 override navigate(id:string,animated=true,eye=false){if(id!=='plan')this.setWallTool('off');super.navigate(id,animated,eye);}
 override startRoaming(){this.setWallTool('off');return super.startRoaming();}
 setWallTool(tool:'off'|'select'|'draw'){
  if(tool!=='off'&&(this.readOnly||!this.project?.walls))return;
  if(this.openingWallId)this.closeOpeningEditor();
  this.finishWallDrag(false);
  this.wallTool=tool;this.wallStart=undefined;this.renderer.domElement.style.cursor=tool==='draw'?'crosshair':'';
  if(tool==='off'){this.selectedWall=null;this.wallMessage='';}else{
   this.select(null);if(this.mode!=='plan')this.navigate('plan',false);
   this.wallMessage=tool==='draw'?'在户型内依次点击起点和终点。按住Shift绘制水平或竖直墙；Esc取消。':'点击墙体查看属性。蓝色为可编辑隔墙；灰色为锁定墙体。';
  }
  this.drawWallGuides();this.notifyWalls();
 }
 private notifyWalls(){this.onArchitecture({tool:this.wallTool,selection:structuredClone(this.wallRecords.find(w=>w.id===this.selectedWall)??null),walls:structuredClone(this.wallRecords),message:this.wallMessage,pending:!!this.wallStart,dragging:!!this.wallDrag||!!this.openingEdit,openingWall:structuredClone(this.wallRecords.find(w=>w.id===this.openingWallId&&!w.deleted)??null),openingId:this.selectedOpeningId});}
 selectWall(id:string){const w=this.wallRecords.find(w=>w.id===id&&!w.deleted);if(!w)return;this.selectedWall=id;this.wallMessage=w.lock==='fixed'?'已确认不可拆改的固定墙体：禁止删除、移动、旋转和开洞。':w.lock==='structural'?'原图黑色实心墙：锁定，不可修改或删除。':w.lock==='exterior'?'外围墙或外围护栏：锁定，不可修改或删除。':'可编辑隔墙：可移动、旋转、调整尺寸和门窗，或删除。';this.drawWallGuides();this.notifyWalls();}
 private disposeGuide(o:T.Object3D){o.traverse(n=>{if(n instanceof T.Line||n instanceof T.Mesh){n.geometry.dispose();const ms=Array.isArray(n.material)?n.material:[n.material];ms.forEach(m=>m.dispose());}});}
 override resizeCanvas(){super.resizeCanvas();if(this.wallGuides)this.drawWallGuides();}
 private wallPixelScale(){return (this.ortho.top-this.ortho.bottom)/this.ortho.zoom/Math.max(1,this.renderer.domElement.clientHeight);}
 private resizeHandles(w:WallRecord){
  const L=wallLength(w),ux=(w.b[0]-w.a[0])/L,uz=(w.b[1]-w.a[1])/L,pad=this.wallPixelScale()*16;
  return ([-1,0,1] as const).flatMap(end=>([-1,0,1] as const).filter(side=>end||side).map(side=>{
   const along=L/2+end*(L/2+pad),across=side*(w.thickness/2+pad);
   return {end,side,point:[w.a[0]+ux*along-uz*across,w.a[1]+uz*along+ux*across]};
  }));
 }
 private screenPoint(p:number[]){const r=this.renderer.domElement.getBoundingClientRect(),v=new T.Vector3(p[0],.265,p[1]).project(this.camera);return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];}
 private resizeHit(w:WallRecord,e:PointerEvent){return this.resizeHandles(w).map(h=>({h,d:Math.hypot(...this.screenPoint(h.point).map((v,i)=>v-(i?e.clientY:e.clientX)))})).filter(h=>h.d<(e.pointerType==='touch'?14:10)).sort((a,b)=>a.d-b.d)[0]?.h;}
 private wallHandleDebug(){
  const w=this.wallRecords.find(w=>w.id===this.selectedWall&&!w.deleted&&!w.lock&&w.rooms.some(id=>this.states[id]?.visible));
  if(!w||this.wallTool!=='select')return [];
  return [...this.resizeHandles(w).map(h=>({...h,kind:'resize',screen:this.screenPoint(h.point)})),{kind:'rotate',point:this.rotationHandle(w),screen:this.screenPoint(this.rotationHandle(w))}];
 }
 private wallCursor(e:PointerEvent){
  const w=this.wallRecords.find(w=>w.id===this.selectedWall&&!w.deleted&&!w.lock);let cursor='';
  if(w){const h=this.resizeHit(w,e);if(h){const angle=Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0])+Math.atan2(h.side,h.end);cursor=['ew-resize','nwse-resize','ns-resize','nesw-resize'][((Math.round(angle/(Math.PI/4))%4)+4)%4];}
   else if(Math.hypot(...this.screenPoint(this.rotationHandle(w)).map((v,i)=>v-(i?e.clientY:e.clientX)))<12)cursor='grab';
  }
  this.renderer.domElement.style.cursor=cursor;
 }
 private drawWallGuides(){
  for(const o of [...this.wallGuides.children]){this.disposeGuide(o);this.wallGuides.remove(o);}this.preview=undefined;
  this.wallGuides.visible=this.wallTool!=='off';if(!this.wallGuides.visible)return;
  this.guidePixelScale=this.wallPixelScale();
  for(const w of this.wallRecords.filter(w=>!w.deleted&&w.rooms.some(id=>this.states[id]?.visible))){
   const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],l=wallLength(w),nx=-dz/l*w.thickness/2,nz=dx/l*w.thickness/2;
   const cuts=w.openings.filter(o=>o.bottom<.22),edges=[0,...cuts.flatMap(o=>[o.start,o.end]),l];
   for(let i=0;i<edges.length-1;i+=2){const a=[w.a[0]+dx*edges[i]/l,w.a[1]+dz*edges[i]/l],b=[w.a[0]+dx*edges[i+1]/l,w.a[1]+dz*edges[i+1]/l];
    const pts=[[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz],[a[0]+nx,a[1]+nz]];
    const line=new T.Line(new T.BufferGeometry().setFromPoints(pts.map(p=>new T.Vector3(p[0],.245,p[1]))),new T.LineBasicMaterial({color:w.id===this.selectedWall?'#e18a2e':w.lock?'#606970':'#007aff',depthTest:false}));line.renderOrder=1000;this.wallGuides.add(line);
   }
  }
  const selected=this.wallRecords.find(w=>w.id===this.selectedWall&&!w.deleted&&!w.lock);
  if(selected){const handle=this.rotationHandle(selected),center=[(selected.a[0]+selected.b[0])/2,(selected.a[1]+selected.b[1])/2];
   if(this.wallTool==='select'){
    const markers=this.resizeHandles(selected),corners=[markers[0],markers[5],markers[7],markers[2],markers[0]];
    const outline=new T.Line(new T.BufferGeometry().setFromPoints(corners.map(h=>new T.Vector3(h.point[0],.255,h.point[1]))),new T.LineBasicMaterial({color:'#007aff',transparent:true,opacity:.45,depthTest:false}));outline.renderOrder=1002;this.wallGuides.add(outline);
    for(const h of markers){
     const radius=this.guidePixelScale*4.5;
     const fill=new T.Mesh(new T.PlaneGeometry(radius*2,radius*2),new T.MeshBasicMaterial({color:'#ffffff',depthTest:false}));fill.rotation.x=-Math.PI/2;fill.position.set(h.point[0],.265,h.point[1]);fill.renderOrder=1004;this.wallGuides.add(fill);
     const pts=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([x,z])=>new T.Vector3(h.point[0]+x*radius,.267,h.point[1]+z*radius));
     const border=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:'#007aff',depthTest:false}));border.renderOrder=1005;this.wallGuides.add(border);
    }
   }
   const line=new T.Line(new T.BufferGeometry().setFromPoints([center,handle].map(p=>new T.Vector3(p[0],.26,p[1]))),new T.LineBasicMaterial({color:'#df8a28',depthTest:false}));line.renderOrder=1002;this.wallGuides.add(line);
   const pts=Array.from({length:33},(_,i)=>new T.Vector3(handle[0]+.11*Math.cos(i*Math.PI/16),.265,handle[1]+.11*Math.sin(i*Math.PI/16)));
   const ring=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:'#df8a28',depthTest:false}));ring.renderOrder=1003;this.wallGuides.add(ring);
  }
 }
 private rotationHandle(w:WallRecord){const L=wallLength(w),distance=Math.max(.65,w.thickness/2+this.wallPixelScale()*42);return [(w.a[0]+w.b[0])/2-(w.b[1]-w.a[1])/L*distance,(w.a[1]+w.b[1])/2+(w.b[0]-w.a[0])/L*distance];}
 private snapWallPoint(p:number[],axis=false){const r=p.map(v=>Math.round(v*20)/20);if(axis&&this.wallStart){if(Math.abs(r[0]-this.wallStart[0])>Math.abs(r[1]-this.wallStart[1]))r[1]=this.wallStart[1];else r[0]=this.wallStart[0];}return r;}
 private drawPreview(p:number[],axis:boolean){if(this.preview){this.disposeGuide(this.preview);this.wallGuides.remove(this.preview);}const end=this.snapWallPoint(p,axis);this.preview=new T.Line(new T.BufferGeometry().setFromPoints([this.wallStart!,end].map(v=>new T.Vector3(v[0],.25,v[1]))),new T.LineBasicMaterial({color:'#007aff',depthTest:false}));this.preview.renderOrder=1001;this.wallGuides.add(this.preview);}
 private wallPointer(e:PointerEvent){
  e.stopImmediatePropagation();const p=this.hitFloor(e.clientX,e.clientY);if(!p)return;const pt=[p.x,p.z];
  if(this.wallTool==='draw'){
   const end=this.snapWallPoint(pt,e.shiftKey);
   if(!this.wallStart){this.wallStart=end;this.wallMessage='已确定起点，点击终点完成墙体。';this.drawPreview(end,false);this.notifyWalls();return;}
   const start=this.wallStart;if(this.addWall(start,end)){this.setWallTool('select');this.wallMessage='已添加隔墙并选中，可拖动或编辑门窗。';this.notifyWalls();}return;
  }
  const selected=this.wallRecords.find(w=>w.id===this.selectedWall&&!w.lock&&!w.deleted);
  if(selected){const resize=this.resizeHit(selected,e);if(resize){this.beginWallDrag(selected,pt,e,false,resize);return;}
   const h=this.rotationHandle(selected);if(Math.hypot(...this.screenPoint(h).map((v,i)=>v-(i?e.clientY:e.clientX)))<14){this.beginWallDrag(selected,pt,e,true);return;}}
  const w=this.wallRecords.filter(w=>!w.deleted&&w.rooms.some(id=>this.states[id]?.visible)&&wallDistance(pt,w)<w.thickness/2+.08).sort((a,b)=>wallDistance(pt,a)-wallDistance(pt,b))[0];
  if(w){if(w.lock)this.selectWall(w.id);else this.beginWallDrag(w,pt,e,false);}else{this.selectedWall=null;this.drawWallGuides();this.notifyWalls();}
 }
 private beginWallDrag(w:WallRecord,point:number[],e:PointerEvent,rotating:boolean,resize?:WallResizeHandle){
  this.wallDrag={pointerId:e.pointerId,original:structuredClone(w),start:point,screen:[e.clientX,e.clientY],before:this.snapshot(),rotating,resize,moved:false};
  this.selectWall(w.id);this.controls.enabled=false;this.renderer.domElement.setPointerCapture(e.pointerId);
 }
 private moveWallPointer(e:PointerEvent){
  const d=this.wallDrag;if(!d)return;e.stopImmediatePropagation();if(!d.moved&&Math.hypot(e.clientX-d.screen[0],e.clientY-d.screen[1])<4)return;
  const p=this.hitFloor(e.clientX,e.clientY);if(!p)return;const w=d.original,cx=(w.a[0]+w.b[0])/2,cz=(w.a[1]+w.b[1])/2;
  let dx=0,dz=0,angle=0;
  if(d.rotating){angle=Math.atan2(p.z-cz,p.x-cx)-Math.atan2(d.start[1]-cz,d.start[0]-cx);const step=(e.shiftKey?15:1)*Math.PI/180;angle=Math.round(angle/step)*step;}
  else{dx=Math.round((p.x-d.start[0])*20)/20;dz=Math.round((p.z-d.start[1])*20)/20;}
  try{
   let changed:WallRecord;
   if(d.resize){const L=wallLength(w),ux=(w.b[0]-w.a[0])/L,uz=(w.b[1]-w.a[1])/L,px=p.x-d.start[0],pz=p.z-d.start[1];changed=resizeWall(w,d.resize,Math.round((px*ux+pz*uz)*20)/20,Math.round((-px*uz+pz*ux)*100)/100);}
   else changed=transformWall(w,dx,dz,angle);
   changed.rooms=this.wallRooms(changed);const next=this.wallRecords.map(n=>n.id===w.id?changed:n);
   validateWalls(next,this.project.walls??[],this.project.rooms);d.moved=true;this.wallRecords=next;this.rebuildWalls(w.id);this.applyStates();this.wallMessage=d.resize?'调整墙体尺寸中 · 长度5cm、厚度1cm吸附':d.rotating?'旋转墙体中 · Shift按15°吸附':'移动墙体中 · 5cm吸附';this.notifyWalls();}
  catch(error){this.wallMessage=(error as Error).message;this.notifyWalls();}
 }
 private finishWallDrag(save:boolean){
  const d=this.wallDrag;if(!d)return;this.wallDrag=undefined;
  if(this.renderer.domElement.hasPointerCapture(d.pointerId))this.renderer.domElement.releasePointerCapture(d.pointerId);this.controls.enabled=!this.roaming;
  if(!save){if(d.moved)this.applyLayout(d.before);this.notifyWalls();return;}
  const current=this.wallRecords.find(w=>w.id===d.original.id);
  if(d.moved&&current&&wallChanged(current,d.original)){this.undoStack.push(d.before);if(this.undoStack.length>60)this.undoStack.shift();this.redoStack=[];this.wallMessage=d.resize?'墙体尺寸已保存':d.rotating?'墙体角度已保存':'墙体位置已保存';this.commit(this.wallMessage);}else this.notifyWalls();
 }
 private wallRooms(w:WallRecord){const ids=new Set<string>();for(let i=0;i<=20;i++){const t=i/20;for(const r of this.project.rooms)if(inPolygon(w.a[0]+(w.b[0]-w.a[0])*t,w.a[1]+(w.b[1]-w.a[1])*t,r.polygon))ids.add(r.id);}return ids.size?[...ids]:w.rooms;}
 addWall(a:number[],b:number[]){
  if(this.readOnly||!this.project.walls)return false;
  const w:WallRecord={id:'wall-'+crypto.randomUUID(),name:'新增隔墙',a,b,thickness:.12,height:3,lock:'',rooms:['living'],openings:[],deleted:false};w.rooms=this.wallRooms(w);
  return this.changeWalls([...this.wallRecords,w],'已添加隔墙',w.id);
 }
 private changeWalls(next:WallRecord[],message:string,select:string|null){
  try{const checked=validateWalls(next,this.project.walls??[],this.project.rooms);this.before();this.wallRecords=checked;this.selectedWall=select;this.wallStart=undefined;this.rebuildWalls();this.wallMessage=message;this.commit(message);return true;}
  catch(e){this.wallMessage=(e as Error).message;this.notifyWalls();return false;}
 }
 updateWall(key:'ax'|'az'|'bx'|'bz'|'height'|'thickness',value:number){
  const w=this.wallRecords.find(w=>w.id===this.selectedWall);if(!w||w.lock||this.readOnly||!Number.isFinite(value))return;
  const next=structuredClone(this.wallRecords),n=next.find(n=>n.id===w.id)!;
  if(key==='height'||key==='thickness')n[key]=value;else n[key[0]==='a'?'a':'b'][key[1]==='x'?0:1]=value;
  n.rooms=this.wallRooms(n);this.changeWalls(next,'墙体尺寸已保存',n.id);
 }
 setWallPose(key:'x'|'z'|'angle',value:number){
  const w=this.wallRecords.find(w=>w.id===this.selectedWall);if(!w||w.lock||this.readOnly||!Number.isFinite(value))return;
  const cx=(w.a[0]+w.b[0])/2,cz=(w.a[1]+w.b[1])/2,old=Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0]);
  const n=transformWall(w,key==='x'?value-cx:0,key==='z'?value-cz:0,key==='angle'?value*Math.PI/180-old:0);n.rooms=this.wallRooms(n);
  this.changeWalls(this.wallRecords.map(o=>o.id===w.id?n:o),'墙体位置与角度已保存',w.id);
 }
 rotateWall(degrees:number){const w=this.wallRecords.find(w=>w.id===this.selectedWall);if(w)this.setWallPose('angle',Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0])*180/Math.PI+degrees);}
 setWallDoor(enabled:boolean){enabled?this.addWallOpening('door'):this.closeWallOpenings('door');}
 setWallWindow(enabled:boolean){
  enabled?this.addWallOpening('window'):this.closeWallOpenings('window');
 }
 private closeWallOpenings(kind:'door'|'window'){
  const w=this.wallRecords.find(w=>w.id===this.selectedWall);if(!w||w.lock||this.readOnly)return;
  const next=structuredClone(this.wallRecords);next.find(n=>n.id===w.id)!.openings=w.openings.filter(o=>o.kind!==kind);this.changeWalls(next,kind==='window'?'已封闭窗户':'已封闭门洞',w.id);
 }
 addWallOpening(kind:'door'|'window'){
  const w=this.wallRecords.find(w=>w.id===this.selectedWall);if(!w||w.lock||this.readOnly)return;
  const next=structuredClone(this.wallRecords),n=next.find(n=>n.id===w.id)!,L=wallLength(w),gaps:number[][]=[];let start=.1;
  for(const o of w.openings){if(o.start-.1>start)gaps.push([start,o.start-.1]);start=Math.max(start,o.end+.1);}gaps.push([start,L-.1]);gaps.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));
  const gap=gaps[0],width=Math.min(kind==='door'?.9:1.2,gap[1]-gap[0]),bottom=kind==='door'?0:Math.min(1.1,(w.height-.3)/2),height=Math.min(kind==='door'?2.2:1.2,w.height-bottom-.15);
  if(width<(kind==='door'?.6:.3)||height<(kind==='door'?1.8:.3)){this.wallMessage='剩余墙面不足，请先调整已有洞口位置或墙体尺寸。';this.notifyWalls();return;}
  const left=(gap[0]+gap[1]-width)/2;n.openings.push({id:'opening-'+crypto.randomUUID(),start:left,end:left+width,bottom,top:bottom+height,kind});n.openings.sort((a,b)=>a.start-b.start);
  this.changeWalls(next,kind==='window'?'已添加窗户，保留其他门窗':'已添加门洞，保留其他门窗',w.id);
 }
 setWallOpening(index:number,key:'start'|'width'|'sill'|'height',value:number){
  const w=this.wallRecords.find(w=>w.id===this.selectedWall);if(!w||w.lock||this.readOnly||!w.openings[index]||!Number.isFinite(value))return;
  const next=structuredClone(this.wallRecords),n=next.find(n=>n.id===w.id)!,o=n.openings[index];
  if(key==='start'){const width=o.end-o.start;o.start=value;o.end=value+width;}
  if(key==='width')o.end=o.start+value;
  if(key==='sill'){if(o.kind==='door')return;const height=o.top-o.bottom;o.bottom=value;o.top=value+height;}
  if(key==='height')o.top=o.bottom+value;
  n.openings.sort((a,b)=>a.start-b.start);this.changeWalls(next,'洞口尺寸与位置已保存',w.id);
 }
 removeWallOpening(index:number){const w=this.wallRecords.find(w=>w.id===this.selectedWall);if(!w||w.lock||this.readOnly||!w.openings[index])return;const next=structuredClone(this.wallRecords);next.find(n=>n.id===w.id)!.openings.splice(index,1);this.changeWalls(next,'已封闭选中的洞口',w.id);}
 openWallOpenings(wallId=this.selectedWall,openingId?:string){
  const w=this.wallRecords.find(w=>w.id===wallId&&!w.deleted);if(!w)return;
  this.finishWallDrag(false);this.finishOpeningEdit(false);this.select(null);this.wallStart=undefined;
  this.openingWallId=w.id;this.selectedWall=w.id;this.selectedOpeningId=openingId??w.openings[0]?.id??null;
  this.freezeView(true);
  this.wallMessage=w.lock?'锁定墙体：已有门窗仅可查看。':'正视编辑 · 拖动洞口和边角，松手保存。';this.notifyWalls();
 }
 closeOpeningEditor(){this.finishOpeningEdit(false);this.openingWallId=null;this.selectedOpeningId=null;this.freezeView(false);this.notifyWalls();}
 selectOpening(id:string|null){this.selectedOpeningId=id;this.notifyWalls();}
 beginOpeningEdit(){
  const w=this.wallRecords.find(w=>w.id===this.openingWallId&&!w.deleted);if(!w||w.lock||this.readOnly)return false;
  this.finishOpeningEdit(false);this.openingEdit={before:this.snapshot(),wall:structuredClone(w),selection:this.selectedOpeningId};return true;
 }
 previewOpening(opening:WallOpening):string{
  const d=this.openingEdit,w=this.wallRecords.find(w=>w.id===this.openingWallId);if(!d||!w||w.lock||this.readOnly)return '此墙体不可编辑。';
  const n=structuredClone(w),o={...opening};
  if(o.kind==='door'){o.top-=o.bottom;o.bottom=0;}
  const index=n.openings.findIndex(x=>x.id===o.id);if(index<0)n.openings.push(o);else n.openings[index]=o;n.openings.sort((a,b)=>a.start-b.start||a.bottom-b.bottom);
  try{validateOpenings(n);}catch(e){return (e as Error).message;}
  this.wallRecords=this.wallRecords.map(x=>x.id===n.id?n:x);this.selectedOpeningId=o.id!;this.rebuildWalls(n.id);this.applyStates();this.notifyWalls();return '';
 }
 finishOpeningEdit(save=true){
  const d=this.openingEdit;if(!d)return;this.openingEdit=undefined;
  const w=this.wallRecords.find(w=>w.id===d.wall.id),changed=!!w&&wallChanged(w,d.wall);
  if(!save){if(changed){this.wallRecords=this.wallRecords.map(w=>w.id===d.wall.id?d.wall:w);this.rebuildWalls(d.wall.id);this.applyStates();}this.selectedOpeningId=d.selection;this.notifyWalls();return;}
  if(changed){this.undoStack.push(d.before);if(this.undoStack.length>60)this.undoStack.shift();this.redoStack=[];this.wallMessage='门窗位置与尺寸已保存';this.commit(this.wallMessage);}else this.notifyWalls();
 }
 changeOpening(opening:WallOpening){if(!this.beginOpeningEdit())return '此墙体不可编辑。';const error=this.previewOpening(opening);this.finishOpeningEdit(!error);return error;}
 deleteOpening(id:string){
  const w=this.wallRecords.find(w=>w.id===this.openingWallId);if(!w||w.lock||this.readOnly)return;
  this.finishOpeningEdit(false);const next=structuredClone(this.wallRecords),n=next.find(x=>x.id===w.id)!;n.openings=n.openings.filter(o=>o.id!==id);
  this.selectedOpeningId=null;this.changeWalls(next,'已封闭洞口并恢复墙面，可撤销',w.id);
 }
 deleteWall(){const w=this.wallRecords.find(w=>w.id===this.selectedWall);if(!w||this.readOnly)return;if(w.lock){this.wallMessage='此墙体已锁定，无法删除。';this.notifyWalls();return;}const next=structuredClone(this.wallRecords);next.find(n=>n.id===w.id)!.deleted=true;this.changeWalls(next,'已删除隔墙，可撤销',null);}
 private rebuildWalls(onlyId?:string){
  const materials=new Set<T.Material>(),parents=new Set<T.Object3D>();
  for(const p of this.parts.filter(p=>p.dynamicWall&&(!onlyId||p.wallId===onlyId))){p.mesh.geometry.dispose();for(const m of Array.isArray(p.original)?p.original:[p.original])materials.add(m);if(p.mesh.parent)parents.add(p.mesh.parent);}
  for(const m of materials){this.cutMaterials.delete(m);m.dispose();}for(const g of parents)this.model.remove(g);
  this.parts=this.parts.filter(p=>!p.dynamicWall||!!onlyId&&p.wallId!==onlyId);const defaults=new Map((this.project.walls??[]).map(w=>[w.id,w]));
  for(const p of this.parts)if(p.wallId&&!p.dynamicWall&&(!onlyId||p.wallId===onlyId)){const w=this.wallRecords.find(w=>w.id===p.wallId),base=defaults.get(p.wallId);p.disabled=!!w&&(w.deleted||!!base&&wallChanged(w,base));}
  for(const w of this.wallRecords){if(onlyId&&w.id!==onlyId)continue;const base=defaults.get(w.id);if(w.deleted||(base&&!wallChanged(w,base)))continue;
   const g=makeWall(w),replaced=new Set<T.Material>();this.model.add(g);g.updateMatrixWorld(true);g.traverse(o=>{if(!(o instanceof T.Mesh))return;const data=o.userData;if(data['layer']==='wall'){for(const m of Array.isArray(o.material)?o.material:[o.material])replaced.add(m);this.assignWallFaces(o,w.rooms);}this.parts.push({mesh:o,room:data['room'],rooms:data['rooms'],layer:data['layer'],cutaway:w.id,wallId:w.id,box:new T.Box3().setFromObject(o),original:o.material,dynamicWall:true});});for(const m of replaced)m.dispose();
  }
  this.drawWallGuides();
 }
 setRoomFinish(id:string,key:'wall'|'floor',value:string){
  if(this.readOnly||!this.project.walls)return;
  const ids=id==='all'?this.project.rooms.filter(r=>!r.greeneryOnly).map(r=>r.id):[id];const next=structuredClone(this.finishes);
  for(const rid of ids){if(!this.states[rid]||this.project.rooms.find(r=>r.id===rid)?.greeneryOnly)return;next[rid]={...(next[rid]??DEFAULT_FINISH),[key]:value};}
  try{validateFinishes(next,this.project.rooms.map(r=>r.id));}catch{return;}
  this.before();this.finishes=next;for(const rid of ids)this.states[rid].decorated=true;this.commit('墙地面材质已保存');
 }
 override destroy(){this.closed=true;for(const fn of this.cleanups)fn();this.disposeGuide(this.wallGuides);this.outline.geometry.dispose();(this.outline.material as T.Material).dispose();super.destroy();}
}
