import { Component, ElementRef, ViewChild, afterNextRender, signal, computed, NgZone, inject, OnDestroy } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { HomeEditor, EditorStatus, type ArchitectureStatus } from './editor';
import { Project, RoomState } from './viewer';
import { CATALOG,loadCatalog,visibleCatalog,catalogItem,type CatalogItem } from './catalog';
import {FurnitureLibrary} from './furniture-library';
import { SCHEMES, RAW_SCHEME, type Scheme } from './schemes';
import { WALL_COLORS, FLOOR_STYLES, DEFAULT_FINISH, type WallOpening, type WallRecord } from './architecture';
import { SchemeStore } from './scheme-store';
import { supabase } from './auth';
import type { User, Subscription } from '@supabase/supabase-js';
import type { WalkStatus } from './walk-controls';
import { OpeningEditor } from './opening-editor';
import { DesignStudio } from './design-studio';
import { validateDesign, type DesignDocument } from './design-engine';
import type { Layout } from './layout';
@Component({selector:'app-root',standalone:true,imports:[OpeningEditor,FurnitureLibrary,DesignStudio],templateUrl:'./app.html'})
export class App implements OnDestroy {
 @ViewChild('viewport',{static:true}) viewport!:ElementRef<HTMLElement>;
 @ViewChild('importInput',{static:true}) importInput!:ElementRef<HTMLInputElement>;
 @ViewChild('schemeDialog',{static:true}) schemeDialog!:ElementRef<HTMLDialogElement>;
 @ViewChild('loginDialog',{static:true}) loginDialog!:ElementRef<HTMLDialogElement>;
 @ViewChild('deleteDialog',{static:true}) deleteDialog!:ElementRef<HTMLDialogElement>;
 @ViewChild('designDialog',{static:true}) designDialog!:ElementRef<HTMLDialogElement>;
 studioLayout=signal<Layout|null>(null);designBusy=signal(false);
 private zone=inject(NgZone);
 viewer?:HomeEditor;
 schemes=signal(SCHEMES);scheme=signal(SCHEMES[0]);private loading=false;
 schemesOpen=signal(true);
 private store?:SchemeStore;
 localDraft=signal(false);
 saveError=signal<{id:string;message:string;conflict:boolean}|null>(null);
 newName=signal('');newSource=signal(RAW_SCHEME.id);createError=signal('');creating=signal(false);
 deleteTarget=signal<Scheme|null>(null);deleting=signal(false);deleteError=signal('');
 modelLabel=computed(()=>{const s=SCHEMES.find(t=>t.id===(this.scheme().templateId??this.scheme().id));return (s?.name??'')+(this.project()?.revision?' · 修订 '+this.project()!.revision:'');});
 templates=SCHEMES;
 user=signal<User|null>(null);signedIn=computed(()=>!!this.user()&&!this.user()?.is_anonymous);
 canEdit=computed(()=>this.localDraft()||this.signedIn());
 authBusy=signal(false);authError=signal('');private authSubscription?:Subscription;
 project=signal<Project|null>(null);ready=signal(false);error=signal('');progress=signal(0);
 selected=signal('all');eye=signal(false);states=signal<Record<string,RoomState>>({});
 autoWalls=signal(true);showCeiling=signal(false);labels=signal(true);editMode=signal(true);
 objectsLocked=signal(false);
 roam=signal<WalkStatus>({active:false,locked:false,message:''});roaming=computed(()=>this.roam().active);
 sidebarOpen=signal(false);panelOpen=signal(false);showSource=signal(false);showInfo=signal(false);
 tab=signal<'catalog'|'selection'|'architecture'>('catalog');category=signal('全部');notice=signal('');
 architecture=signal<ArchitectureStatus>({tool:'off',selection:null,walls:[],message:'',pending:false,dragging:false,openingWall:null,openingId:null});
 wallColors=WALL_COLORS;floorStyles=FLOOR_STYLES;finishRoom=signal('all');
 wallCount=computed(()=>this.architecture().walls.filter(w=>!w.deleted&&!w.lock).length);
 editor=signal<EditorStatus>({selection:null,undo:0,redo:0,count:0,message:'',items:[]});
 catalogItems=signal<CatalogItem[]>(visibleCatalog());
 selectedSpec=computed(()=>catalogItem(this.editor().selection?.catalogId));
 replaceTarget=signal<{id:string;name:string}|null>(null);
 colors=['#ede9df','#e5c56d','#91b0c1','#6b8d70','#b28a5f','#2a302c'];
 roomItems=computed(()=>this.editor().items.filter(e=>['all','plan'].includes(this.selected())||e.room===this.selected()));
 isRoom=computed(()=>!['all','plan'].includes(this.selected()));
 viewName=computed(()=>this.roaming()?'第一人称漫游':this.selected()==='all'?'自由查看':this.selected()==='plan'?'户型图':this.project()?.rooms.find(r=>r.id===this.selected())?.name??'');
 finishMode=computed(()=>{const v=Object.values(this.states()).map(s=>s.decorated);return v.every(Boolean)?'decorated':v.every(x=>!x)?'raw':'mixed';});
 constructor(){afterNextRender(()=>this.zone.runOutsideAngular(async()=>{
  const {data}=await supabase.auth.getSession();this.user.set(data.session?.user??null);
  this.store=new SchemeStore(async()=>(await supabase.auth.getSession()).data.session?.access_token??null);this.store.writable=this.signedIn();this.store.onChange=()=>this.syncStore();
  this.store.onSaveError=(id,message,conflict)=>this.saveError.set({id,message:'云端保存失败 · '+(this.store?.schemes.find(s=>s.id===id)?.name??'方案')+'：'+message,conflict});
  this.store.onSaveSuccess=id=>{if(this.saveError()?.id===id)this.saveError.set(null);};
  this.authSubscription=supabase.auth.onAuthStateChange((_event,session)=>{
   const previous=this.user()?.id;this.user.set(session?.user??null);
   if(this.store)this.store.writable=this.signedIn();
   if(this.viewer){this.viewer.setReadOnly(!this.canEdit());this.viewer.setObjectsLocked(!this.canEdit()||this.objectsLocked());}
   this.syncStore();
   if(previous!==session?.user?.id)setTimeout(()=>{if(!this.loading)void this.refreshSchemes();},0);
  }).data.subscription;
  await this.store.refresh();
  const params=new URLSearchParams(location.search);let active=params.get('scheme');
  try{
   // Old URLs select a design in the same app; they no longer create a workspace.
   active??=params.get('workspace')==='raw'?(localStorage.getItem('home-simulator:active-raw-design')??RAW_SCHEME.id):
    localStorage.getItem('home-simulator:active-scheme')??localStorage.getItem('home-simulator:active-raw-design');
  }catch{}
  this.scheme.set(this.store.schemes.find(s=>s.id===active)??(params.get('workspace')==='raw'?RAW_SCHEME:SCHEMES[0]));this.syncStore();
  await this.init(false);this.store.flush();
 }));}
 syncStore(){if(!this.store)return;this.schemes.set(this.store.schemes);this.localDraft.set(this.store.isLocal(this.scheme().id));}
 async init(fetchCloud=true){
  if(this.loading)return;this.loading=true;
  this.syncStore();
  this.ready.set(false);this.error.set('');this.progress.set(0);this.project.set(null);this.states.set({});this.replaceTarget.set(null);
  this.selected.set('all');this.eye.set(false);this.hidden.set(0);this.notice.set('');this.tab.set('catalog');
  this.editor.set({selection:null,undo:0,redo:0,count:0,message:'',items:[]});
  this.viewer?.destroy();this.viewer=undefined;
  try{
   this.viewer=new HomeEditor(this.viewport.nativeElement,this.scheme());
   this.viewer.onModelError=message=>this.notice.set(message);
   this.viewer.onFinishError=message=>this.notice.set(message);
   this.viewer.setReadOnly(!this.canEdit());
   this.viewer.onRoam=s=>this.roam.set(s);
   this.viewer.onStats=s=>{if(this.hidden()!==s.hidden)this.hidden.set(s.hidden);};
   this.viewer.onEdit=s=>{const previous=this.editor().selection?.id;this.editor.set(s);this.sync();if(s.selection&&s.selection.id!==previous&&!this.replaceTarget())this.tab.set('selection');};
   this.viewer.onArchitecture=s=>{const previous=this.architecture();this.architecture.set(s);if(s.selection&&!s.dragging&&(s.selection.id!==previous.selection?.id||previous.dragging))this.panelOpen.set(true);};
   await Promise.all([loadCatalog().then(()=>this.catalogItems.set(visibleCatalog())),this.viewer.load(n=>this.progress.set(n)),fetchCloud?this.store?.prepare(this.scheme().id):Promise.resolve()]);this.project.set(this.viewer.project);
   const id=this.scheme().id,layout=this.store?.layout(id);
   if(layout)this.viewer.restoreLayout(layout);
   this.viewer.onLayoutChange=layout=>this.store?.save(id,layout);
   const current=this.viewer.snapshot();
   if(this.canEdit()&&(!layout||current.version!==layout.version||current.modelRevision!==(layout.modelRevision??1)))this.store?.save(id,current);
   this.viewer.setAuto(this.autoWalls());this.viewer.setCeiling(this.showCeiling());this.viewer.labels=this.labels();this.viewer.editEnabled=this.editMode();this.viewer.setObjectsLocked(!this.canEdit()||this.objectsLocked());
   this.sync();this.syncStore();this.ready.set(true);
   try{localStorage.setItem('home-simulator:active-scheme',this.scheme().id);}catch{}
   const url=new URL(location.href);url.searchParams.delete('workspace');url.searchParams.set('scheme',this.scheme().id);history.replaceState(null,'',url);
   Object.defineProperty(window,'__homeViewer',{value:{snapshot:()=>({...this.viewer?.debug(),schemeId:this.scheme().id,modelVersion:this.project()?.version,modelRevision:this.project()?.revision??1,visualRevision:this.project()?.visualRevision,sync:this.store?.schemes.map(s=>({id:s.id,state:this.store!.status(s.id).state}))}),components:(id:string)=>this.viewer?.componentDebug(id)},configurable:true});
  }catch(e){this.error.set(e instanceof Error?e.message:'模型加载失败，请刷新页面重试。');this.viewer?.destroy();this.viewer=undefined;console.error(e);}
  finally{this.loading=false;}
 }
 changeScheme(id:string){const next=this.schemes().find(s=>s.id===id);if(!next||this.loading||next.id===this.scheme().id)return;this.store?.flush();this.scheme.set(next);this.showSource.set(false);this.zone.runOutsideAngular(()=>this.init());}
 schemeKeydown(e:KeyboardEvent){
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
  const list=e.currentTarget as HTMLElement,items=Array.from(list.querySelectorAll<HTMLButtonElement>('[role=option]'));
  if(!items.length)return;e.preventDefault();const index=items.indexOf(e.target as HTMLButtonElement);
  const next=e.key==='Home'?0:e.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,index+(e.key==='ArrowDown'?1:-1)));
  items[next].focus();items[next].scrollIntoView({block:'nearest'});
 }
 setTab(tab:'catalog'|'selection'|'architecture'){this.tab.set(tab);if(tab!=='architecture')this.viewer?.setWallTool('off');}
 wallTool(tool:'off'|'select'|'draw'){if(!this.canEdit())return;this.viewer?.setWallTool(tool);if(tool!=='off'){this.selected.set('plan');this.eye.set(false);this.labels.set(false);if(this.viewer)this.viewer.labels=false;this.panelOpen.set(false);this.sidebarOpen.set(false);}this.tab.set('architecture');}
 selectWall(id:string){this.wallTool('select');this.viewer?.selectWall(id);}
 wallChange(key:'ax'|'az'|'bx'|'bz'|'height'|'thickness',e:Event){this.viewer?.updateWall(key,Number((e.target as HTMLInputElement).value));}
 wallAngle(w:WallRecord){return Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0])*180/Math.PI;}
 wallPoseChange(key:'x'|'z'|'angle',e:Event){const input=e.target as HTMLInputElement;this.viewer?.setWallPose(key,Number(input.value));const w=this.architecture().selection;if(w)input.value=String(key==='angle'?this.wallAngle(w):key==='x'?(w.a[0]+w.b[0])/2:(w.a[1]+w.b[1])/2);}
 openingChange(index:number,key:'start'|'width'|'sill'|'height',e:Event){const input=e.target as HTMLInputElement;this.viewer?.setWallOpening(index,key,Number(input.value));const o=this.architecture().selection?.openings[index];if(o)input.value=String(key==='start'?o.start:key==='width'?o.end-o.start:key==='sill'?o.bottom:o.top-o.bottom);}
 hasOpening(openings:WallOpening[],kind:'door'|'window'){return openings.some(o=>o.kind===kind);}
 toggleWallOpening(kind:'door'|'window',e:Event){const input=e.target as HTMLInputElement;kind==='window'?this.viewer?.setWallWindow(input.checked):this.viewer?.setWallDoor(input.checked);input.checked=this.hasOpening(this.architecture().selection?.openings??[],kind);}
 retryFinishTextures(){this.notice.set('');this.viewer?.retryFinishTextures();}
 changeFinish(key:'wall'|'floor',value:string){this.viewer?.setRoomFinish(this.finishRoom(),key,value);this.sync();}
 finishValue(key:'wall'|'floor'){if(this.finishRoom()!=='all')return (this.viewer?.finishes[this.finishRoom()]??DEFAULT_FINISH)[key];const values=new Set(this.project()?.rooms.filter(r=>!r.greeneryOnly).map(r=>(this.viewer?.finishes[r.id]??DEFAULT_FINISH)[key]));return values.size===1?[...values][0]:'';}
 openNewScheme(){if(!this.ready()||!this.canEdit())return;this.viewer?.stopRoaming();this.newName.set('');this.newSource.set(RAW_SCHEME.id);this.createError.set('');this.schemeDialog.nativeElement.showModal();}
 canDeleteScheme(){return this.ready()&&!this.deleting()&&!!this.store?.canDelete(this.scheme().id);}
 openDeleteScheme(){if(!this.canDeleteScheme())return;this.viewer?.stopRoaming();this.deleteTarget.set(this.scheme());this.deleteError.set('');this.deleteDialog.nativeElement.showModal();}
 closeDeleteScheme(){if(this.deleting())return;this.deleteDialog.nativeElement.close();this.deleteTarget.set(null);}
 async deleteScheme(e:Event){
  e.preventDefault();const target=this.deleteTarget();if(!target||!this.store||this.deleting())return;
  this.deleting.set(true);this.deleteError.set('');this.viewer?.setReadOnly(true);
  try{
   await this.store.remove(target.id);this.deleteDialog.nativeElement.close();this.deleteTarget.set(null);
   if(this.scheme().id===target.id){this.scheme.set(this.store.schemes.find(s=>s.id===RAW_SCHEME.id)??RAW_SCHEME);await this.init(false);}
   this.notice.set('已删除方案“'+target.name+'”');
  }catch(e){this.deleteError.set((e as Error).message);}finally{this.deleting.set(false);this.viewer?.setReadOnly(!this.canEdit());this.viewer?.setObjectsLocked(!this.canEdit()||this.objectsLocked());this.syncStore();}
 }
 async createScheme(e:Event){
  e.preventDefault();if(!this.store||!this.viewer||this.creating())return;
  this.creating.set(true);this.createError.set('');
  try{
   const source=this.newSource(),templateId=source==='copy'?(this.scheme().templateId??this.scheme().id):source;
   // Only an explicit copy carries a snapshot. Every template selection starts
   // empty and loads its latest manifest/model in init, even for the same template.
   const layout=source==='copy'?this.viewer.snapshot():null;
   const next=this.store.create(this.newName(),templateId,layout,!this.signedIn());
   this.store.flush();this.schemeDialog.nativeElement.close();this.scheme.set(next);this.showSource.set(false);await this.init(false);
  }catch(e){this.createError.set((e as Error).message);}finally{this.creating.set(false);}
 }
 async refreshSchemes(){if(this.loading||!this.store)return;this.loading=true;this.ready.set(false);try{await this.store.refresh();if(!this.store.schemes.some(s=>s.id===this.scheme().id))this.scheme.set(this.store.schemes.find(s=>s.id===RAW_SCHEME.id)??RAW_SCHEME);}finally{this.loading=false;}await this.init(false);this.store.flush();}
 retrySave(){this.store?.retry();}
 openLogin(){this.viewer?.stopRoaming();this.authError.set('');this.loginDialog.nativeElement.showModal();}
 async login(e:Event){
  e.preventDefault();if(this.authBusy())return;const form=e.target as HTMLFormElement,data=new FormData(form);
  this.authBusy.set(true);this.authError.set('');
  try{
   const {error}=await supabase.auth.signInWithPassword({email:String(data.get('email')).trim(),password:String(data.get('password'))});
   if(error)throw error;form.reset();this.loginDialog.nativeElement.close();
  }catch{this.authError.set('登录失败，请检查邮箱和密码，或稍后重试。');}finally{this.authBusy.set(false);}
 }
 async logout(){this.authBusy.set(true);try{const {error}=await supabase.auth.signOut({scope:'local'});if(error)this.notice.set('退出失败，请稍后重试。');}finally{this.authBusy.set(false);}}
 async preserveConflict(id=this.scheme().id){
  if(!this.store||!this.viewer||this.loading)return;
  const layout=id===this.scheme().id?this.viewer.snapshot():this.store.layout(id);if(!layout)return;
  this.ready.set(false);
  try{const next=await this.store.preserveConflict(id,layout);this.scheme.set(next);await this.init(false);}
  catch(e){this.notice.set((e as Error).message);this.ready.set(true);}
 }
 hidden=signal(0);
 sync(){this.states.set(Object.fromEntries(Object.entries(this.viewer?.states??{}).map(([k,v])=>[k,{...v}])));}
 go(id:string,eye=false){if(!this.ready())return;this.selected.set(id);this.eye.set(eye);if(id!=='all'&&id!=='plan'&&!this.viewer!.states[id].visible)this.viewer!.setRoom(id,'visible',true);this.viewer!.navigate(id,true,eye);this.sync();this.sidebarOpen.set(false);}
 toggleRoom(id:string,key:'visible'|'decorated'){if(!this.ready())return;this.viewer?.setRoom(id,key,!this.states()[id][key]);this.sync();}
 allDecor(v:boolean){this.viewer?.setAllDecor(v);this.sync();}
 showAll(){this.viewer?.setAllVisible();this.sync();}
 toggleWalls(){this.autoWalls.set(!this.autoWalls());this.viewer?.setAuto(this.autoWalls());}
 toggleCeiling(){this.showCeiling.set(!this.showCeiling());this.viewer?.setCeiling(this.showCeiling());}
 toggleLabels(){this.labels.set(!this.labels());if(this.viewer)this.viewer.labels=this.labels();}
 toggleEdit(){if(!this.canEdit()||this.objectsLocked())return;this.editMode.set(!this.editMode());if(this.viewer){this.viewer.editEnabled=this.editMode();if(!this.editMode())this.viewer.select(null);}}
 toggleObjectLock(){if(!this.ready()||!this.canEdit())return;this.objectsLocked.set(!this.objectsLocked());this.viewer?.setObjectsLocked(this.objectsLocked());}
 toggleRoam(){
  if(!this.ready()||!this.viewer)return;
  if(this.roaming()){this.viewer.stopRoaming();return;}
  this.viewer.select(null);this.sidebarOpen.set(false);this.panelOpen.set(false);this.notice.set('');
  if(!this.viewer.startRoaming())this.notice.set('入户门外的漫游起点暂不可用，请重新加载方案。');
 }
 resetView(){this.go(this.selected(),this.eye());}
 beginReplacement(){const s=this.editor().selection;if(!s?.catalogId)return;this.replaceTarget.set({id:s.id,name:s.name});this.setTab('catalog');}
 addLibrary(item:{id:string;color?:string}){const target=this.replaceTarget();if(target){this.viewer?.select(target.id);if(this.viewer?.replaceCatalog(item.id)){this.replaceTarget.set(null);this.setTab('selection');}else this.notice.set('此物件无法替换，请重新选择。');}else this.viewer?.addCatalog(item.id,undefined,undefined,item.color);this.panelOpen.set(true);}
 add(id:string){this.viewer?.addCatalog(id);this.panelOpen.set(true);}
 dragStart(e:DragEvent,id:string){if(this.objectsLocked()){e.preventDefault();return;}e.dataTransfer?.setData('application/x-home-furniture',id);}
 transform(key:'x'|'y'|'z'|'angle'|'scale',e:Event){this.viewer?.setTransform(key,Number((e.target as HTMLInputElement).value));}
 focus(id:string){if(this.objectsLocked())return;const item=this.editor().items.find(x=>x.id===id);if(item)this.selected.set(item.room);this.viewer?.focusEntity(id);this.tab.set('selection');this.panelOpen.set(true);}
 async importFile(e:Event){const input=e.target as HTMLInputElement;const file=input.files?.[0],viewer=this.viewer;if(!file||!viewer)return;try{if(file.size>5_000_000)throw new Error('方案文件过大。');const layout=JSON.parse(await file.text());if(this.viewer!==viewer)throw new Error('已切换方案，请在目标方案中重新导入。');if(layout?.schema==='home-design/v1'){await this.applyDesign(layout);return;}viewer.importLayout(layout);this.notice.set('方案已导入');}catch(e){this.notice.set(e instanceof Error?e.message:'导入失败');}finally{input.value='';}}
 openDesignStudio(){if(!this.ready()||!this.viewer)return;this.viewer.stopRoaming();this.studioLayout.set(this.viewer.snapshot());this.designDialog.nativeElement.showModal();}
 closeDesignStudio(){if(this.designBusy())return;this.designDialog.nativeElement.close();this.studioLayout.set(null);}
 async applyDesign(document:DesignDocument){
  if(!this.store||this.loading||this.designBusy())return;
  this.designBusy.set(true);
  try{
   const response=await fetch('assets/raw-shell/project.json');if(!response.ok)throw Error('无法读取原始户型');
   const d=validateDesign(document,await response.json(),CATALOG);
   const layout={...d.layout,design:{brief:d.brief,roomUses:d.roomUses}};
   const next=this.store.create(d.brief.name,RAW_SCHEME.id,layout,!this.signedIn(),true);
   this.scheme.set(next);await this.init(false);
   if(!this.ready())throw Error(this.error()||'三维方案加载失败');
   this.designDialog.nativeElement.close();this.studioLayout.set(null);this.go('plan');
   this.notice.set('已创建独立装修方案，可继续编辑并漫游查看。');
  }catch(e){this.notice.set((e as Error).message);this.designDialog.nativeElement.close();}
  finally{this.designBusy.set(false);}
 }
 capture(){this.viewer?.screenshot();}
 async exportGlb(){this.notice.set('正在导出当前三维方案…');try{await this.viewer?.exportGlb();this.notice.set('当前 GLB 已导出');}catch(e){this.notice.set(e instanceof Error?e.message:'三维导出失败，请先导出 JSON 保存布置。');}}
 ngOnDestroy(){this.authSubscription?.unsubscribe();this.store?.destroy();this.viewer?.destroy();}
}
bootstrapApplication(App).catch(console.error);
