import { environment } from './environments/environment';
import { SCHEMES, RAW_SCHEME, designScheme } from './schemes';
import type { Layout } from './layout';

export type DesignRow = {
 id:string; name:string; template_id:string; layout:Layout|null;
 revision:number; updated_at:string; last_mutation_id:string|null;
};
type Entry = {row:DesignRow; dirty:boolean; mutationId:string; conflict?:boolean; local?:boolean; saveAfter?:number; deferUntilLogin?:boolean};
export type SaveStatus = {state:'loading'|'pending'|'saving'|'saved'|'error'|'conflict'; message:string};
const CACHE='home-simulator:supabase:nbdodqezyijrztikvkcd:v1:';
const LEGACY_RAW='home-simulator:raw-workspace:v1';
const RAW_MIGRATED='home-simulator:unified-raw-migration:v1';
const DELETED='home-simulator:deleted-schemes:v1';
const COLUMNS='id,name,template_id,layout,revision,updated_at,last_mutation_id';
const AUTOSAVE_DELAY=5000;
const PENDING_SAVE='修改已保存在本地，停止修改 5 秒后同步到云端…';

/** Durable outbox. Each design has one writer and its own revision, queue and retry timer. */
export class SchemeStore {
 onChange=()=>{};
 onSaveError=(_id:string,_message:string,_conflict:boolean)=>{};
 onSaveSuccess=(_id:string)=>{};
 private entries=new Map<string,Entry>();
 private timers=new Map<string,ReturnType<typeof setTimeout>>();
 private inFlight=new Map<string,Promise<void>>();
 private failures=new Map<string,number>();
 private statuses=new Map<string,SaveStatus>();
 private reportedErrors=new Map<string,string>();
 private disposed=false;
 private deleting=new Set<string>();
 private deleted=new Set<string>();
 private connectionError='';
 private cacheError='';
 writable=false;
 private getAccessToken:()=>Promise<string|null>;
 private online=()=>this.retry();
 private pagehide=()=>{this.persistAll();this.flush();};
 private visibility=()=>{if(document.visibilityState==='hidden')this.pagehide();};

