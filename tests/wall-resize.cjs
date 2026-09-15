const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const near=(a,b)=>assert(Math.abs(a-b)<.012,`${a} != ${b}`);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});
 const db=await require('./supabase-mock.cjs').installSupabaseMock(context,{signedIn:false});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const ready=()=>page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),{},{timeout:120000});
 try{
  await page.goto((process.env.VIEWER_URL||'http://127.0.0.1:8788/')+'?workspace=raw');await ready();
  await page.getByRole('button',{name:'墙体 / 装修',exact:true}).click();await page.getByRole('button',{name:'绘制新墙',exact:true}).click();
  const r=await page.locator('canvas').boundingBox(),scale=r.height/15;
  const pt=(x,z)=>[r.x+r.width/2+(x-4.15)*scale,r.y+r.height/2+(z+5.4)*scale];
  await page.mouse.click(...pt(4.4,-4.1));await page.mouse.click(...pt(6,-4.1));
  const id=(await snap()).architecture.walls.find(w=>w.id.startsWith('wall-')).id;
  await page.getByLabel('墙体开窗').check();await page.getByRole('button',{name:'选择墙体',exact:true}).click();
  const wall=s=>s.architecture.walls.find(w=>w.id===id),original=wall(await snap());
  assert.equal((await snap()).architecture.handles.filter(h=>h.kind==='resize').length,8);
  async function drag(end,side,along,across,{cancel=false,steps=8}={}){
   const s=await snap(),w=wall(s),h=s.architecture.handles.find(h=>h.kind==='resize'&&h.end===end&&h.side===side);
   const L=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),ux=(w.b[0]-w.a[0])/L,uz=(w.b[1]-w.a[1])/L;
   await page.mouse.move(...h.screen);await page.mouse.down();
   await page.mouse.move(h.screen[0]+(ux*along-uz*across)*scale,h.screen[1]+(uz*along+ux*across)*scale,{steps});
   if(cancel)await page.keyboard.press('Escape');await page.mouse.up();return await snap();
  }
  let before=await snap(),s=await drag(1,0,.4,0);near(wall(s).b[0],6.4);near(wall(s).thickness,.12);assert.deepEqual(wall(s).a,original.a);assert.equal(s.history.undo,before.history.undo+1);assert.deepEqual(wall(s).openings,original.openings);
  before=s;s=await drag(1,1,.2,.08);near(wall(s).b[0],6.6);near(wall(s).thickness,.2);near(wall(s).a[1]-wall(s).thickness/2,original.a[1]-original.thickness/2);assert.equal(s.history.undo,before.history.undo+1);
  await page.getByRole('button',{name:'撤销',exact:true}).click();assert.deepEqual(wall(await snap()),wall(before));await page.getByRole('button',{name:'重做',exact:true}).click();assert.deepEqual(wall(await snap()),wall(s));
  await page.mouse.click(...pt((wall(s).a[0]+wall(s).b[0])/2,(wall(s).a[1]+wall(s).b[1])/2));
  s=await drag(-1,0,.1,0);near(wall(s).a[0],4.5);near(wall(s).openings[0].start,.1);near(wall(s).b[0],6.6);
  before=s;s=await drag(-1,0,.5,0,{steps:1});assert.deepEqual(wall(s),wall(before),'Shortening cut through window');assert.equal(s.history.undo,before.history.undo);
  before=s;s=await drag(0,-1,0,.08);near(wall(s).thickness,.12);near(wall(s).a[1]+wall(s).thickness/2,wall(before).a[1]+wall(before).thickness/2);assert.deepEqual(wall(s).openings,wall(before).openings);
  await page.getByLabel('墙体旋转角度').fill('35');await page.getByLabel('墙体旋转角度').press('Tab');
  before=await snap();s=await drag(1,1,.1,.04);const angle=w=>Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0]);near(angle(wall(s)),angle(wall(before)));near(wall(s).thickness,.16);
  before=s;s=await drag(1,1,.15,.04,{cancel:true});assert.deepEqual(wall(s),wall(before),'Escape failed to cancel resize');assert.equal(s.history.undo,before.history.undo);
  await page.getByRole('button',{name:'选择墙体',exact:true}).click();const list=page.locator('.wall-list');await list.locator('summary').click();await list.getByRole('button').filter({hasText:'新增隔墙'}).click();
  await page.screenshot({path:'test-results/wall-resize-handles.png'});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出方案',exact:true}).click();const saved=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));assert.deepEqual(saved.walls.find(w=>w.id===id),wall(before));
  await page.reload();await ready();assert.deepEqual(wall(await snap()),wall(before),'Resized wall lost on reload');
  await page.getByRole('button',{name:'墙体 / 装修',exact:true}).click();await page.getByRole('button',{name:'选择墙体',exact:true}).click();await page.locator('.wall-list summary').click();await page.locator('.wall-list').getByRole('button').filter({hasText:'入户门两侧固定墙体'}).click();assert.equal((await snap()).architecture.handles.length,0);
  assert.deepEqual(errors,[]);assert.equal(db.writes.length,0);
  fs.writeFileSync('test-results/wall-resize-report.json',JSON.stringify({passed:true,consoleErrors:errors,checks:['8 resize handles','end drag changes length','corner drag changes length and thickness','opposite edge anchored','opening size retained','invalid opening truncation rejected','side drag changes thickness','rotated wall axes retained','one undo step per gesture','Escape cancels preview','reload and JSON retain resized wall','fixed walls have no handles','no shared writes']},null,2));
  console.log('Wall edge/corner resizing passed');
 }catch(e){await page.screenshot({path:'test-results/wall-resize-error.png'});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
