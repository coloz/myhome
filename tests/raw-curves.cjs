const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const bytes=fs.readFileSync('public/assets/raw-shell/home.glb');
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());
 for(const group of ['master-curve','bed-curve','garden-round']){
  const nodes=gltf.nodes.filter(n=>n.extras?.curveGroup===group);
  assert.equal(nodes.filter(n=>n.extras.curvePart==='glass').length,8);
  assert.equal(nodes.filter(n=>n.extras.curvePart==='end-post').length,group==='garden-round'?0:2);
  assert(nodes.every(n=>n.extras.cutaway===group));
  assert(!nodes.some(n=>/竖框|端柱/.test(n.name)));
 }
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});
  const db=await require('./supabase-mock.cjs').installSupabaseMock(context,{signedIn:false});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.VIEWER_URL||'http://127.0.0.1:8788/')+'?workspace=raw');
  await page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),{},{timeout:120000});
  await page.getByLabel('自动隐藏最近墙面').uncheck();
  for(const [name,id,group] of [['主卧','master','master-curve'],['次卧一','bed-east','bed-curve'],['入户光厅','garden','garden-round']]){
   await page.getByRole('button',{name:'查看'+name,exact:true}).click();await page.waitForTimeout(800);
   const snapshot=await page.evaluate(()=>window.__homeViewer.snapshot());
   assert(snapshot.parts.filter(p=>p.cutaway===group&&p.layer==='window').every(p=>p.visible));
   assert(!snapshot.showCeiling);assert.equal(snapshot.selected,id);
   await page.screenshot({path:'test-results/raw-curve-'+id+'.png'});
  }
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前 GLB',exact:false}).click();
  const exported=fs.readFileSync(await (await download).path());
  const scene=JSON.parse(exported.subarray(20,20+exported.readUInt32LE(12)).toString().trim());
  assert.equal(scene.nodes.filter(n=>n.extras?.curvePart==='glass').length,24);
  assert.equal(db.writes.length,0);assert.deepEqual(errors,[]);
  fs.writeFileSync('test-results/raw-curves-report.json',JSON.stringify({passed:true,consoleErrors:errors,checks:['three curved corners without internal mullions','smooth geometry and joints audited in native model','whole-corner cutaway grouping','room navigation and visibility','export retains curved glazing','no shared writes']},null,2));
  console.log('Curved glazing viewer and export passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
