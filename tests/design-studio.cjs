const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8790/';
(async()=>{
 fs.mkdirSync('test-results/design',{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
 await require('./supabase-mock.cjs').installSupabaseMock(context,{signedIn:false});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading')&&window.__homeViewer.snapshot().library.pending===0,{},{timeout:120000});
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const studio=()=>page.getByRole('dialog',{name:'家装设计工作台'});
 const open=()=>page.getByRole('button',{name:'家装设计',exact:true}).click();
 try{
  await page.goto(BASE+'?scheme=original');await ready();
  await open();await studio().getByRole('button',{name:'比较三种需求'}).click();await studio().getByRole('heading',{name:'三种生活，同一户型'}).waitFor();
  await studio().getByLabel('总预算',{exact:true}).fill('-1');await studio().getByRole('button',{name:'生成布置预览'}).click();await studio().getByRole('alert').waitFor();
  await studio().getByLabel('总预算',{exact:true}).fill('240000');await studio().getByRole('button',{name:'生成布置预览'}).click();await studio().getByRole('button',{name:'创建独立方案并查看 3D'}).waitFor();
  assert(!await studio().getByRole('button',{name:'创建独立方案并查看 3D'}).isDisabled());
  await page.screenshot({path:'test-results/design/studio.png'});
  await studio().getByRole('button',{name:'关闭设计工作台'}).click();
  const names=['亲子成长','双人办公','长辈同住'],counts=[23,23,20],created=[];
  for(let i=0;i<names.length;i++){
   await open();await studio().getByRole('button',{name:'读取 MCP 方案'}).click();
   await studio().getByRole('button',{name:'模拟示例 · '+names[i]+' ↗',exact:true}).click();
   await studio().getByRole('button',{name:'创建独立方案并查看 3D'}).click();await studio().waitFor({state:'hidden'});await ready();
   let s=await snap();assert.equal(s.entities.filter(e=>!e.deleted).length,counts[i]);assert.equal(s.modelVersion,'2026-09-15-raw-shell');created.push(s.schemeId);assert.equal(await page.locator('.save-error').count(),0);
   assert(Object.values(s.states).some(r=>r.decorated));
   await page.getByRole('button',{name:'自由查看',exact:true}).click();await page.waitForTimeout(700);
   await page.screenshot({path:'test-results/design/'+['family','work','elder'][i]+'-3d.png'});
   await page.getByRole('button',{name:'户型图',exact:true}).click();await page.waitForTimeout(700);
   await page.screenshot({path:'test-results/design/'+['family','work','elder'][i]+'-plan.png'});
   const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出方案',exact:true}).click();const layout=JSON.parse(fs.readFileSync(await (await pending).path(),'utf8'));
   assert.equal(layout.design.brief.scenario,['family','work','elder'][i]);assert.equal(layout.entities.filter(e=>!e.deleted).length,counts[i]);
   if(i===0)assert(layout.entities.some(e=>e.catalogId==='detail-bed-single'));
   if(i===1)for(const id of ['detail-standing-desk','detail-desk'])assert(layout.entities.some(e=>e.catalogId===id));
   fs.writeFileSync('test-results/design/'+['family','work','elder'][i]+'-browser-layout.json',JSON.stringify(layout,null,2));
   await page.reload();await ready();s=await snap();assert.equal(s.schemeId,created[i]);assert.equal(s.entities.filter(e=>!e.deleted).length,counts[i]);
   if(i===0){
    await page.getByRole('button',{name:'选中物件',exact:true}).click();await page.locator('.object-list button').first().click();await page.getByRole('button',{name:'删除物件',exact:true}).click();
    assert.equal((await snap()).entities.filter(e=>!e.deleted).length,22);await page.getByRole('button',{name:'撤销',exact:true}).click();await ready();assert.equal((await snap()).entities.filter(e=>!e.deleted).length,23);
    const undoDownload=page.waitForEvent('download');await page.getByRole('button',{name:'导出方案',exact:true}).click();assert.equal(JSON.parse(fs.readFileSync(await(await undoDownload).path(),'utf8')).design.brief.scenario,'family');
   }
   await open();await studio().getByRole('button',{name:'检查当前装修'}).click();assert((await studio().innerText()).includes('0 项冲突'));await studio().getByRole('button',{name:'关闭设计工作台'}).click();
  }
  assert.equal(new Set(created).size,3);
  await page.getByRole('button',{name:'第一人称漫游',exact:true}).click();await page.waitForFunction(()=>window.__homeViewer.snapshot().mode==='walk');await page.keyboard.press('Escape');
  // Metadata stays with undo/redo, and switching restores each independent archive.
  await page.locator('[data-scheme-id="'+created[0]+'"]').click();await ready();assert.equal((await snap()).entities.filter(e=>!e.deleted).length,23);
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'方案与房间',exact:true}).click();await page.getByRole('button',{name:'从生活需求开始设计 ↗ 三种场景 · 布置检查 · 预算比较'}).click();
  assert(await studio().isVisible());assert(await studio().evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:'test-results/design/mobile.png'});
  assert.deepEqual(errors,[]);fs.writeFileSync('test-results/design/browser-evidence.json',JSON.stringify({created,counts,errors,checks:['three MCP designs rendered','JSON metadata','reload persistence','independent designs','current analysis','roaming','mobile dialog']},null,2));
  console.log('PASS: three MCP designs rendered, exported, reloaded and checked; roaming and mobile layout verified.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
