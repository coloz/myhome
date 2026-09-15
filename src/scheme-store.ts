import { environment } from './environments/environment';
import { SCHEMES, RAW_SCHEME, designScheme } from './schemes';
import type { Layout } from './layout';

export type DesignRow = {
 id:string; name:string; template_id:string; layout:Layout|null;
 revision:number; updated_at:string; last_mutation_id:string|null;
};
type Entry = {row:DesignRow; dirty:boolean; mutationId:string; conflict?:boolean; local?:boolean};
export type SaveStatus = {state:'loading'|'pending'|'saving'|'saved'|'error'|'conflict'; message:string};
const CACHE='home-simulator:supabase:nbdodqezyijrztikvkcd:v1:';
const LEGACY_RAW='home-simulator:raw-workspace:v1';
const RAW_MIGRATED='home-simulator:unified-raw-migration:v1';
const COLUMNS='id,name,template_id,layout,revision,updated_at,last_mutation_id';

/** Durable outbox. Each design has one writer and its own revision, queue and retry timer. */
export class SchemeStore {
 onChange=()=>{};
 private entries=new Map<string,Entry>();
 private timers=new Map<string,ReturnType<typeof setTimeout>>();
 private inFlight=new Map<string,Promise<void>>();
 private failures=new Map<string,number>();
 private statuses=new Map<string,SaveStatus>();
 private firstQueued=new Map<string,number>();
 private disposed=false;
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
   for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key?.startsWith(CACHE))continue;
    const entry=JSON.parse(localStorage.getItem(key)!);
    if(this.validRow(entry?.row)&&typeof entry.dirty==='boolean'&&typeof entry.mutationId==='string')this.entries.set(entry.row.id,entry);
   }
  }catch{this.cacheError='本地缓存不可用，请及时导出 JSON 备份。';}
  this.migrateRawDesigns();
  window.addEventListener('online',this.online);
  window.addEventListener('pagehide',this.pagehide);
  document.addEventListener('visibilitychange',this.visibility);
 }
 get schemes(){return [...this.entries.values()].map(e=>designScheme(e.row.id,e.row.name,e.row.template_id));}
 get pendingCount(){return [...this.entries.values()].filter(e=>e.dirty&&!e.local).length;}
 get warning(){return this.cacheError;}
 isLocal(id:string){return !!this.entries.get(id)?.local;}
 canEdit(id:string){return this.writable||this.isLocal(id);}
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
    if(localStorage.getItem(CACHE+d.id))continue;
    const entry:Entry={row:{id:d.id,name:d.name,template_id:RAW_SCHEME.id,layout:d.layout??null,revision:0,updated_at:'',last_mutation_id:null},dirty:false,mutationId:'',local:true};
    localStorage.setItem(CACHE+d.id,JSON.stringify(entry));this.entries.set(d.id,entry);
   }
   localStorage.setItem(RAW_MIGRATED,'1');
  }catch{this.cacheError='旧方案尚未全部合并，原存档已保留；请导出 JSON 备份后重试。';}
 }
 layout(id:string){return structuredClone(this.entries.get(id)?.row.layout??null);}
 status(id:string):SaveStatus {
  if(this.isLocal(id))return {state:this.cacheError?'error':'saved',message:this.cacheError||'已保存在本机'};
  if(!this.writable)return {state:this.connectionError?'error':'saved',message:this.connectionError||'公开浏览 · 登录后可编辑和新建方案'};
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
 private setStatus(id:string,status:SaveStatus){this.statuses.set(id,status);this.onChange();}
 private async request(path:string,body?:unknown):Promise<DesignRow[]> {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const token=body?await this.getAccessToken():null;
   if(body&&!token)throw new Error('请重新登录后同步，修改已保留在本地。');
   const response=await fetch(environment.supabaseUrl+'/rest/v1/'+path,{
    method:body?'POST':'GET',headers:{apikey:environment.supabaseKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:body?JSON.stringify(body):undefined,signal:controller.signal,
   });
   if(!response.ok){
    if(response.status===404)throw new Error('云端方案库尚未初始化，请完成数据库配置后重试。');
    if(response.status===401||response.status===403)throw new Error('云端访问权限未就绪，请检查数据库配置。');
    if(response.status===400&&body&&typeof body==='object'&&'p_template_id' in body&&body.p_template_id===RAW_SCHEME.id)throw new Error('已保留本机修改；云端需更新户型支持后才能同步。');
    throw new Error('云端暂时不可用（'+response.status+'），修改保留在本地，稍后重试。');
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
  const entry=this.entries.get(row.id);
  // A downloaded shared record must never overwrite an unpublished local design.
  if(entry?.local)return;
  if(entry?.dirty){
   // A response may have been lost after the database committed the request.
   if(entry.mutationId===row.last_mutation_id){entry.row=row;entry.dirty=false;entry.conflict=false;this.statuses.delete(row.id);}
   else if(entry.row.revision!==row.revision)entry.conflict=true;
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
   this.connectionError='';
  }catch(e){this.connectionError=(e as Error).message;}
  this.onChange();
 }
 async prepare(id:string){
  if(this.entries.get(id)?.dirty||this.isLocal(id))return;
  try{
   const rows=await this.request('home_design_schemes?select='+COLUMNS+'&id=eq.'+encodeURIComponent(id));
   if(rows[0])this.merge(rows[0]);this.connectionError='';
  }catch(e){this.connectionError=(e as Error).message;}
  this.onChange();
 }
 save(id:string,layout:Layout){
  if(!this.canEdit(id))return;
  const entry=this.entries.get(id);if(!entry)throw new Error('当前方案不存在。');
  if(entry.local){entry.row.layout=structuredClone(layout);this.persist(id);this.onChange();return;}
  entry.row.layout=structuredClone(layout);entry.dirty=true;entry.mutationId=crypto.randomUUID();
  this.persist(id);
  if(!entry.conflict){this.setStatus(id,{state:'pending',message:'修改已保存在本地，等待上传…'});this.schedule(id);}
  else this.onChange();
 }
 create(name:string,templateId:string,layout:Layout|null,local=false){
  if(!this.writable&&!local)throw new Error('请先登录再新建方案。');
  name=name.trim();if(!name||name.length>60)throw new Error('请输入 1–60 个字符的方案名称。');
  const id=(local?'local-':'')+crypto.randomUUID();designScheme(id,name,templateId);
  this.entries.set(id,{row:{id,name,template_id:templateId,layout:null,revision:0,updated_at:'',last_mutation_id:null},dirty:false,mutationId:'',local});
  this.persist(id);if(layout)this.save(id,layout);this.onChange();
  return this.schemes.find(s=>s.id===id)!;
 }
 private schedule(id:string,delay?:number){
  if(this.disposed)return;
  clearTimeout(this.timers.get(id));
  const start=this.firstQueued.get(id)??Date.now();this.firstQueued.set(id,start);
  this.timers.set(id,setTimeout(()=>{this.timers.delete(id);this.firstQueued.delete(id);void this.flushOne(id);},delay??Math.max(0,Math.min(500,2000-(Date.now()-start)))));
 }
 private flushOne(id:string):Promise<void>{
  const running=this.inFlight.get(id);if(running)return running;
  const entry=this.entries.get(id);if(!this.writable||this.disposed||entry?.local||!entry?.dirty||entry.conflict||!entry.row.layout)return Promise.resolve();
  clearTimeout(this.timers.get(id));this.timers.delete(id);this.firstQueued.delete(id);
  const sent=structuredClone(entry);
  this.setStatus(id,{state:'saving',message:'正在保存到云端…'});
  const task=(async()=>{
   let retryDelay:number|undefined;
   try{
    const rows=await this.request('rpc/save_home_design_scheme',{
     p_id:id,p_name:sent.row.name,p_template_id:sent.row.template_id,p_layout:sent.row.layout,
     p_expected_revision:sent.row.revision,p_mutation_id:sent.mutationId,
    });
    if(!rows[0]){entry.conflict=true;this.persist(id);return;}
    // Only acknowledge the submitted snapshot. Edits made during upload remain queued.
    entry.row.revision=rows[0].revision;entry.row.updated_at=rows[0].updated_at;entry.row.last_mutation_id=rows[0].last_mutation_id;
    if(entry.mutationId===sent.mutationId)entry.dirty=false;
    this.failures.delete(id);this.connectionError='';this.persist(id);
    this.setStatus(id,{state:entry.dirty?'pending':'saved',message:entry.dirty?'正在同步后续修改…':'已保存到云端 · '+new Date(rows[0].updated_at).toLocaleTimeString('zh-CN')});
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
 /** Explicitly share a local snapshot; keep the original durable copy as a backup. */
 publish(id:string){
  if(!this.writable)throw new Error('请先登录后保存到云端。');
  const e=this.entries.get(id);if(!e?.local||!e.row.layout)throw new Error('当前方案尚未准备好。');
  return this.create(e.row.name.slice(0,50)+' · 共享副本',e.row.template_id,e.row.layout);
 }
 /** A conflict is resolved by preserving local work as a separate design. */
 async preserveConflict(id:string,layout:Layout){
  const entry=this.entries.get(id)!;
  const copy=this.create(entry.row.name.slice(0,50)+' · 本地副本',entry.row.template_id,layout);
  // Read the original again only after the local copy has been queued durably.
  const rows=await this.request('home_design_schemes?select='+COLUMNS+'&id=eq.'+encodeURIComponent(id)).catch(()=>[]);
  if(rows[0]){entry.dirty=false;entry.conflict=false;this.merge(rows[0]);}
  this.onChange();return copy;
 }
 destroy(){
  this.persistAll();this.disposed=true;for(const timer of this.timers.values())clearTimeout(timer);
  window.removeEventListener('online',this.online);window.removeEventListener('pagehide',this.pagehide);document.removeEventListener('visibilitychange',this.visibility);
 }
}
