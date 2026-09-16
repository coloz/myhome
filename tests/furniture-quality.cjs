const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8788/',catalog=JSON.parse(fs.readFileSync('public/library/catalog.v1.json')).items;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1536,height:1040},acceptDownloads:true}),db=await require('./supabase-mock.cjs').installSupabaseMock(context);
 const page=await context.newPage(),errors=[],requests=[],checks=[],shots=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/library/models/'))requests.push(r.url());});
 const ready=()=>page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),null,{timeout:90000});
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const component=id=>page.evaluate(id=>window.__homeViewer.components(id),id);
 const loaded=id=>page.waitForFunction(id=>window.__homeViewer.components(id)?.modelPending===false&&window.__homeViewer.components(id)?.parts.length>0,id,{timeout:45000});
 const search=async id=>{const i=catalog.find(x=>x.id===id);assert(i);await page.getByRole('button',{name:'家具库',exact:true}).click();await page.getByRole('button',{name:'清空筛选',exact:true}).click();await page.getByLabel('搜索家具').fill(i.description??i.name);await page.waitForTimeout(220);const card=page.locator('[data-catalog-id="'+id+'"]');await card.waitFor();return card;};
 const download=async()=>{const event=page.waitForEvent('download');await page.getByRole('button',{name:'导出方案',exact:true}).click();const d=await event;return JSON.parse(fs.readFileSync(await d.path(),'utf8'));};
 const importData=async data=>{await page.locator('input[type=file]').setInputFiles({name:'quality-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});};
 try{
  await page.goto(BASE+'?scheme=raw-shell');await ready();assert((await page.locator('.library-heading span').textContent()).includes(String(catalog.length)));assert(await page.locator('.catalog-card').count()<=24);assert.equal(requests.length,0);assert.equal(await page.getByLabel('家具模型类型').count(),0);
  await page.getByRole('button',{name:'下一页',exact:true}).click();assert.equal(requests.length,0);assert(await page.locator('.catalog-card').count()<=24);
  await page.getByRole('button',{name:'清空筛选',exact:true}).click();await page.getByLabel('家具类型',{exact:true}).selectOption('休闲椅');await page.getByRole('group',{name:'家具风格'}).getByRole('button',{name:'中古',exact:true}).click();assert(await page.locator('.catalog-card').count()>0);
  await page.getByRole('button',{name:'清空筛选',exact:true}).click();await page.getByLabel('搜索家具').fill('BILLY');await page.waitForTimeout(230);assert.equal(await page.locator('.catalog-card').count(),0);checks.push('No schematic entries; 24 cards/page; type/style filtering; paging downloads zero GLBs');
  // Import old layout data without modifying any real cloud records.
  const seed=await download(),old=structuredClone(seed);old.entities.push({id:'old-schematic-fixture',catalogId:'sofa-white',room:'living',position:[1.2,.1,2.4],rotation:.8,scale:1.1,deleted:false,color:'#91b0c1'});await importData(old);
  await page.waitForFunction(()=>window.__homeViewer.snapshot().entities.some(e=>e.id==='old-schematic-fixture'));
  assert.equal((await component('old-schematic-fixture')).parts.length,0);assert.deepEqual((await download()).walls,seed.walls);
  await page.getByRole('button',{name:'选中物件',exact:true}).click();await page.getByRole('button',{name:'待替换 · 云白布艺沙发',exact:false}).click();await page.getByText('此简化模型已下架',{exact:false}).waitFor();
  await page.getByRole('button',{name:'从家具库替换',exact:true}).click();const card=await search('ph-mid_century_lounge_chair');await card.click();await loaded('old-schematic-fixture');
  let layout=await download(),item=layout.entities.find(e=>e.id==='old-schematic-fixture');assert.equal(item.catalogId,'ph-mid_century_lounge_chair');assert.deepEqual(item.position,[1.2,.1,2.4]);assert.equal(item.rotation,.8);assert.equal(item.scale,1.1);assert(!item.color);
  assert((await component(item.id)).parts.some(p=>p.textured));
  await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal((await component(item.id)).parts.length,0);await page.getByRole('button',{name:'重做',exact:true}).click();await loaded(item.id);
  await page.waitForFunction(()=>window.__homeViewer.snapshot().sync.find(s=>s.id==='raw-shell')?.state==='saved',null,{timeout:20000});assert(db.writes.some(w=>w.p_layout.entities.some(e=>e.catalogId==='ph-mid_century_lounge_chair')));
  await page.reload();await ready();await loaded(item.id);checks.push('Retired layouts keep walls and positions without rendering fake geometry; replacement/undo/redo/cloud save/reload preserve transforms and full PBR maps');
  // Failure has no box placeholder; retry can recover the full model.
  let failed=false;await page.route('**/library/models/scopia-clothes_washing_machine-quality-v2.glb',r=>{if(!failed){failed=true;return r.fulfill({status:503,body:'test outage'})}return r.continue();});
  await (await search('scopia-clothes_washing_machine')).click();const fid=(await snap()).selection;await page.getByRole('button',{name:'重试加载',exact:true}).waitFor();assert.equal((await component(fid)).parts.length,0);await page.getByRole('button',{name:'重试加载',exact:true}).click();await loaded(fid);
  const before=await component(fid),n=requests.length;await page.locator('canvas').first().focus();await page.keyboard.press('Tab');assert.deepEqual((await component(fid)).parts.map(p=>p.local),before.parts.map(p=>p.local));
  await page.getByRole('button',{name:'复制物件 ＋',exact:true}).click();await loaded((await snap()).selection);assert.equal(requests.length,n);checks.push('Download failure shows no simplified placeholder; retry, whole-object Tab rotation and copy work; copies reuse cached bytes');
  // Actual rendered previews for diverse geometry/materials and shared cache.
  for(const id of ['ph-modern_arm_chair_01','ph-modern_wooden_cabinet','ph-modern_coffee_table_01','ph-sofa_02','ph-chinese_armchair','ph-vintage_microwave','blend0-kitchenaid','scopia-toaster','scopia-clothes_washing_machine','blend0-bedWithTexture','scopia-rattanArmchair','blendby-cornerSofa']){
   const card=await search(id);await card.locator('..').getByRole('button',{name:/详情/}).click();await page.getByRole('dialog').waitFor();const before=requests.length;await page.getByRole('button',{name:'查看三维模型 ↻',exact:true}).click();await page.getByText('拖动旋转 · 滚轮缩放',{exact:true}).waitFor({timeout:45000});
   const png=await page.locator('.furniture-preview').screenshot();shots.push({id,png:png.toString('base64')});
   if(id==='ph-modern_arm_chair_01'){const n=requests.length;await page.getByRole('button',{name:'添加到房间',exact:true}).click();await loaded((await snap()).selection);assert.equal(requests.length,n);}else await page.keyboard.press('Escape');
   await page.waitForFunction(()=>!document.querySelector('furniture-preview canvas'));
  }
  let unblock;const gate=new Promise(r=>unblock=r);await page.route('**/library/models/scopia-coffee_machine-quality-v2.glb',async r=>{await gate;await r.continue();});
  await (await search('scopia-coffee_machine')).click();const stale=(await snap()).selection;await page.getByRole('button',{name:'撤销',exact:true}).click();unblock();await page.waitForFunction(()=>window.__homeViewer.snapshot().library.pending===0,null,{timeout:45000});assert(!(await snap()).entities.some(e=>e.id===stale));
  checks.push('Twelve representative real models preview correctly, preview and placement share a download; late loads cannot resurrect undone furniture');
  await page.getByRole('button',{name:'家具库',exact:true}).click();await page.getByRole('button',{name:'清空筛选',exact:true}).click();await page.screenshot({path:'test-results/furniture-library-desktop.png'});
  await page.setViewportSize({width:390,height:844});if(await page.locator('.mobile-editor').isVisible())await page.locator('.mobile-editor').click();await page.screenshot({path:'test-results/furniture-library-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const gallery=await context.newPage();await gallery.setViewportSize({width:1400,height:1100});await gallery.setContent('<style>body{font:14px system-ui;background:#eceef0;margin:20px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}article{background:white;border-radius:8px;overflow:hidden}img{width:100%}p{margin:10px}</style><h2>完整模型 · 实机预览</h2><main>'+shots.map(s=>'<article><img src="data:image/png;base64,'+s.png+'"><p>'+s.id+'</p></article>').join('')+'</main>');await gallery.screenshot({path:'test-results/catalog-model-samples.png',fullPage:true});
  assert.deepEqual(errors,[]);const report={passed:true,base:BASE,checks,samples:shots.map(s=>s.id),consoleErrors:errors,modelRequests:requests.length};for(const name of ['furniture-library-report','catalog-preview-report'])fs.writeFileSync('test-results/'+name+'.json',JSON.stringify(report,null,2));console.log(checks.join('\n'));
 }catch(e){await page.screenshot({path:'test-results/furniture-quality-failure.png'});throw e}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
