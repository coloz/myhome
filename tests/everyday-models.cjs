const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8788/',items=JSON.parse(fs.readFileSync('public/library/catalog.v1.json')).items;
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}),context=await browser.newContext({viewport:{width:1536,height:1040}});await require('./supabase-mock.cjs').installSupabaseMock(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const checks=[];
 try{await page.goto(BASE+'?scheme=raw-shell');await page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),null,{timeout:90000});
 for(const id of ['detail-pegboard','detail-kitchen-sink','detail-standing-desk','detail-bed-oak','ph-steel_frame_shelves_01','ph-desk_lamp_arm_01']){
  const item=items.find(i=>i.id===id);await page.getByRole('button',{name:'家具库',exact:true}).click();await page.getByRole('button',{name:'清空筛选',exact:true}).click();await page.getByLabel('搜索家具').fill(item.name);
  const card=page.locator(`[data-catalog-id="${id}"]`);await card.waitFor();await card.locator('..').getByRole('button',{name:/详情/}).click();
  if(id.startsWith('detail-'))assert(await page.locator('.construction-details li').count()>=3);
  await page.getByRole('button',{name:'查看三维模型 ↻',exact:true}).click();await page.getByText('拖动旋转 · 滚轮缩放',{exact:true}).waitFor({timeout:45000});await page.locator('.furniture-preview').screenshot({path:`test-results/${id}-live.png`});
  await page.getByRole('button',{name:'添加到房间',exact:true}).click();await page.waitForFunction(()=>{const v=window.__homeViewer;return v.components(v.snapshot().selection)?.modelPending===false},null,{timeout:45000});
  const before=await page.evaluate(()=>{const v=window.__homeViewer;return v.components(v.snapshot().selection)});assert(before.parts.length>=1);
  const expected=[item.dimensions[0],item.dimensions[2],item.dimensions[1]];before.bounds.forEach((v,i)=>assert(Math.abs(v-expected[i])<.002,id+' dimensions'));
  await page.locator('canvas').first().focus();await page.keyboard.press('Tab');const after=await page.evaluate(()=>{const v=window.__homeViewer;return v.components(v.snapshot().selection)});assert.deepEqual(after.parts.map(p=>p.local),before.parts.map(p=>p.local));assert.notDeepEqual(after.transform,before.transform);
  checks.push({id,parts:before.parts.length,size:before.bounds});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/everyday-models-report.json',JSON.stringify({passed:true,checks,consoleErrors:errors},null,2));console.log('Six new models preview, place at specified dimensions and rotate as whole objects');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
