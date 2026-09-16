const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),{randomUUID}=require('node:crypto');
const checks=[],microtasks=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function harness(){
 let now=1000000,nextTimer=0,hold=false,fail=false,authorized=true,active=0,maxActive=0;
 const errors=[],successes=[];
 const timers=new Map(),cache=new Map(),requests=[],pending=[],rows=new Map();
 const window=new EventTarget(),document=Object.assign(new EventTarget(),{visibilityState:'visible'});
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const localStorage={get length(){return cache.size;},key:i=>[...cache.keys()][i],getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,String(v)),removeItem:k=>cache.delete(k)};
 const globals={Date:ClockDate,crypto:{randomUUID},structuredClone,AbortController,window,document,localStorage,
  setTimeout:(fn,delay=0)=>{const id=++nextTimer;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
  fetch:async(url,options)=>{
   const data=JSON.parse(options.body);requests.push({at:now,data});active++;maxActive=Math.max(maxActive,active);
   if(hold)await new Promise(resolve=>pending.push(resolve));active--;
   if(fail)throw new TypeError('offline');
   const old=rows.get(data.p_id),row=old?.last_mutation_id===data.p_mutation_id?old:{id:data.p_id,name:data.p_name,template_id:data.p_template_id,layout:data.p_layout,revision:(old?.revision??0)+1,updated_at:new ClockDate().toISOString(),last_mutation_id:data.p_mutation_id};
   rows.set(row.id,row);return {ok:true,json:async()=>[row]};
  }};
 const modules=new Map();
 function load(file){
  file=path.resolve(file);if(modules.has(file))return modules.get(file);
  const exports={},js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const requireLocal=name=>name.includes('environment')?{environment:{supabaseUrl:'https://mock.invalid',supabaseKey:'test'}}:load(path.resolve(path.dirname(file),name+'.ts'));
  vm.runInNewContext(js,{...globals,exports,require:requireLocal},{filename:file});modules.set(file,exports);return exports;
 }
 const {SchemeStore}=load('src/scheme-store.ts');let store;
 const fresh=()=>{store?.destroy();store=new SchemeStore(async()=>authorized?'test-token':null);store.writable=true;store.onSaveError=(...args)=>errors.push(args);store.onSaveSuccess=id=>successes.push(id);return store;};fresh();
 const tick=async ms=>{const end=now+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await microtasks();}now=end;await microtasks();};
 return {get store(){return store;},get now(){return now;},get maxActive(){return maxActive;},set hold(v){hold=v;},set fail(v){fail=v;},set authorized(v){authorized=v;},tick,fresh,requests,rows,cache,window,document,errors,successes,release:async()=>{pending.shift()?.();await microtasks();}};
}
const layout=value=>({format:'home-simulator',version:2,modelVersion:'test',rooms:{},entities:[],value});
const run=async(name,fn)=>{const h=harness();try{await fn(h);checks.push(name);console.log('PASS: '+name);}finally{h.store.destroy();}};
(async()=>{
 await run('Only the latest edit uploads after exactly 5 quiet seconds; continuous edits have no forced maximum wait',async h=>{
  for(let i=0;i<4;i++){h.store.save('original',layout(i));assert.equal(h.store.layout('original').value,i);await h.tick(4999);assert.equal(h.requests.length,0);}
  await h.tick(1);assert.equal(h.requests.length,1);assert.equal(h.requests[0].data.p_layout.value,3);assert.equal(h.store.pendingCount,0);await h.tick(10000);assert.equal(h.requests.length,1);
 });
 await run('All designs, including raw-shell, upload automatically on independent countdowns',async h=>{
  h.store.save('original',layout(1));await h.tick(2000);h.store.save('alternative',layout(2));h.store.save('raw-shell',layout(3));
  assert.equal(h.store.layout('raw-shell').value,3);await h.tick(3000);assert.deepEqual(h.requests.map(r=>r.data.p_id),['original']);await h.tick(2000);assert.deepEqual(h.requests.map(r=>r.data.p_id),['original','alternative','raw-shell']);assert(!h.store.isLocal('raw-shell'));
 });
 await run('Flush, online, pagehide and hidden-page events cannot bypass the edit deadline; reload preserves it',async h=>{
  h.store.save('original',layout(7));await h.tick(2000);h.store.flush();h.store.retry();h.window.dispatchEvent(new Event('online'));h.window.dispatchEvent(new Event('pagehide'));h.document.visibilityState='hidden';h.document.dispatchEvent(new Event('visibilitychange'));await microtasks();assert.equal(h.requests.length,0);
  h.fresh().flush();await h.tick(2999);assert.equal(h.requests.length,0);await h.tick(1);assert.equal(h.requests.length,1);assert.equal(h.requests[0].data.p_layout.value,7);
 });
 await run('An older response neither acknowledges newer edits nor shortens their new 5-second wait',async h=>{
  h.hold=true;h.store.save('original',layout(1));await h.tick(5000);assert.equal(h.requests.length,1);
  await h.tick(1000);h.store.save('original',layout(2));await h.tick(1000);await h.release();assert.equal(h.store.pendingCount,1);assert.equal(h.store.layout('original').value,2);
  await h.tick(3999);assert.equal(h.requests.length,1);await h.tick(1);assert.equal(h.requests.length,2);assert.equal(h.requests[1].data.p_layout.value,2);assert.equal(h.requests[1].data.p_expected_revision,1);await h.release();assert.equal(h.maxActive,1);assert.equal(h.store.pendingCount,0);
 });
 await run('If the new deadline expires during an upload, its latest snapshot sends once after that upload completes',async h=>{
  h.hold=true;h.store.save('original',layout(1));await h.tick(5000);h.store.save('original',layout(2));await h.tick(1000);h.store.save('original',layout(3));await h.tick(5000);assert.equal(h.requests.length,1);
  await h.release();await h.tick(0);assert.equal(h.requests.length,2);assert.equal(h.requests[1].data.p_layout.value,3);assert.equal(h.maxActive,1);await h.release();await h.tick(10000);assert.equal(h.requests.length,2);
 });
 await run('A new edit replaces a failed-save retry with a fresh 5-second countdown',async h=>{
  h.fail=true;h.store.save('original',layout(1));await h.tick(5000);assert.equal(h.requests.length,1);assert.equal(h.store.status('original').state,'error');
  await h.tick(1000);h.fail=false;h.store.save('original',layout(2));await h.tick(4999);assert.equal(h.requests.length,1);await h.tick(1);assert.equal(h.requests.length,2);assert.equal(h.requests[1].data.p_layout.value,2);
 });
 await run('Legacy local-only designs migrate under the same ID and retain their names and layouts',async h=>{
  const row={id:'local-existing',name:'旧方案',template_id:'raw-shell',layout:layout(8),revision:0,updated_at:'',last_mutation_id:null};
  h.cache.set('home-simulator:supabase:nbdodqezyijrztikvkcd:v1:'+row.id,JSON.stringify({row,dirty:false,mutationId:'',local:true}));h.fresh().flush();
  await h.tick(4999);assert.equal(h.requests.length,0);await h.tick(1);assert.equal(h.requests[0].data.p_id,row.id);assert.equal(h.requests[0].data.p_name,row.name);assert.equal(h.requests[0].data.p_layout.value,8);assert.equal(h.store.pendingCount,0);
 });
 await run('Failures notify once per outage; success clears failure feedback without another error message',async h=>{
  h.fail=true;h.store.save('original',layout(1));await h.tick(5000);assert.equal(h.errors.length,1);await h.tick(2000);assert.equal(h.errors.length,1);
  h.fail=false;h.store.retry();await microtasks();assert.equal(h.successes.length,1);assert.equal(h.errors.length,1);
  h.fail=true;h.store.save('original',layout(2));await h.tick(5000);assert.equal(h.errors.length,2);
 });
 await run('Unauthenticated edits remain queued and report login failure; signing in resumes the same design',async h=>{
  h.authorized=false;h.store.writable=false;h.store.save('raw-shell',layout(9));await h.tick(5000);assert.equal(h.requests.length,0);assert.equal(h.errors.length,1);assert.equal(h.store.pendingCount,1);
  h.authorized=true;h.store.writable=true;h.store.retry();await microtasks();assert.equal(h.rows.get('raw-shell').layout.value,9);assert.equal(h.store.pendingCount,0);assert.equal(h.successes.length,1);
 });
 await run('Explicit local simulations wait quietly for login, then upload their original ID',async h=>{
  h.authorized=false;h.store.writable=false;const draft=h.store.create('模拟草稿','raw-shell',layout(10),true,true);await h.tick(6000);assert.equal(h.requests.length,0);assert.equal(h.errors.length,0);assert.equal(h.store.pendingCount,1);
  h.authorized=true;h.store.writable=true;h.store.retry();await microtasks();assert.equal(h.rows.get(draft.id).layout.value,10);assert.equal(h.store.pendingCount,0);
 });
 fs.writeFileSync('test-results/autosave-debounce-report.json',JSON.stringify({passed:true,checks},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
