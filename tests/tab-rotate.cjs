const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8788/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1536,height:1000}});
 const db=await require('./supabase-mock.cjs').installSupabaseMock(context,{signedIn:false});
 const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),{},{timeout:120000});
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,actual+' != '+expected);
 let id;const entity=async()=>(await snap()).entities.find(e=>e.id===id);
 const select=async()=>{await page.getByRole('button',{name:'选中物件',exact:true}).click();await page.locator('.object-list button').filter({hasText:'双门冰箱'}).last().click();await page.waitForTimeout(750);};
 try{
  await page.goto(BASE+'?scheme=raw-shell');await ready();
  await page.getByRole('button',{name:'添加双门冰箱',exact:true}).click();id=(await snap()).selection;assert(id);
  const before=await entity(),history=(await snap()).history.undo;
  const components=await page.evaluate(id=>window.__homeViewer.components(id),id);assert(components.parts.length>1);
  // Selection made from the catalog works immediately, without another canvas click.
  await page.keyboard.press('Tab');near((await entity()).rotation,before.rotation+Math.PI/2);assert.equal((await snap()).selection,id);assert.equal((await snap()).history.undo,history+1);
  assert.deepEqual((await entity()).position,before.position);
  const after=await page.evaluate(id=>window.__homeViewer.components(id),id);
  assert.deepEqual(after.parts.map(p=>p.local),components.parts.map(p=>p.local));assert(after.parts.every((p,i)=>p.world.some((v,j)=>Math.abs(v-components.parts[i].world[j])>1e-5)),'Door/body did not rotate together');
  await page.getByRole('button',{name:'选中物件',exact:true}).click();assert.equal(await page.getByLabel('家具旋转角度').inputValue(),'90');
  await page.getByRole('button',{name:'撤销',exact:true}).click();near((await entity()).rotation,before.rotation);
  await page.getByRole('button',{name:'重做',exact:true}).click();near((await entity()).rotation,before.rotation+Math.PI/2);
  checks.push('Tab rotates the complete selected furniture by 90 degrees without moving it; inspector, undo and redo agree');
  await select();await page.getByLabel('家具旋转角度').fill('45');await page.getByLabel('家具旋转角度').press('Tab');near((await entity()).rotation,Math.PI/4);assert(await page.getByLabel('家具比例').evaluate(el=>el===document.activeElement));
  await page.getByLabel('家具比例').press('Shift+Tab');near((await entity()).rotation,Math.PI/4);assert(await page.getByLabel('家具旋转角度').evaluate(el=>el===document.activeElement));
  await page.locator('canvas').focus();await page.keyboard.down('Tab');await page.keyboard.down('Tab');await page.keyboard.down('Tab');await page.keyboard.up('Tab');near((await entity()).rotation,Math.PI*3/4);
  assert(await page.locator('canvas').evaluate(el=>el===document.activeElement));
  for(let i=0;i<3;i++)await page.keyboard.press('Tab');near((await entity()).rotation,Math.PI*9/4);
  checks.push('Numeric-input Tab and Shift+Tab retain focus navigation; held Tab rotates once and repeated presses add exactly 90 degrees');
  const saved=(await entity()).rotation;await page.reload();await ready();near((await entity()).rotation,saved);
  await select();await page.getByRole('button',{name:'新建方案',exact:true}).click();const oldFocus=await page.evaluate(()=>document.activeElement?.outerHTML);await page.keyboard.press('Tab');near((await entity()).rotation,saved);assert.notEqual(await page.evaluate(()=>document.activeElement?.outerHTML),oldFocus);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'锁定物件',exact:true}).click();await page.locator('canvas').focus();await page.keyboard.press('Tab');near((await entity()).rotation,saved);assert.equal((await snap()).selection,null);await page.getByRole('button',{name:'锁定物件',exact:true}).click();
  await select();await page.getByRole('button',{name:'家具编辑 ✓',exact:true}).click();await page.locator('canvas').focus();await page.keyboard.press('Tab');near((await entity()).rotation,saved);await page.getByRole('button',{name:'浏览模式',exact:true}).click();
  await select();await page.getByRole('button',{name:'第一人称漫游',exact:true}).click();await page.keyboard.press('Tab');near((await entity()).rotation,saved);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'墙体 / 装修',exact:true}).click();await page.getByRole('button',{name:'选择墙体',exact:true}).click();const walls=(await snap()).architecture.walls;await page.locator('canvas').focus();await page.keyboard.press('Tab');near((await entity()).rotation,saved);assert.deepEqual((await snap()).architecture.walls,walls);
  checks.push('Rotation survives reload; dialogs, locked objects, browsing, roaming and wall editing do not trigger furniture rotation');
  await select();await page.locator('canvas').focus();await page.keyboard.press('Tab');near((await entity()).rotation,saved+Math.PI/2);await page.screenshot({path:'test-results/tab-rotate.png'});
  assert.equal(db.writes.length,0);assert.deepEqual(errors,[]);
  fs.writeFileSync('test-results/tab-rotate-report.json',JSON.stringify({passed:true,base:BASE,checks,consoleErrors:errors},null,2));console.log(checks.join('\n'));
 }catch(e){await page.screenshot({path:'test-results/tab-rotate-failure.png'});throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
