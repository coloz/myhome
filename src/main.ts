import { Component, ElementRef, ViewChild, afterNextRender, signal, computed, NgZone, inject, OnDestroy } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { HomeEditor, EditorStatus } from './editor';
import { Project, RoomState } from './viewer';
import { CATALOG } from './catalog';
import { SCHEMES } from './schemes';
import { SchemeStore, type SaveStatus } from './scheme-store';
import { supabase } from './auth';
import type { User, Subscription } from '@supabase/supabase-js';
import type { WalkStatus } from './walk-controls';
@Component({selector:'app-root',standalone:true,templateUrl:'./app.html'})
export class App implements OnDestroy {
 @ViewChild('viewport',{static:true}) viewport!:ElementRef<HTMLElement>;
 @ViewChild('importInput',{static:true}) importInput!:ElementRef<HTMLInputElement>;
 @ViewChild('schemeDialog',{static:true}) schemeDialog!:ElementRef<HTMLDialogElement>;
 @ViewChild('loginDialog',{static:true}) loginDialog!:ElementRef<HTMLDialogElement>;
 private zone=inject(NgZone);
 viewer?:HomeEditor;
 schemes=signal(SCHEMES);scheme=signal(SCHEMES[0]);private loading=false;
 private store?:SchemeStore;
 saveStatus=signal<SaveStatus>({state:'loading',message:'正在连接云端方案库…'});
 pendingCount=signal(0);cacheWarning=signal('');
 newName=signal('');newSource=signal('copy');createError=signal('');creating=signal(false);
 templates=SCHEMES;
 user=signal<User|null>(null);canEdit=computed(()=>!!this.user()&&!this.user()?.is_anonymous);
 authBusy=signal(false);authError=signal('');private authSubscription?:Subscription;
 project=signal<Project|null>(null);ready=signal(false);error=signal('');progress=signal(0);
 selected=signal('all');eye=signal(false);states=signal<Record<string,RoomState>>({});
 autoWalls=signal(true);showCeiling=signal(false);labels=signal(true);editMode=signal(true);
 objectsLocked=signal(false);
 roam=signal<WalkStatus>({active:false,locked:false,message:''});roaming=computed(()=>this.roam().active);
 sidebarOpen=signal(false);panelOpen=signal(false);showSource=signal(false);showInfo=signal(false);
 tab=signal<'catalog'|'selection'>('catalog');category=signal('全部');notice=signal('');
 editor=signal<EditorStatus>({selection:null,undo:0,redo:0,count:0,message:'',items:[]});
 catalog=CATALOG;categories=['全部','沙发','椅子','桌子','床柜','绿植'];
 colors=['#ede9df','#e5c56d','#91b0c1','#6b8d70','#b28a5f','#2a302c'];
 filteredCatalog=computed(()=>this.category()==='全部'?this.catalog:this.catalog.filter(c=>c.category===this.category()));
 roomItems=computed(()=>this.editor().items.filter(e=>['all','plan'].includes(this.selected())||e.room===this.selected()));
 isRoom=computed(()=>!['all','plan'].includes(this.selected()));
 viewName=computed(()=>this.roaming()?'第一人称漫游':this.selected()==='all'?'自由查看':this.selected()==='plan'?'户型图':this.project()?.rooms.find(r=>r.id===this.selected())?.name??'');
 finishMode=computed(()=>{const v=Object.values(this.states()).map(s=>s.decorated);return v.every(Boolean)?'decorated':v.every(x=>!x)?'raw':'mixed';});
 constructor(){afterNextRender(()=>this.zone.runOutsideAngular(async()=>{
  const {data}=await supabase.auth.getSession();this.user.set(data.session?.user??null);
  this.store=new SchemeStore(async()=>(await supabase.auth.getSession()).data.session?.access_token??null);this.store.writable=this.canEdit();this.store.onChange=()=>this.syncStore();
  this.authSubscription=supabase.auth.onAuthStateChange((_event,session)=>{
   const previous=this.user()?.id;this.user.set(session?.user??null);
   if(this.store)this.store.writable=this.canEdit();
   if(this.viewer){this.viewer.setReadOnly(!this.canEdit());this.viewer.setObjectsLocked(!this.canEdit()||this.objectsLocked());}
   this.syncStore();
   if(previous!==session?.user?.id)setTimeout(()=>{if(!this.loading)void this.refreshSchemes();},0);
  }).data.subscription;
  await this.store.refresh();
  try{this.scheme.set(this.store.schemes.find(s=>s.id===localStorage.getItem('home-simulator:active-scheme'))??SCHEMES[0]);}catch{}
  await this.init(false);this.store.flush();
 }));}
 syncStore(){if(!this.store)return;this.schemes.set(this.store.schemes);this.saveStatus.set(this.store.status(this.scheme().id));this.pendingCount.set(this.store.pendingCount);this.cacheWarning.set(this.store.warning);}
 async init(fetchCloud=true){
  if(this.loading)return;this.loading=true;
  this.ready.set(false);this.error.set('');this.progress.set(0);this.project.set(null);this.states.set({});
  this.selected.set('all');this.eye.set(false);this.hidden.set(0);this.notice.set('');this.tab.set('catalog');
  this.editor.set({selection:null,undo:0,redo:0,count:0,message:'',items:[]});
  this.viewer?.destroy();this.viewer=undefined;
  try{
   this.viewer=new HomeEditor(this.viewport.nativeElement,this.scheme());
   this.viewer.setReadOnly(!this.canEdit());
   this.viewer.onRoam=s=>this.roam.set(s);
   this.viewer.onStats=s=>{if(this.hidden()!==s.hidden)this.hidden.set(s.hidden);};
   this.viewer.onEdit=s=>{this.editor.set(s);this.sync();if(s.selection)this.tab.set('selection');};
   await Promise.all([this.viewer.load(n=>this.progress.set(n)),fetchCloud?this.store?.prepare(this.scheme().id):Promise.resolve()]);this.project.set(this.viewer.project);
   const id=this.scheme().id,layout=this.store?.layout(id);
   if(layout)this.viewer.restoreLayout(layout);
   this.viewer.onLayoutChange=layout=>this.store?.save(id,layout);
   const current=this.viewer.snapshot();
   if(this.canEdit()&&(!layout||current.version!==layout.version||current.modelRevision!==(layout.modelRevision??1)))this.store?.save(id,current);
   this.viewer.setAuto(this.autoWalls());this.viewer.setCeiling(this.showCeiling());this.viewer.labels=this.labels();this.viewer.editEnabled=this.editMode();this.viewer.setObjectsLocked(!this.canEdit()||this.objectsLocked());
   this.sync();this.syncStore();this.ready.set(true);
   try{localStorage.setItem('home-simulator:active-scheme',this.scheme().id);}catch{}
   Object.defineProperty(window,'__homeViewer',{value:{snapshot:()=>({...this.viewer?.debug(),schemeId:this.scheme().id,modelVersion:this.project()?.version}),components:(id:string)=>this.viewer?.componentDebug(id)},configurable:true});
  }catch(e){this.error.set(e instanceof Error?e.message:'模型加载失败，请刷新页面重试。');this.viewer?.destroy();this.viewer=undefined;console.error(e);}
  finally{this.loading=false;}
 }
 changeScheme(e:Event){const next=this.schemes().find(s=>s.id===(e.target as HTMLSelectElement).value);if(!next||this.loading||next.id===this.scheme().id)return;this.store?.flush();this.scheme.set(next);this.showSource.set(false);this.zone.runOutsideAngular(()=>this.init());}
 openNewScheme(){if(!this.ready()||!this.canEdit())return;this.viewer?.stopRoaming();this.newName.set('');this.newSource.set('copy');this.createError.set('');this.schemeDialog.nativeElement.showModal();}
 async createScheme(e:Event){
  e.preventDefault();if(!this.store||!this.viewer||this.creating())return;
  this.creating.set(true);this.createError.set('');
  try{
   const source=this.newSource(),templateId=source==='copy'?(this.scheme().templateId??this.scheme().id):source;
   const layout=source==='copy'?this.viewer.snapshot():templateId===(this.scheme().templateId??this.scheme().id)?this.viewer.initialLayout():null;
   const next=this.store.create(this.newName(),templateId,layout);
   this.store.flush();this.schemeDialog.nativeElement.close();this.scheme.set(next);this.showSource.set(false);await this.init(false);
  }catch(e){this.createError.set((e as Error).message);}finally{this.creating.set(false);}
 }
 async refreshSchemes(){if(this.loading||!this.store)return;this.loading=true;this.ready.set(false);try{await this.store.refresh();}finally{this.loading=false;}await this.init(false);this.store.flush();}
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
 async preserveConflict(){
  if(!this.store||!this.viewer||this.loading)return;this.ready.set(false);
  const next=await this.store.preserveConflict(this.scheme().id,this.viewer.snapshot());this.scheme.set(next);await this.init(false);
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
 add(id:string){this.viewer?.addCatalog(id);this.panelOpen.set(true);}
 dragStart(e:DragEvent,id:string){if(this.objectsLocked()){e.preventDefault();return;}e.dataTransfer?.setData('application/x-home-furniture',id);}
 transform(key:'x'|'z'|'angle'|'scale',e:Event){this.viewer?.setTransform(key,Number((e.target as HTMLInputElement).value));}
 focus(id:string){if(this.objectsLocked())return;const item=this.editor().items.find(x=>x.id===id);if(item)this.selected.set(item.room);this.viewer?.focusEntity(id);this.tab.set('selection');this.panelOpen.set(true);}
 async importFile(e:Event){const input=e.target as HTMLInputElement;const file=input.files?.[0],viewer=this.viewer;if(!file||!viewer)return;try{if(file.size>5_000_000)throw new Error('方案文件过大。');const layout=JSON.parse(await file.text());if(this.viewer!==viewer)throw new Error('已切换方案，请在目标方案中重新导入。');viewer.importLayout(layout);this.notice.set('方案已导入');}catch(e){this.notice.set(e instanceof Error?e.message:'导入失败');}finally{input.value='';}}
 capture(){this.viewer?.screenshot();}
 async exportGlb(){this.notice.set('正在导出当前三维方案…');try{await this.viewer?.exportGlb();this.notice.set('当前 GLB 已导出');}catch{this.notice.set('三维导出失败，请先导出 JSON 保存布置。');}}
 ngOnDestroy(){this.authSubscription?.unsubscribe();this.store?.destroy();this.viewer?.destroy();}
}
bootstrapApplication(App).catch(console.error);
