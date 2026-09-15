const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1536,height:1000},acceptDownloads:true});const errors=[],checks=[];
 await require('./supabase-mock.cjs').installSupabaseMock(p.context());
 p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 const ready=id=>p.waitForFunction(id=>window.__homeViewer?.snapshot().schemeId===id&&!document.querySelector('.loading'),id,{timeout:120000});
 const snap=()=>p.evaluate(()=>window.__homeViewer.snapshot());
 await p.goto(process.env.VIEWER_URL||'http://127.0.0.1:8788/');await ready('original');
 for(const [scheme,count] of [['original',121],['alternative',78]]){
  if(scheme==='alternative'){await p.getByLabel('切换家装方案').selectOption(scheme);await ready(scheme);}
  const start=await snap();assert.equal(start.exterior.trees,7);assert.equal(start.entities.length,count);assert(!start.exterior.visible);
  const saved=await p.evaluate(()=>({...localStorage}));
  for(const [name,slug] of [['客厅','living'],['次卧','guest'],['主卧','master']]){
   await p.getByRole('button',{name:'查看'+name,exact:true}).click();await p.getByRole('button',{name:'室内视角',exact:true}).click();
   await p.waitForTimeout(900);let s=await snap();assert.equal(s.mode,'eye');assert(!s.exterior.visible);assert(s.exterior.groundHeight<-8);
   await p.screenshot({path:'test-results/exterior-'+scheme+'-'+slug+'.png'});
  }
  assert.deepEqual((await snap()).entities.map(e=>[e.id,e.position]),start.entities.map(e=>[e.id,e.position]));
  assert.deepEqual(await p.evaluate(()=>({...localStorage})),saved);
  checks.push(scheme+': 7 tree crowns load but stay hidden in free and room views; navigation keeps furniture and saved layout unchanged');
  await p.getByRole('button',{name:'清水房',exact:true}).click();assert(!(await snap()).exterior.visible);
  assert((await snap()).parts.filter(x=>x.layer==='decor').every(x=>!x.visible));
  await p.getByRole('button',{name:'装修效果',exact:true}).click();
  await p.getByRole('button',{name:'户型图',exact:false}).click();assert(!(await snap()).exterior.visible);
  await p.getByRole('button',{name:'查看客厅',exact:true}).click();await p.waitForTimeout(800);assert(!(await snap()).exterior.visible);
  await p.getByRole('button',{name:'第一人称漫游',exact:true}).click();await p.waitForTimeout(300);
  assert.equal((await snap()).mode,'walk');assert((await snap()).exterior.visible);assert((await snap()).exterior.groundHeight<-8);
  await p.screenshot({path:'test-results/exterior-'+scheme+'-roaming.png'});
  await p.keyboard.press('Escape');await p.waitForTimeout(250);assert.equal((await snap()).mode,'room');assert(!(await snap()).exterior.visible);
  await p.getByRole('button',{name:'清水房',exact:true}).click();
  await p.getByRole('button',{name:'第一人称漫游',exact:true}).click();assert((await snap()).exterior.visible);
  // Pointer lock keeps the mouse on the canvas; activate the view button by keyboard.
  await p.getByRole('button',{name:'自由查看',exact:true}).focus();await p.keyboard.press('Enter');assert(!(await snap()).exterior.visible);assert.equal((await snap()).mode,'overview');
  await p.getByRole('button',{name:'装修效果',exact:true}).click();
  checks.push(scheme+': trees appear only during roaming, including raw mode; Escape and switching to free view hide them immediately');
 }
 await p.getByRole('button',{name:'户型图',exact:false}).click();
 const download=p.waitForEvent('download',{timeout:120000});await p.getByRole('button',{name:'导出当前 GLB',exact:false}).click();
 const bytes=fs.readFileSync(await(await download).path());const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)).trim());
 assert.equal(gltf.nodes.filter(n=>n.extras?.treeId).length,7);
 const cabinet=(await snap()).entities.find(e=>e.name==='电视背景白色收纳柜').id;
 assert(gltf.nodes.some(n=>n.extras?.entityId===cabinet));
 checks.push('GLB export includes all 7 exterior trees, including when exported from the floor plan');
 await p.getByRole('button',{name:'自由查看',exact:false}).click();await p.waitForTimeout(800);assert(!(await snap()).exterior.visible);await p.screenshot({path:'test-results/exterior-overview.png'});
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(650);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert((await snap()).webgl2);assert.deepEqual(errors,[]);
 fs.writeFileSync('test-results/exterior-report.json',JSON.stringify({passed:true,checks,consoleErrors:errors},null,2));
 console.log(JSON.stringify({passed:true,checks:checks.length,consoleErrors:errors}));await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
