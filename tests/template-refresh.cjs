const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const {installSupabaseMock}=require('./supabase-mock.cjs');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8788/';
const current=JSON.parse(fs.readFileSync('public/assets/raw-shell/project.json','utf8'));
const previous=JSON.parse(fs.readFileSync('tests/fixtures/raw-shell-revision5.json','utf8'));
const currentModel=fs.readFileSync('public/assets/raw-shell/home.glb');
// Simulate a browser/proxy retaining the former unversioned GLB. Its side
// blocks really are 18cm wide; metadata alone must not satisfy this regression.
function oldGlb(){
 const length=currentModel.readUInt32LE(12),g=JSON.parse(currentModel.subarray(20,20+length).toString());
 for(const n of g.nodes.filter(n=>n.extras?.wallId==='living-south')){
  const x=n.translation[0];
  if(n.extras.layer==='wall'&&Math.abs(x-.25)<.001){n.scale=[.36,1,1];n.translation[0]=.09;}
  else if(n.extras.layer==='wall'&&Math.abs(x-6.75)<.001){n.scale=[.36,1,1];n.translation[0]=6.91;}
  else{n.translation[0]=.18+(x-.5)*6.64/6;if(!n.name.includes('竖框'))n.scale=[6.64/6,1,1];}
 }
 const json=Buffer.from(JSON.stringify(g)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
 const tail=currentModel.subarray(20+length),header=Buffer.from(currentModel.subarray(0,20));
 header.writeUInt32LE(20+padded.length+tail.length,8);header.writeUInt32LE(padded.length,12);
 return Buffer.concat([header,padded,tail]);
}
const staleModel=oldGlb(),seed=JSON.parse(fs.readFileSync('test-results/raw-shell-layout.json','utf8'));
seed.modelRevision=5;seed.walls=seed.walls.map(w=>w.id==='living-south'?structuredClone(previous.walls.find(p=>p.id===w.id)):w);
const id='local-refresh-existing',key='home-simulator:design:'+id,cache='home-simulator:supabase:nbdodqezyijrztikvkcd:v1:';
const ready=(p,id)=>p.waitForFunction(id=>window.__homeViewer?.snapshot().schemeId===id&&!document.querySelector('.loading'),id,{timeout:120000});
const snap=p=>p.evaluate(()=>window.__homeViewer.snapshot());
const exported=async p=>{const dl=p.waitForEvent('download');await p.getByRole('button',{name:'导出方案',exact:true}).click();return JSON.parse(fs.readFileSync(await(await dl).path(),'utf8'));};
function checkFacade(s){
 assert.equal(s.modelRevision,current.revision);
 const w=s.architecture.walls.find(w=>w.id==='living-south');assert.equal(w.openings[0].start,.5);assert.equal(w.openings[0].end,6.5);
 const sides=s.architecture.parts.filter(p=>p.id==='living-south'&&p.layer==='wall'&&!p.disabled&&p.bounds[0][1]<.01);
 assert.equal(sides.length,2);assert(sides.every(p=>Math.abs(p.bounds[1][0]-p.bounds[0][0]-.5)<1e-5),'Stale GLB still displays 18cm ends');
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1536,height:1000},acceptDownloads:true});
 const db=await installSupabaseMock(context,{signedIn:false});let release=5;const models=[],errors=[],checks=[];
 await context.route('**/assets/raw-shell/project.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(release===5?previous:current)}));
 await context.route('**/assets/raw-shell/home.glb*',route=>{
  const v=new URL(route.request().url()).searchParams.get('v');models.push(v);
  return route.fulfill({contentType:'model/gltf-binary',body:v?.includes(':6:')?currentModel:staleModel});
 });
 await context.addInitScript(({seed,id,key,cache})=>{
  const real=window.fetch;window.templateFetches=[];
  window.fetch=(input,options)=>{const url=String(input?.url??input);if(url.endsWith('/project.json'))window.templateFetches.push({url,cache:options?.cache??input?.cache??'default'});return real(input,options);};
  if(!localStorage.getItem('refresh-test-seeded')){
   localStorage.setItem(key,JSON.stringify(seed));
   localStorage.setItem(cache+id,JSON.stringify({row:{id,name:'已编辑的旧方案',template_id:'raw-shell',layout:seed,revision:0,updated_at:'',last_mutation_id:null},dirty:false,mutationId:'',local:true}));
   localStorage.setItem('refresh-test-seeded','1');
  }
 },{seed,id,key,cache});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(BASE+'?scheme='+id);await ready(page,id);assert.equal((await snap(page)).modelRevision,5);
  release=6;
  await page.getByRole('button',{name:'新建方案',exact:true}).click();await page.getByLabel('方案名称',{exact:true}).fill('最新原始户型');await page.getByLabel('起始布置').selectOption('raw-shell');
  await page.getByRole('button',{name:'创建方案',exact:true}).click();await page.waitForFunction(id=>window.__homeViewer?.snapshot().schemeId!==id&&!document.querySelector('.loading')&&!document.querySelector('.scheme-dialog[open]'),id);
  let s=await snap(page);const created=s.schemeId;checkFacade(s);assert.equal(s.entities.length,0);assert.equal(s.architecture.walls.length,current.walls.length);assert(s.architecture.walls.every(w=>!w.deleted));
  assert.deepEqual((await exported(page)).finishes,{});assert(Object.values(s.states).every(r=>r.visible&&!r.decorated));
  assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),cache+created)).row.layout.modelRevision,6);
  checks.push('New original template re-fetches revision 6 after an already-open revision 5; blank corrected geometry and finishes, independent of edited source');
  await page.reload();await ready(page,created);checkFacade(await snap(page));
  await require('./scheme-ui.cjs').selectScheme(page,id);await ready(page,id);checkFacade(await snap(page));
  const restored=await exported(page);assert.deepEqual(restored.entities,seed.entities);assert.deepEqual(restored.rooms,seed.rooms);assert.deepEqual(restored.finishes,seed.finishes);
  assert.deepEqual(restored.walls.filter(w=>w.id!=='living-south'),seed.walls.filter(w=>w.id!=='living-south'));
  await page.reload();await ready(page,id);checkFacade(await snap(page));assert.deepEqual((await exported(page)).entities,seed.entities);
  checks.push('Refresh and re-opening an existing local draft upgrade the fixed facade while preserving furniture, custom partitions, finishes and room state');
  await page.getByRole('button',{name:'新建方案',exact:true}).click();await page.getByLabel('方案名称',{exact:true}).fill('保留修改副本');
  assert.equal(await page.getByLabel('起始布置').inputValue(),'copy');await page.getByRole('button',{name:'创建方案',exact:true}).click();await page.waitForFunction(id=>window.__homeViewer?.snapshot().schemeId!==id&&!document.querySelector('.loading')&&!document.querySelector('.scheme-dialog[open]'),id);
  assert.deepEqual(await exported(page),restored);checkFacade(await snap(page));
  checks.push('Explicit copy still preserves the complete edited design');
  const fetches=await page.evaluate(()=>window.templateFetches);assert(fetches.length>=2&&fetches.every(r=>r.cache==='no-store'));assert(models.every(Boolean));assert(models.some(v=>v.includes(':5:'))&&models.some(v=>v.includes(':6:')));
  checks.push('Manifest requests bypass stale caches; GLB URLs change with the model revision');
  assert.equal(db.writes.length,0);assert.deepEqual(errors,[]);
  // Check the served model as well, with no model/manifest interception.
  const live=await browser.newContext({viewport:{width:1536,height:1000}}),liveDb=await installSupabaseMock(live,{signedIn:false});
  const actual=await live.newPage();actual.on('pageerror',e=>errors.push(e.message));await actual.goto(BASE+'?scheme=raw-shell');await ready(actual,'raw-shell');
  await actual.getByRole('button',{name:'新建方案',exact:true}).click();await actual.getByLabel('方案名称',{exact:true}).fill('原始户型修正版验证');await actual.getByLabel('起始布置').selectOption('raw-shell');
  await actual.getByRole('button',{name:'创建方案',exact:true}).click();await actual.waitForFunction(()=>window.__homeViewer?.snapshot().schemeId.startsWith('local-')&&!document.querySelector('.loading')&&!document.querySelector('.scheme-dialog[open]'));
  checkFacade(await snap(actual));await actual.getByLabel('自动隐藏最近墙面',{exact:true}).uncheck();await actual.waitForTimeout(350);
  await actual.screenshot({path:'test-results/template-refresh-live.png'});assert.equal(liveDb.writes.length,0);assert.deepEqual(errors,[]);await live.close();
  checks.push('Actual served assets: new raw-template design has the corrected 0.5m end walls');
  fs.writeFileSync('test-results/template-refresh-report.json',JSON.stringify({passed:true,checks,consoleErrors:errors,modelUrls:models},null,2));console.log(checks.join('\n'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
