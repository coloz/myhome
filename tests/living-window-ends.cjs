const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),T=require('three');
const read=path=>{const b=fs.readFileSync(path);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());};
const original=read('public/assets/home.glb');
const bounds=n=>{const b=new T.Box3();for(const p of original.meshes[n.mesh].primitives){const a=original.accessors[p.attributes.POSITION];b.union(new T.Box3(new T.Vector3(...a.min),new T.Vector3(...a.max)));}return b.applyMatrix4(n.matrix?new T.Matrix4().fromArray(n.matrix):new T.Matrix4().compose(new T.Vector3(...(n.translation??[0,0,0])),new T.Quaternion(...(n.rotation??[0,0,0,1])),new T.Vector3(...(n.scale??[1,1,1]))));};
const checks=[];
for(const [name,x,room] of [['客厅南窗左侧短实墙',0,'dining'],['客厅南窗右侧短实墙',420/58.8-.5,'living']]){
 const n=original.nodes.find(n=>n.extras?.sourceName===name);assert(n&&n.extras.layer==='wall');
 const b=bounds(n);for(const [value,expected] of [[b.min.x,x],[b.max.x,x+.5],[b.min.y,0],[b.max.y,3]])assert(Math.abs(value-expected)<1e-5,name);
 assert.equal(n.extras.room,room);assert.deepEqual(n.extras.rooms,[room]);
 checks.push(name+': 0.5m wide, 3m tall, correct room assignment');
}
// Model regeneration must preserve existing complete furniture and saved pivots.
const backup='../output/webgl/backups/living-window-end-walls/';
if(fs.existsSync(backup+'home.glb')){
 const old=read(backup+'home.glb'),furniture=g=>new Map(g.nodes.filter(n=>n.extras?.entityId).map(n=>[n.extras.entityId,n]));
 const before=furniture(old),after=furniture(original);assert.equal(before.size,121);assert.equal(after.size,121);
 for(const [id,n] of before){const next=after.get(id);assert(next,id);for(const field of ['matrix','translation','rotation','scale'])assert.deepEqual(next[field],n[field],id+' '+field);assert.deepEqual([...next.extras.componentNames].sort(),[...n.extras.componentNames].sort(),id+' components');}
 checks.push('All 121 furniture assemblies, components and transforms preserved');
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1536,height:1000}});
 const db=await require('./supabase-mock.cjs').installSupabaseMock(context,{signedIn:false});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  for(const [scheme,count] of [['original',121],['raw-shell',0]]){
   await page.goto((process.env.VIEWER_URL||'http://127.0.0.1:8788/')+'?scheme='+scheme);
   await page.waitForFunction(scheme=>window.__homeViewer?.snapshot().schemeId===scheme&&!document.querySelector('.loading'),scheme,{timeout:120000});
   await page.getByLabel('自动隐藏最近墙面',{exact:true}).uncheck();
   await page.getByRole('button',{name:'户型图',exact:true}).click();await page.waitForTimeout(800);
   const s=await page.evaluate(()=>window.__homeViewer.snapshot());assert.equal(s.entities.length,count);assert(s.webgl2);assert(!s.showCeiling);assert.equal(s.hiddenWalls,0);
   if(scheme==='raw-shell'){
    const solids=s.architecture.parts.filter(p=>p.id==='living-south'&&p.layer==='wall'&&p.bounds[0][1]<.1);
    assert.equal(solids.length,2);assert(solids.every(p=>p.visible&&!p.disabled));
    for(const p of solids)assert(Math.abs(p.bounds[1][0]-p.bounds[0][0]-.5)<1e-5);
   }
   await page.screenshot({path:'test-results/living-window-'+scheme+'-plan.png'});
   await page.getByRole('button',{name:'自由查看',exact:true}).click();await page.waitForTimeout(800);
   await page.screenshot({path:'test-results/living-window-'+scheme+'-overview.png'});
   checks.push(scheme+': loaded in browser, solid walls visible, floor plan/free view, ceiling remains hidden');
  }
  assert.equal(db.writes.length,0);assert.deepEqual(errors,[]);
  fs.writeFileSync('test-results/living-window-report.json',JSON.stringify({passed:true,checks,consoleErrors:errors},null,2));
  console.log('Living window end walls passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
