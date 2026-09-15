const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const project=JSON.parse(fs.readFileSync('public/assets/raw-shell/project.json','utf8'));
const saved=JSON.parse(fs.readFileSync('test-results/raw-shell-layout.json','utf8'));
const revision4=JSON.parse(fs.readFileSync('tests/fixtures/raw-shell-revision4.json','utf8'));
const key='home-simulator:raw-shell:2026-09-15:v1';
const withIds=w=>({...structuredClone(w),openings:w.openings.map((o,i)=>({...o,id:o.id??`${w.id}:opening:${i}`}))});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const checks=[],errors=[];
 try{
  for(const revision of [1,2,3,4]){
   const old=structuredClone(saved);old.modelRevision=revision;
   old.walls=old.walls.map(w=>structuredClone(project.layoutUpdate.wallUpdates.find(c=>c.before.id===w.id&&(revision<3||(revision<4&&c.restoreFixed)||c.preserveEdited))?.before??w));
   // The old master bathroom had a west door and a complete south partition.
   for(const id of ['bath-main-west','bath-main-south']){
    old.walls=old.walls.filter(w=>w.id!==id);
    old.walls.push(structuredClone(revision4.walls.find(w=>w.id===id)));
   }
   if(revision<3)for(const retired of project.layoutUpdate.retiredWalls)if(!old.walls.some(w=>w.id===retired.id))old.walls.push(structuredClone(retired));
   // Preserve a deliberate user edit to a retired partition as a custom wall.
   if(revision<3)old.walls.find(w=>w.id==='entry-east').thickness=.18;
   if(revision<4){
    old.walls.find(w=>w.id==='entry-door').deleted=true;
    const moved=old.walls.find(w=>w.id==='guest-bath-west-top');moved.a[0]+=.3;moved.b[0]+=.3;
   }
   const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
   const db=await require('./supabase-mock.cjs').installSupabaseMock(context,{signedIn:false});
   await context.addInitScript(({old,key})=>{
    if(!localStorage.getItem('migration-seeded')){
     localStorage.setItem(key,JSON.stringify(old));
     localStorage.setItem('home-simulator:raw-workspace:v1',JSON.stringify([{id:'raw-shell',name:'保留我的装修',layout:old}]));
     localStorage.setItem('migration-seeded','1');
    }
   },{old,key});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   const ready=()=>page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),{},{timeout:120000});
   await page.goto((process.env.VIEWER_URL||'http://127.0.0.1:8788/')+'?workspace=raw');await ready();
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出方案',exact:true}).click();
   const upgraded=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
   assert.equal(upgraded.modelRevision,project.revision);assert.deepEqual(upgraded.entities,old.entities);
   assert.deepEqual(upgraded.rooms,old.rooms);assert.deepEqual(upgraded.finishes,old.finishes);
   assert(!upgraded.walls.some(w=>w.id==='kitchen-partition'));
   assert(!upgraded.walls.some(w=>w.id==='bath-main-south'));
   assert.deepEqual(upgraded.walls.find(w=>w.id==='bath-main-west').openings,[]);
   if(revision<3)assert.equal(upgraded.walls.find(w=>w.id==='wall-migrated-entry-east').thickness,.18);
   for(const change of project.layoutUpdate.wallUpdates)assert.deepEqual(upgraded.walls.find(w=>w.id===change.after.id),withIds(change.after));
   const backup=await page.evaluate(({key,current})=>JSON.parse(localStorage.getItem(key+':before-model-revision-'+current)),{key,current:project.revision});
   assert.equal(backup.modelRevision,revision);
   await page.reload();await ready();
   const snapshot=await page.evaluate(()=>window.__homeViewer.snapshot());
   assert.equal(snapshot.entities.length,old.entities.length);
   assert(!snapshot.architecture.walls.some(w=>w.id==='bath-main-south'));
   assert.deepEqual(snapshot.architecture.walls.find(w=>w.id==='bath-main-west').openings,[]);
   if(revision<3)assert(snapshot.architecture.walls.some(w=>w.id==='wall-migrated-entry-east'));
   for(const id of ['entry-door','guest-bath-west-top'])assert.deepEqual(snapshot.architecture.walls.find(w=>w.id===id),withIds(project.walls.find(w=>w.id===id)));
   assert.equal(db.writes.length,0);
   checks.push('Revision '+revision+': furniture, finishes, other edited partitions and backup preserved; protected walls remain locked; master bath west solid and south open; reload persists');
   await context.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync('test-results/raw-shell-migration-report.json',JSON.stringify({passed:true,consoleErrors:errors,checks},null,2));
  console.log('Raw workspace migration passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
