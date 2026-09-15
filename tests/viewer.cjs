const {chromium}=require('playwright');
const fs=require('fs');const assert=require('assert');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1536,height:1000},deviceScaleFactor:1,acceptDownloads:true});
 await require('./supabase-mock.cjs').installSupabaseMock(context);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.VIEWER_URL||'http://127.0.0.1:8787/';
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const pause=()=>page.waitForTimeout(300);
 const nearGroups=s=>[...new Set(s.parts.filter(p=>p.layer==='wall'&&!p.visible&&p.cutaway).map(p=>p.cutaway))].sort();
 const middlePan=async(point)=>{
  const before=await snap(),r=await page.locator('canvas').boundingBox();
  const [x,y]=point??await page.evaluate(r=>{
   for(const [u,v] of [[.4,.6],[.55,.5],[.7,.6],[.3,.4]]){
    const p=[r.x+r.width*u,r.y+r.height*v];if(document.elementFromPoint(...p)?.tagName==='CANVAS')return p;
   }
   throw new Error('No unobstructed canvas point for middle pan');
  },r);
  await page.mouse.move(x,y);await page.mouse.down({button:'middle'});await page.mouse.move(x+70,y+35,{steps:10});await page.mouse.up({button:'middle'});await page.waitForTimeout(1000);
  const after=await snap(),delta=after.target.map((v,i)=>v-before.target[i]);
  assert(Math.hypot(...delta)>.05,'Middle drag did not pan the camera target');
  for(let i=0;i<3;i++)assert(Math.abs(after.camera[i]-before.camera[i]-delta[i])<.001,'Middle drag rotated or zoomed instead of panning');
  assert.deepEqual(after.entities.map(e=>e.position),before.entities.map(e=>e.position),'Middle drag moved furniture');
 };
 await page.goto(base);await page.waitForFunction(()=>window.__homeViewer,{timeout:120000});await pause();
 let s=await snap();assert(s.webgl2);assert(s.entities.length>80);assert(s.hiddenWalls>0);
 assert(s.parts.every(p=>!p.invalidMaterialGroups),'Material arrays require geometry draw groups');
 assert(!s.showCeiling&&s.parts.filter(p=>p.layer==='ceiling').every(p=>!p.visible),'Ceiling must be hidden by default');
 assert.equal(nearGroups(s).length,1,'Only one nearest wall assembly should be hidden');
 const initialCutaway=nearGroups(s);await page.waitForTimeout(1100);assert.deepEqual(nearGroups(await snap()),initialCutaway,'Far walls were progressively removed');
 await page.getByRole('button',{name:'户型图',exact:false}).first().click();await pause();assert.equal((await snap()).mode,'plan');
 await middlePan();await page.getByRole('button',{name:'重置视角',exact:false}).click();await pause();
 await page.getByRole('button',{name:'清水房',exact:true}).click();await pause();s=await snap();
 assert(s.parts.filter(x=>['decor','finish','greenery'].includes(x.layer)).every(x=>!x.visible),'Raw mode retains decoration');
 assert(s.parts.some(x=>x.layer==='shell-floor'&&x.visible),'Raw mode loses floors');
 await page.getByRole('button',{name:'装修效果',exact:true}).click();
 await page.getByRole('button',{name:'隐藏客厅装修',exact:true}).click();await pause();s=await snap();
 assert(s.parts.filter(x=>x.room==='living'&&['decor','finish'].includes(x.layer)).every(x=>!x.visible));
 assert(s.parts.some(x=>x.room==='guest'&&x.layer==='decor'&&x.visible),'Other room decoration changed');
 await page.getByRole('button',{name:'显示客厅装修',exact:true}).click();
 await page.getByRole('button',{name:'隐藏次卧',exact:true}).click();await pause();assert(!(await snap()).states.guest.visible);
 await page.getByRole('button',{name:'恢复全部房间可见',exact:false}).click();assert((await snap()).states.guest.visible);
 // Visit every room, check selected destination and that the GL canvas continues drawing.
 for(const name of ['客厅','餐厅','厨房','玄关','手工区','次卧','书房 / 衣帽间','主卧','主卫','家政干区','次卫','入户光厅']){
  await page.getByRole('button',{name:'查看'+name,exact:true}).click();await page.waitForTimeout(720);assert((await snap()).triangles>0);
 }
 await page.getByRole('button',{name:'查看客厅',exact:true}).click();await page.waitForTimeout(750);
 await page.getByRole('button',{name:'室内视角',exact:true}).click();await page.waitForTimeout(750);assert.equal((await snap()).mode,'eye');
 await page.getByRole('button',{name:'自由查看',exact:false}).first().click();await page.waitForTimeout(800);
 await page.getByLabel('自动隐藏最近墙面').uncheck();await pause();s=await snap();assert.equal(s.hiddenWalls,0);assert(s.parts.filter(x=>x.layer==='wall').every(x=>x.visible));assert(s.parts.filter(x=>x.layer==='ceiling').every(x=>!x.visible),'Disabling wall hiding must not show ceilings');
 await page.getByLabel('显示天花板',{exact:true}).check();await pause();assert((await snap()).parts.some(x=>x.layer==='ceiling'&&x.visible));
 await page.getByLabel('自动隐藏最近墙面').check();await pause();assert((await snap()).parts.some(x=>x.layer==='ceiling'&&x.visible),'Wall control changed ceiling preference');
 await page.getByLabel('显示天花板',{exact:true}).uncheck();await pause();assert.equal(nearGroups(await snap()).length,1);
 // Orbit the actual model: only the nearest assembly disappears, and previous walls return.
 await page.getByRole('button',{name:'家具编辑 ✓',exact:true}).click();
 const canvasBounds=await page.locator('canvas').boundingBox(),observed=new Set();
 for(let turn=0;turn<4;turn++){
  await page.mouse.move(canvasBounds.x+canvasBounds.width*.5,canvasBounds.y+canvasBounds.height*.5);await page.mouse.down();await page.mouse.move(canvasBounds.x+canvasBounds.width*.75,canvasBounds.y+canvasBounds.height*.5,{steps:14});await page.mouse.up();await page.waitForTimeout(1000);
  s=await snap();const ids=nearGroups(s);assert(ids.length<=1,'Orbit hid distant walls');for(const id of ids)observed.add(id);
  assert(s.parts.filter(x=>x.layer==='ceiling').every(x=>!x.visible));
 }
 assert(observed.size>1,'Orbit did not select a new front wall');await page.getByRole('button',{name:'浏览模式',exact:true}).click();
 // Add, direct-drag, numeric rotate, recolor, duplicate, delete, undo/redo.
 await page.getByRole('button',{name:'查看客厅',exact:true}).click();await page.waitForTimeout(750);
 const count=(await snap()).entities.filter(x=>!x.deleted).length;
 await page.getByRole('button',{name:'添加蛋黄旋转单椅',exact:true}).click();await pause();s=await snap();
 assert.equal(s.entities.filter(x=>!x.deleted).length,count+1);
 const id=s.selection;assert(id?.startsWith('add-'));let en=s.entities.find(x=>x.id===id);
 await middlePan(en.screen);en=(await snap()).entities.find(x=>x.id===id);
 const original=[...en.position];
 await page.mouse.move(...en.screen);await page.mouse.down();await page.mouse.move(en.screen[0]+95,en.screen[1]+48,{steps:12});await page.mouse.up();await pause();
 en=(await snap()).entities.find(x=>x.id===id);assert(Math.hypot(en.position[0]-original[0],en.position[2]-original[2])>.2,'Direct drag failed');
 await page.getByLabel('家具旋转角度').fill('45');await page.getByLabel('家具旋转角度').press('Tab');await pause();
 await page.getByRole('button',{name:'家具配色 #91b0c1',exact:true}).click();
 await page.getByRole('button',{name:'复制物件',exact:false}).click();await pause();assert.equal((await snap()).entities.filter(x=>!x.deleted).length,count+2);
 await page.getByRole('button',{name:'删除物件',exact:true}).click();await pause();assert.equal((await snap()).entities.filter(x=>!x.deleted).length,count+1);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await pause();assert.equal((await snap()).entities.filter(x=>!x.deleted).length,count+2);
 await page.getByRole('button',{name:'重做',exact:true}).click();await pause();assert.equal((await snap()).entities.filter(x=>!x.deleted).length,count+1);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出方案',exact:false}).click();const dl=await downloadPromise;
 fs.mkdirSync('test-results',{recursive:true});await dl.saveAs('test-results/layout.json');const layout=JSON.parse(fs.readFileSync('test-results/layout.json'));
 const saved=layout.entities.find(x=>x.id===id);assert.equal(saved.color,'#91b0c1');assert(Math.abs(saved.rotation-Math.PI/4)<.01);
 const glbDownload=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前 GLB',exact:false}).click();const glb=await glbDownload;await glb.saveAs('test-results/edited.glb');const glbBytes=fs.readFileSync('test-results/edited.glb');assert.equal(glbBytes.toString('ascii',0,4),'glTF');assert(glbBytes.length>1_000_000);await page.getByRole('button',{name:'关闭提示',exact:true}).click();
 const glbJson=JSON.parse(glbBytes.toString('utf8',20,20+glbBytes.readUInt32LE(12)));
 const exportedChair=glbJson.nodes.find(n=>n.extras?.furnitureId===id);assert(exportedChair,'Edited furniture missing from GLB');
 for(let axis=0;axis<3;axis++)assert(Math.abs((exportedChair.translation??[0,0,0])[axis]-saved.position[axis])<.0001,'GLB furniture position changed');
 assert(Math.abs(exportedChair.rotation[1]-Math.sin(saved.rotation/2))<.0001,'GLB rotation changed');
 await page.reload();await page.waitForFunction(()=>window.__homeViewer,{timeout:120000});await pause();
 s=await snap();assert.equal(s.entities.filter(x=>!x.deleted).length,count+1,'Autosave did not restore');assert.deepEqual(s.entities.find(x=>x.id===id).position,saved.position);
 await page.getByRole('button',{name:'恢复初始布置',exact:false}).click();await pause();assert.equal((await snap()).entities.filter(x=>!x.deleted).length,count);
 await page.locator('input[type=file]').setInputFiles('test-results/layout.json');await pause();assert.equal((await snap()).entities.filter(x=>!x.deleted).length,count+1,'Import roundtrip failed');
 fs.writeFileSync('test-results/invalid.json',JSON.stringify({...layout,version:99}));
 await page.locator('input[type=file]').setInputFiles('test-results/invalid.json');await pause();assert((await page.locator('.toast').textContent()).includes('不匹配'));
 await page.getByRole('button',{name:'关闭提示',exact:true}).click();
 // Restore default for screenshots; document user-visible desktop/mobile states.
 await page.getByRole('button',{name:'恢复初始布置',exact:false}).click();
 await page.getByRole('button',{name:'户型图',exact:false}).first().click();await page.waitForTimeout(800);
 await page.locator('.editor-panel').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:'test-results/final-plan.png'});
 await page.getByRole('button',{name:'查看客厅',exact:true}).click();await page.waitForTimeout(800);await page.screenshot({path:'test-results/final-living.png'});
 await page.getByRole('button',{name:'清水房',exact:true}).click();await pause();await page.screenshot({path:'test-results/final-raw.png'});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'房间 ☰',exact:true}).click();await page.getByRole('button',{name:'查看客厅',exact:true}).click();await page.getByRole('button',{name:'户型图',exact:false}).first().click();await page.waitForTimeout(800);
 assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)),'Mobile overflow');
 await page.screenshot({path:'test-results/mobile.png'});
 await page.getByRole('button',{name:'家具 ＋',exact:true}).click();await pause();assert(await page.locator('.editor-panel.open').count());await page.screenshot({path:'test-results/mobile-editor.png'});
 assert.deepEqual(errors,[]);
 const checks=['WebGL2','GLB load','material draw groups','all 12 room navigation','plan and interior cameras','nearest wall only / no progressive removal / orbit restoration','ceiling off by default / independent switch','middle-button pan in plan and perspective / furniture unchanged','whole/per-room raw finish','per-room visibility','catalog add','direct dragging','rotation','material color','duplicate','delete','undo/redo','autosave reload','JSON export/import roundtrip','edited GLB export preserves transforms','invalid import validation','mobile navigation/no overflow'];
 fs.writeFileSync('test-results/report.json',JSON.stringify({passed:true,checks,consoleErrors:errors},null,2));
 console.log('PASS: '+checks.length+' browser checks');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