 constructor(getAccessToken:()=>Promise<string|null>=async()=>null){
  this.getAccessToken=getAccessToken;
  for(const s of SCHEMES)this.entries.set(s.id,{row:{id:s.id,name:s.name,template_id:s.id,layout:null,revision:0,updated_at:'',last_mutation_id:null},dirty:false,mutationId:'',local:s.id===RAW_SCHEME.id});
  try{
   const deleted:unknown=JSON.parse(localStorage.getItem(DELETED)??'[]');
   if(Array.isArray(deleted))for(const id of deleted)if(typeof id==='string'&&!SCHEMES.some(s=>s.id===id))this.deleted.add(id);
   for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key?.startsWith(CACHE))continue;
    const entry=JSON.parse(localStorage.getItem(key)!);
    if(this.validRow(entry?.row)&&!this.deleted.has(entry.row.id)&&typeof entry.dirty==='boolean'&&typeof entry.mutationId==='string')this.entries.set(entry.row.id,entry);
   }
  }catch{this.cacheError='本地缓存不可用，请及时导出 JSON 备份。';}
  this.migrateRawDesigns();
  // Legacy local-only designs join the same outbox under their original IDs.
  // The local flag now only grants editing before a first authenticated upload.
  for(const [id,e] of this.entries)if(e.local&&e.row.layout&&!e.dirty){
   e.dirty=true;e.mutationId=crypto.randomUUID();e.saveAfter=Date.now()+AUTOSAVE_DELAY;this.persist(id);
  }
  window.addEventListener('online',this.online);
  window.addEventListener('pagehide',this.pagehide);
  document.addEventListener('visibilitychange',this.visibility);
 }
 get schemes(){return [...this.entries.values()].map(e=>designScheme(e.row.id,e.row.name,e.row.template_id));}
 get pendingCount(){return [...this.entries.values()].filter(e=>e.dirty).length;}
 get warning(){return this.cacheError;}
 isLocal(id:string){return !!this.entries.get(id)?.local;}
 canEdit(id:string){return this.writable||this.isLocal(id);}
 canDelete(id:string){return this.entries.has(id)&&!SCHEMES.some(s=>s.id===id)&&this.canEdit(id)&&!this.deleting.has(id);}
 private migrateRawDesigns(){
  try{
   if(localStorage.getItem(RAW_MIGRATED))return;
   const raw=localStorage.getItem(LEGACY_RAW);if(!raw)return;
   const designs:unknown=JSON.parse(raw);if(!Array.isArray(designs))throw new Error('Invalid legacy archive');
   for(const d of designs){
    const row:DesignRow={id:d.id,name:d.name,template_id:RAW_SCHEME.id,layout:d.layout??null,revision:0,updated_at:'',last_mutation_id:null};
    if(!this.validRow(row))throw new Error('Invalid legacy design');
   }
   // Leave the original archive untouched; mark migration only after all copies persist.
   for(const d of designs){
    if(this.deleted.has(d.id)||localStorage.getItem(CACHE+d.id))continue;
    const entry:Entry={row:{id:d.id,name:d.name,template_id:RAW_SCHEME.id,layout:d.layout??null,revision:0,updated_at:'',last_mutation_id:null},dirty:false,mutationId:'',local:true};
    localStorage.setItem(CACHE+d.id,JSON.stringify(entry));this.entries.set(d.id,entry);
   }
   localStorage.setItem(RAW_MIGRATED,'1');
  }catch{this.cacheError='旧方案尚未全部合并，原存档已保留；请导出 JSON 备份后重试。';}
 }
 layout(id:string){return structuredClone(this.entries.get(id)?.row.layout??null);}
 status(id:string):SaveStatus {
  const e=this.entries.get(id);
  if(e?.conflict)return {state:'conflict',message:'云端已有其他修改，本地布置已保留，请另存为新方案。'};
  return this.statuses.get(id)??(e?.dirty?{state:'pending',message:'修改待同步'}:this.connectionError?{state:'error',message:this.connectionError}:{state:'saved',message:e?.row.revision?'已保存到云端':'云端自动保存已开启'});
 }
 private validRow(row:DesignRow){
  return !!row&&typeof row.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(row.id)&&typeof row.name==='string'&&row.name.trim().length>0&&row.name.length<=60&&SCHEMES.some(s=>s.id===row.template_id)&&Number.isSafeInteger(row.revision)&&row.revision>=0&&(!row.layout||row.layout.format==='home-simulator');
 }
 private persist(id:string){
  try{localStorage.setItem(CACHE+id,JSON.stringify(this.entries.get(id)));}
  catch{this.cacheError='本地缓存空间不足或不可用；未上传的修改请导出 JSON 备份。';}
 }
 private persistAll(){for(const id of this.entries.keys())this.persist(id);}
 private setStatus(id:string,status:SaveStatus){
  this.statuses.set(id,status);
  if(status.state==='error'||status.state==='conflict'){
   if(this.reportedErrors.get(id)!==status.message){this.reportedErrors.set(id,status.message);this.onSaveError(id,status.message,status.state==='conflict');}
  }else if(status.state==='saved'){this.reportedErrors.delete(id);this.onSaveSuccess(id);}
  this.onChange();
 }
 private async request(path:string,body?:unknown):Promise<DesignRow[]> {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const token=body?await this.getAccessToken():null;
   if(body&&!token)throw new Error('请登录后重试，修改已保留。');
   const response=await fetch(environment.supabaseUrl+'/rest/v1/'+path,{
    method:body?'POST':'GET',headers:{apikey:environment.supabaseKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:body?JSON.stringify(body):undefined,signal:controller.signal,
   });
   if(!response.ok){
    // PostgREST uses 400 for several unrelated failures. Inspect the database
    // error without exposing details (which can contain the complete layout).
    const error:unknown=await response.json().catch(()=>null);
    const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9]{5,12}$/.test(error.code)?error.code:'';
    const message=error&&typeof error==='object'&&'message' in error&&typeof error.message==='string'?error.message:'';
    if(response.status===404)throw new Error('云端方案库尚未初始化，请完成数据库配置后重试。');
    if(response.status===401||response.status===403)throw new Error('云端访问权限未就绪，请检查数据库配置。');
    if(code==='23514'&&message.includes('"home_design_schemes_template_id_check"'))throw new Error('已保留本机修改；云端需更新户型支持后才能同步，请联系项目管理员。');
    if(code==='23514'&&message.includes('"home_design_layout_valid"'))throw new Error('已保留本机修改；方案未通过云端布局校验，请检查户型版本、家具数量及数据库更新。');
    throw new Error('云端暂时不可用（'+response.status+(code?' / '+code:'')+'），修改保留在本地，稍后重试。');
   }
   const rows:unknown=await response.json();
   if(!Array.isArray(rows)||!rows.every(row=>this.validRow(row)))throw new Error('云端返回了不支持的方案数据，已保留本地布置。');
   return rows;
  }catch(e){
   if(e instanceof Error&&e.name!=='TypeError'&&e.name!=='AbortError')throw e;
   throw new Error('网络连接中断或超时，修改保留在本地，将自动重试。');
  }finally{clearTimeout(timeout);}
 }
 private merge(row:DesignRow){
  if(this.deleted.has(row.id)||this.deleting.has(row.id))return;
  const entry=this.entries.get(row.id);
  if(entry?.dirty){
   // A response may have been lost after the database committed the request.
   if(entry.mutationId===row.last_mutation_id){entry.row=row;entry.dirty=false;entry.local=false;entry.conflict=false;delete entry.saveAfter;this.setStatus(row.id,{state:'saved',message:''});}
   else if(entry.row.revision!==row.revision){entry.conflict=true;this.setStatus(row.id,this.status(row.id));}
  }else{
   this.entries.set(row.id,{row,dirty:false,mutationId:''});this.statuses.delete(row.id);
  }
  this.persist(row.id);
 }
 async refresh(){
  // Do not change a revision while an earlier write is completing.
  await Promise.all([...this.inFlight.values()]);
  try{
   const rows:DesignRow[]=[];
   for(let offset=0;;offset+=100){
    const page=await this.request('home_design_schemes?select='+COLUMNS+'&order=id&limit=100&offset='+offset);
    rows.push(...page);if(page.length<100)break;
   }
   for(const row of rows)this.merge(row);
   const present=new Set(rows.map(row=>row.id));
   for(const [id,e] of this.entries)if(!e.local&&!e.dirty&&e.row.revision>0&&!SCHEMES.some(s=>s.id===id)&&!present.has(id)&&!this.deleting.has(id))this.forget(id);
   this.connectionError='';
  }catch(e){this.connectionError=(e as Error).message;}
  this.onChange();
 }
 async prepare(id:string){
  if(this.entries.get(id)?.dirty)return;
  try{
   const rows=await this.request('home_design_schemes?select='+COLUMNS+'&id=eq.'+encodeURIComponent(id));
   if(rows[0])this.merge(rows[0]);this.connectionError='';
  }catch(e){this.connectionError=(e as Error).message;}
  this.onChange();
 }
 save(id:string,layout:Layout){
  if(this.deleted.has(id)||this.deleting.has(id))return;
  if(!this.canEdit(id))return;
  const entry=this.entries.get(id);if(!entry)throw new Error('当前方案不存在。');
  entry.row.layout=structuredClone(layout);entry.dirty=true;entry.mutationId=crypto.randomUUID();entry.saveAfter=Date.now()+AUTOSAVE_DELAY;
  this.persist(id);
  if(!entry.conflict){this.setStatus(id,{state:'pending',message:PENDING_SAVE});this.schedule(id);}
  else this.onChange();
 }
 create(name:string,templateId:string,layout:Layout|null,local=false,deferUntilLogin=false){
  if(!this.writable&&!local)throw new Error('请先登录再新建方案。');
  name=name.trim();if(!name||name.length>60)throw new Error('请输入 1–60 个字符的方案名称。');
  const id=(local?'local-':'')+crypto.randomUUID();designScheme(id,name,templateId);
  this.entries.set(id,{row:{id,name,template_id:templateId,layout:null,revision:0,updated_at:'',last_mutation_id:null},dirty:false,mutationId:'',local,deferUntilLogin});
  this.persist(id);if(layout)this.save(id,layout);this.onChange();
  return this.schemes.find(s=>s.id===id)!;
 }
 private remainingDelay(id:string){
  const due=this.entries.get(id)?.saveAfter;
  return Number.isFinite(due)?Math.max(0,due!-Date.now()):0;
 }
 private schedule(id:string,delay=0){
  if(this.disposed||this.deleted.has(id)||this.deleting.has(id))return;
  clearTimeout(this.timers.get(id));
  this.timers.set(id,setTimeout(()=>{this.timers.delete(id);void this.flushOne(id);},Math.max(delay,this.remainingDelay(id))));
 }
 private flushOne(id:string):Promise<void>{
  const running=this.inFlight.get(id);if(running)return running;
  // Local design previews are valid offline drafts, not failed cloud writes.
  // Login/refresh will flush their durable outbox after authentication is ready.
  const entry=this.entries.get(id);if(this.disposed||this.deleted.has(id)||this.deleting.has(id)||!entry?.dirty||entry.conflict||!entry.row.layout)return Promise.resolve();
  if(!this.writable&&entry.local&&entry.deferUntilLogin)return Promise.resolve();
  // All paths (switching designs, reconnecting, reload and earlier request completion)
  // honor the last edit's deadline. Local persistence never waits for this timer.
  if(this.remainingDelay(id)>0){this.schedule(id);return Promise.resolve();}
  clearTimeout(this.timers.get(id));this.timers.delete(id);
  const sent=structuredClone(entry);
  this.setStatus(id,{state:'saving',message:'正在保存到云端…'});
  const task=(async()=>{
   let retryDelay:number|undefined;
   try{
    const rows=await this.request('rpc/save_home_design_scheme',{
     p_id:id,p_name:sent.row.name,p_template_id:sent.row.template_id,p_layout:sent.row.layout,
     p_expected_revision:sent.row.revision,p_mutation_id:sent.mutationId,
    });
    if(!rows[0]){entry.conflict=true;this.persist(id);this.setStatus(id,this.status(id));return;}
    // Only acknowledge the submitted snapshot. Edits made during upload remain queued.
    entry.local=false;entry.row.revision=rows[0].revision;entry.row.updated_at=rows[0].updated_at;entry.row.last_mutation_id=rows[0].last_mutation_id;
    if(entry.mutationId===sent.mutationId){entry.dirty=false;delete entry.saveAfter;}
    this.failures.delete(id);this.connectionError='';this.persist(id);
    this.setStatus(id,{state:entry.dirty?'pending':'saved',message:entry.dirty?PENDING_SAVE:'已保存到云端 · '+new Date(rows[0].updated_at).toLocaleTimeString('zh-CN')});
   }catch(e){
    const count=(this.failures.get(id)??0)+1;this.failures.set(id,count);retryDelay=Math.min(30000,1000*2**Math.min(count,5));
    this.setStatus(id,{state:'error',message:(e as Error).message});
   }finally{
    this.inFlight.delete(id);
    if(this.writable&&entry.dirty&&!entry.conflict)this.schedule(id,retryDelay??0);
    this.onChange();
   }
  })();
  this.inFlight.set(id,task);return task;
 }
 flush(){for(const id of this.entries.keys())void this.flushOne(id);}
 retry(){this.flush();this.onChange();}
 /** Called only after the UI confirms this exact design. Tombstones prevent
  * legacy archives, stale refresh responses and pending saves resurrecting it. */
 private forget(id:string){
  localStorage.setItem(DELETED,JSON.stringify([...new Set([...this.deleted,id])]));
  this.deleted.add(id);clearTimeout(this.timers.get(id));this.timers.delete(id);
  this.entries.delete(id);this.statuses.delete(id);this.failures.delete(id);
  this.reportedErrors.delete(id);this.onSaveSuccess(id);
  const key='home-simulator:design:'+id,keys:string[]=[];
  for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)!;if(k===CACHE+id||k===key||k.startsWith(key+':'))keys.push(k);}
  for(const k of keys)localStorage.removeItem(k);
  for(const k of ['home-simulator:active-scheme','home-simulator:active-raw-design'])if(localStorage.getItem(k)===id)localStorage.setItem(k,RAW_SCHEME.id);
 }
 async remove(id:string){
  if(!this.canDelete(id))throw new Error('只能删除自己创建的方案；内置户型保留。');
  this.deleting.add(id);clearTimeout(this.timers.get(id));this.timers.delete(id);this.onChange();
  const entry=this.entries.get(id)!;
  try{
   await this.inFlight.get(id);
   if(!entry.local){
    const token=await this.getAccessToken();if(!token)throw new Error('请登录后删除共享方案。');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
     const response=await fetch(environment.supabaseUrl+'/rest/v1/rpc/delete_home_design_scheme',{
      method:'POST',headers:{apikey:environment.supabaseKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({p_id:id,p_template_id:entry.row.template_id,p_expected_revision:entry.row.revision}),signal:controller.signal});
     if(response.status===404)throw new Error('云端尚未启用方案删除，请执行新增的删除功能数据库脚本；方案仍保留。');
     if(!response.ok)throw new Error('删除失败，方案仍保留，请稍后重试。');
     if(await response.json()!==true)throw new Error('方案已被其他人修改，请先刷新确认最新内容后再删除。');
    }catch(e){if(e instanceof Error&&(e.name==='TypeError'||e.name==='AbortError'))throw new Error('网络异常，尚未确认删除；请重试。');throw e;}finally{clearTimeout(timer);}
   }
   this.forget(id);
  }finally{this.deleting.delete(id);if(this.entries.has(id)&&entry.dirty&&!entry.conflict)this.schedule(id);this.onChange();}
 }
 /** A conflict is resolved by preserving local work as a separate design. */
 async preserveConflict(id:string,layout:Layout){
  const entry=this.entries.get(id)!;
  const copy=this.create(entry.row.name.slice(0,50)+' · 修改副本',entry.row.template_id,layout);
  // Read the original again only after the local copy has been queued durably.
  const rows=await this.request('home_design_schemes?select='+COLUMNS+'&id=eq.'+encodeURIComponent(id)).catch(()=>[]);
  if(rows[0]){entry.dirty=false;entry.conflict=false;this.merge(rows[0]);this.reportedErrors.delete(id);this.onSaveSuccess(id);}
  this.onChange();return copy;
 }
 destroy(){
  this.persistAll();this.disposed=true;for(const timer of this.timers.values())clearTimeout(timer);
  window.removeEventListener('online',this.online);window.removeEventListener('pagehide',this.pagehide);document.removeEventListener('visibilitychange',this.visibility);
 }
}
