const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8788/';
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});
 const db=await require('./supabase-mock.cjs').installSupabaseMock(context,{signedIn:false});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const ready=async()=>{await page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),{},{timeout:120000});};
 const exportJSON=async()=>{const dl=page.waitForEvent('download');await page.getByRole('button',{name:'导出方案',exact:true}).click();return JSON.parse(fs.readFileSync(await (await dl).path(),'utf8'));};
 const select=async(name)=>{await page.getByRole('button',{name:'墙体 / 装修',exact:true}).click();await page.getByRole('button',{name:'选择墙体',exact:true}).click();const list=page.locator('.wall-list');if(await list.getAttribute('open')===null)await list.locator('summary').click();await list.getByRole('button').filter({hasText:name}).first().click();await page.waitForFunction(name=>document.querySelector('.wall-card strong')?.textContent===name,name);};
 try{
  await page.goto(BASE+'?workspace=raw');await ready();await page.waitForTimeout(500);
  let s=await snap();assert.equal(s.modelVersion,'2026-09-15-raw-shell');assert.equal(s.entities.length,0);assert.equal(s.architecture.walls.length,62);assert.equal(s.architecture.walls.filter(w=>!w.lock).length,9);assert(Object.values(s.states).every(v=>!v.decorated));assert(!s.showCeiling);assert(!s.exterior.visible);
  assert(!s.architecture.walls.some(w=>w.id==='bath-main-south'));assert.deepEqual(s.architecture.walls.find(w=>w.id==='bath-main-west').openings,[]);
  await page.screenshot({path:'test-results/raw-shell-overview.png'});
  await select('主卧西侧北段黑色实墙');assert(await page.getByLabel('墙体厚度',{exact:true}).isDisabled());assert(await page.getByRole('button',{name:'删除这堵墙'}).isDisabled());
  for(const name of ['入户门两侧固定墙体','光厅与客卫相邻固定墙体']){
   await select(name);
   for(const label of ['墙体中心X','墙体中心Z','墙体旋转角度','墙体厚度','墙体开门洞','墙体开窗'])assert(await page.getByLabel(label,{exact:true}).isDisabled());
   assert(await page.getByRole('button',{name:'删除这堵墙'}).isDisabled());
   await page.keyboard.press('Delete');assert((await snap()).architecture.walls.filter(w=>w.lock==='fixed').every(w=>!w.deleted));
  }
  await select('两个次卧之间灰色隔墙');assert(await page.getByLabel('墙体厚度',{exact:true}).isEnabled());await page.getByLabel('墙体厚度',{exact:true}).fill('.18');await page.getByLabel('墙体厚度',{exact:true}).press('Tab');
  s=await snap();assert.equal(s.architecture.walls.find(w=>w.id==='bedrooms-partition').thickness,.18);assert(s.architecture.parts.some(p=>p.id==='bedrooms-partition'&&p.dynamic));
  await page.getByRole('button',{name:'删除这堵墙'}).click();await page.waitForTimeout(800);s=await snap();assert(s.architecture.walls.find(w=>w.id==='bedrooms-partition').deleted);assert(s.architecture.parts.filter(p=>p.id==='bedrooms-partition').every(p=>p.disabled&&!p.visible));
  await page.getByRole('button',{name:'撤销',exact:true}).click();s=await snap();assert(!s.architecture.walls.find(w=>w.id==='bedrooms-partition').deleted);
  await page.getByRole('button',{name:'重做',exact:true}).click();await page.reload();await ready();s=await snap();assert(s.architecture.walls.find(w=>w.id==='bedrooms-partition').deleted,'Deleted wall restored after reload');
  await page.getByRole('button',{name:'墙体 / 装修',exact:true}).click();await page.getByRole('button',{name:'绘制新墙',exact:true}).click();
  const r=await page.locator('canvas').boundingBox();const point=(x,z)=>[r.x+r.width/2+(x-4.15)*r.height/15,r.y+r.height/2+(z+5.4)*r.height/15];
  await page.mouse.click(...point(4.4,-4.1));await page.mouse.move(...point(6,-4.1));await page.mouse.click(...point(6,-4.1));
  s=await snap();const w=s.architecture.walls.find(w=>w.id.startsWith('wall-'));assert(w,'Two-click wall not created');assert(Math.abs(w.a[0]-4.4)<.06);assert.equal(w.height,3);
  await page.getByLabel('墙体开门洞').check();s=await snap();assert.equal(s.architecture.walls.find(n=>n.id===w.id).openings.length,1);
  await page.getByLabel('墙体开门洞').uncheck();await page.getByLabel('墙体开窗').check();
  await page.getByLabel('洞口宽度',{exact:true}).fill('1');await page.getByLabel('洞口宽度',{exact:true}).press('Tab');
  await page.getByLabel('洞口底部高度',{exact:true}).fill('1.2');await page.getByLabel('洞口底部高度',{exact:true}).press('Tab');
  s=await snap();assert.equal(s.architecture.walls.find(n=>n.id===w.id).openings[0].kind,'window');assert.equal(s.architecture.walls.find(n=>n.id===w.id).openings[0].bottom,1.2);assert(s.architecture.parts.some(p=>p.id===w.id&&p.dynamic&&p.layer==='window'));
  await page.getByRole('button',{name:'选择墙体',exact:true}).click();const beforeMove=structuredClone(s.architecture.walls.find(n=>n.id===w.id));
  await page.mouse.move(...point(5.2,-4.1));await page.mouse.down();await page.mouse.move(...point(5.5,-4.1),{steps:8});await page.mouse.up();
  s=await snap();let moved=s.architecture.walls.find(n=>n.id===w.id);assert(Math.abs(moved.a[0]-beforeMove.a[0]-.3)<.06,'Wall drag did not move');assert.deepEqual(moved.openings,beforeMove.openings,'Window moved apart from wall');
  await page.getByLabel('墙体旋转角度').fill('15');await page.getByLabel('墙体旋转角度').press('Tab');
  s=await snap();moved=s.architecture.walls.find(n=>n.id===w.id);const cx=(moved.a[0]+moved.b[0])/2,cz=(moved.a[1]+moved.b[1])/2,L=Math.hypot(moved.b[0]-moved.a[0],moved.b[1]-moved.a[1]),handle=[cx-(moved.b[1]-moved.a[1])/L*.65,cz+(moved.b[0]-moved.a[0])/L*.65];
  await page.keyboard.down('Shift');await page.mouse.move(...point(...handle));await page.mouse.down();await page.mouse.move(...point(cx+Math.cos(Math.PI*.75)*.65,cz+Math.sin(Math.PI*.75)*.65),{steps:10});await page.mouse.up();await page.keyboard.up('Shift');
  s=await snap();const rotated=s.architecture.walls.find(n=>n.id===w.id);assert(Math.abs(Math.atan2(rotated.b[1]-rotated.a[1],rotated.b[0]-rotated.a[0])*180/Math.PI-45)<2,'Rotation handle failed');assert.deepEqual(rotated.openings,beforeMove.openings);
  await page.getByRole('button',{name:'撤销',exact:true}).click();await page.getByRole('button',{name:'重做',exact:true}).click();
  await select('次卧二南侧灰色隔墙');const originalDoor=(await snap()).architecture.walls.find(n=>n.id==='west-bedroom-south').openings[0];await page.getByLabel('墙体开窗').check();s=await snap();const shared=s.architecture.walls.find(n=>n.id==='west-bedroom-south');assert.equal(shared.openings.length,2);assert.deepEqual(shared.openings.find(o=>o.kind==='door'),originalDoor,'Opening a window replaced the door');
  await page.getByRole('button',{name:'退出',exact:true}).click();await page.getByLabel('装修材质应用范围').selectOption('living');await page.getByRole('button',{name:'浅蓝墙漆',exact:true}).click();await page.getByRole('button',{name:'浅色木地板',exact:true}).click();s=await snap();assert.equal(s.architecture.finishes.living.wall,'blue');assert.equal(s.architecture.finishes.living.floor,'light-oak');assert(s.states.living.decorated);assert(!s.states.master.decorated);assert(!s.states.garden.decorated);
  await page.getByRole('button',{name:'家具库',exact:true}).click();await page.getByRole('button',{name:'添加云白布艺沙发',exact:true}).click();s=await snap();assert.equal(s.entities.length,1);
  await page.getByRole('button',{name:'自由查看',exact:true}).click();await page.waitForTimeout(800);await page.screenshot({path:'test-results/raw-shell-decorated.png'});
  const saved=await exportJSON();assert(saved.walls.some(w=>w.deleted));assert(saved.finishes.living);fs.writeFileSync('test-results/raw-shell-layout.json',JSON.stringify(saved,null,2));
  const tamper=structuredClone(saved);tamper.walls.find(w=>w.lock==='structural').deleted=true;
  await page.locator('input[type=file]').setInputFiles({name:'locked-wall.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tamper))});await page.getByRole('status').filter({hasText:'黑色实墙与外围墙已锁定'}).waitFor();s=await snap();assert(s.architecture.walls.filter(w=>w.lock).every(w=>!w.deleted));
  // Snapshot imports are atomic: invalid furniture/geometry cannot bypass wall locks.
  const missing=structuredClone(saved);missing.walls=missing.walls.filter(w=>w.lock!=='exterior');await page.locator('input[type=file]').setInputFiles({name:'missing-wall.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(missing))});await page.getByRole('status').filter({hasText:'缺少原始墙体记录'}).waitFor();
  await page.getByRole('button',{name:'新建方案',exact:true}).click();await page.getByLabel('方案名称',{exact:true}).fill('隔墙方案验证');await page.getByRole('button',{name:'创建方案',exact:true}).click();await ready();const copy=await snap();assert(copy.schemeId.startsWith('local-'));assert.equal(copy.entities.length,1);assert(copy.architecture.walls.find(n=>n.id===w.id));
  await page.getByRole('button',{name:'恢复初始布置（可撤销）',exact:true}).click();s=await snap();assert.equal(s.entities.length,0);assert.equal(s.architecture.walls.length,62);assert(s.architecture.walls.every(w=>!w.deleted));assert(Object.values(s.states).every(v=>!v.decorated));
  await page.getByLabel('切换家装方案').selectOption('raw-shell');await ready();s=await snap();assert.equal(s.entities.length,1);assert(s.architecture.walls.find(n=>n.id===w.id),'Copy reset changed original design');
  await page.getByRole('button',{name:'清水房',exact:true}).click();await page.getByRole('button',{name:'第一人称漫游',exact:true}).click();s=await snap();assert.equal(s.mode,'walk');assert.equal(s.camera[1],1.6);assert(s.exterior.visible);const start=s.camera[2];await page.keyboard.down('w');await page.waitForTimeout(900);await page.keyboard.up('w');s=await snap();assert(s.camera[2]>start+.8,'Cannot walk in through entrance');await page.screenshot({path:'test-results/raw-shell-walk.png'});await page.keyboard.press('Escape');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前 GLB',exact:false}).click();const file=await (await download).path(),bytes=fs.readFileSync(file),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());assert.equal(bytes.toString('ascii',0,4),'glTF');const activeIds=new Set(json.nodes.map(n=>n.extras?.wallId).filter(Boolean));assert(!activeIds.has('bedrooms-partition'),'Deleted wall exported');assert(activeIds.has(w.id),'Added wall missing from exported GLB');
  await page.getByRole('button',{name:'墙体 / 装修',exact:true}).click();await page.getByRole('button',{name:'选择墙体',exact:true}).click();await page.screenshot({path:'test-results/raw-shell-wall-editor.png'});
  assert.equal(db.writes.length,0,'Local workbench wrote to shared database');assert.deepEqual(errors,[]);
  fs.writeFileSync('test-results/raw-shell-report.json',JSON.stringify({passed:true,consoleErrors:errors,rooms:10,walls:62,editable:9,checks:['raw default','master bath solid west/open south','window geometry audited separately','protected walls readonly','wall dimensions','delete/undo/redo/reload','two-click draw','door and window openings coexist','window dimensions and sill','wall pointer move and rotation handle','room finish presets','furniture add','JSON export and protected import','independent local designs','walk entrance and trees','GLB deleted and added walls','no shared database writes']},null,2));
 }catch(e){await page.screenshot({path:'test-results/raw-shell-error.png'});console.error(await page.locator('body').innerText());throw e;}finally{await browser.close();}
 console.log('Raw shell editor passed');
})().catch(e=>{console.error(e);process.exit(1);});




