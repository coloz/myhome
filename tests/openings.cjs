const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const near=(a,b)=>assert(Math.abs(a-b)<.011,`${a} != ${b}`);
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});
 const db=await require('./supabase-mock.cjs').installSupabaseMock(context,{signedIn:false});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot()),ready=()=>page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),{},{timeout:120000});
 const dialog=page.getByRole('dialog',{name:'墙面正视编辑'}),face=dialog.locator('.opening-canvas');
 const input=field=>dialog.locator(`[data-field="${field}"]`);
 const edit=async(field,value)=>{await input(field).fill(String(value));await input(field).press('Tab');};
 async function point(x,y){const b=await face.boundingBox(),r=await face.locator('[data-wall-face]').evaluate(el=>({x:+el.getAttribute('x'),y:+el.getAttribute('y'),height:+el.getAttribute('height')})),s=r.height/3;return [b.x+r.x+x*s,b.y+r.y+(3-y)*s];}
 async function draw(kind,a,b){await dialog.getByRole('button',{name:kind,exact:true}).click();await page.mouse.move(...await point(...a));await page.mouse.down();await page.mouse.move(...await point(...b),{steps:5});await page.mouse.up();}
 async function drag(selector,dx,dy,cancel=false){const b=await dialog.locator(selector).boundingBox(),r=await face.locator('[data-wall-face]').getAttribute('height'),s=+r/3;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx*s,b.y+b.height/2-dy*s,{steps:5});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
 const exportJSON=async()=>{const dl=page.waitForEvent('download');await page.getByRole('button',{name:'导出方案',exact:true}).click();return JSON.parse(fs.readFileSync(await (await dl).path(),'utf8'));};
 try{
  await page.goto((process.env.VIEWER_URL||'http://127.0.0.1:8788/')+'?workspace=raw');await ready();
  await page.getByRole('button',{name:'墙体 / 装修',exact:true}).click();await page.getByRole('button',{name:'绘制新墙',exact:true}).click();
  const r=await page.locator('canvas').boundingBox(),pt=(x,z)=>[r.x+r.width/2+(x-4.15)*r.height/15,r.y+r.height/2+(z+5.4)*r.height/15];
  await page.mouse.click(...pt(1,-2));await page.mouse.click(...pt(6,-2));
  let s=await snap();const id=s.architecture.walls.find(w=>w.id.startsWith('wall-')).id,wall=s=>s.architecture.walls.find(w=>w.id===id);
  assert.equal(s.architecture.tool,'select');assert.equal(s.architecture.selected,id);assert.equal(s.architecture.handles.length,9);
  await page.mouse.click(...pt(5.5,-3));assert.equal((await snap()).architecture.walls.length,s.architecture.walls.length,'Draw did not end');
  await page.mouse.click(...pt(3.5,-2));await page.getByRole('button',{name:'可视化编辑门窗',exact:true}).click();await dialog.waitFor();
  const beforeView=await snap();
  await draw('画窗',[.3,1],[1.5,2.3]);s=await snap();let window=wall(s).openings.find(o=>o.kind==='window');assert(window?.id);near(window.start,.3);near(window.bottom,1);near(window.end,1.5);assert.equal(await dialog.locator('[data-handle]').count(),8);
  const windowId=window.id;let previous=s;
  await drag(`[data-opening-id="${windowId}"]`,.2,.1);s=await snap();window=wall(s).openings.find(o=>o.id===windowId);near(window.start,.5);near(window.bottom,1.1);assert.equal(s.history.undo,previous.history.undo+1);
  await drag('[data-handle="1,1"]',.2,.1);s=await snap();window=wall(s).openings.find(o=>o.id===windowId);near(window.end-window.start,1.4);near(window.top-window.bottom,1.4);
  previous=s;await drag('[data-handle="1,1"]',.15,.1,true);assert.deepEqual(wall(await snap()),wall(previous));
  await dialog.getByRole('button',{name:'撤销门窗编辑'}).click();near((wall(await snap()).openings[0].end-wall(await snap()).openings[0].start),1.2);
  await dialog.getByRole('button',{name:'重做门窗编辑'}).click();assert.deepEqual(wall(await snap()),wall(previous));
  await draw('画门洞',[3.8,.5],[2.9,2.2]);s=await snap();let door=wall(s).openings.find(o=>o.kind==='door');assert(door);near(door.bottom,0);near(door.start,2.9);near(door.top,2.2);const doorId=door.id;assert.equal(await dialog.locator('[data-handle]').count(),5);assert(await input('y').isDisabled());
  await drag(`[data-opening-id="${doorId}"]`,.25,.4);s=await snap();door=wall(s).openings.find(o=>o.id===doorId);near(door.start,3.15);near(door.bottom,0);
  await drag('[data-handle="1,0"]',.2,0);await drag('[data-handle="0,1"]',0,.1);s=await snap();door=wall(s).openings.find(o=>o.id===doorId);near(door.end-door.start,1.1);near(door.top,2.3);
  previous=s;await edit('x',80);assert.deepEqual(wall(await snap()),wall(previous));assert((await dialog.getByRole('status').innerText()).includes('重叠'));
  await dialog.getByRole('button',{name:'换一面查看'}).click();await page.waitForFunction(()=>document.querySelector('.opening-dialog [data-field="x"]').value==='75');near(+await input('x').inputValue(),75);await edit('x',65);s=await snap();door=wall(s).openings.find(o=>o.id===doorId);near(door.start,3.25);near(door.end,4.35);await dialog.getByRole('button',{name:'换一面查看'}).click();await page.waitForFunction(()=>document.querySelector('.opening-dialog [data-field="x"]').value==='325');
  await draw('画窗',[3.25,2.5],[4.35,2.9]);s=await snap();assert.equal(wall(s).openings.length,3,'Transom above door rejected');const transomId=wall(s).openings.find(o=>o.kind==='window'&&o.bottom>2).id;
  // Stable identities survive horizontal sorting and delete/undo.
  await dialog.getByLabel('选择门窗洞口').selectOption(windowId);await edit('x',180);assert.equal(wall(await snap()).openings.find(o=>o.id===windowId).start,1.8);
  await dialog.getByLabel('选择门窗洞口').selectOption(transomId);await dialog.getByRole('button',{name:'删除洞口 · 恢复墙面'}).click();assert.equal(wall(await snap()).openings.length,2);
  await dialog.getByRole('button',{name:'撤销门窗编辑'}).click();assert(wall(await snap()).openings.some(o=>o.id===transomId));
  await dialog.getByLabel('选择门窗洞口').selectOption(windowId);await dialog.getByRole('button',{name:'复制洞口',exact:true}).click();assert.equal(wall(await snap()).openings.length,4);
  await dialog.getByRole('button',{name:'撤销门窗编辑'}).click();assert.equal(wall(await snap()).openings.length,3);
  await dialog.getByLabel('选择门窗洞口').selectOption(doorId);await dialog.screenshot({path:'test-results/openings-desktop.png'});
  await dialog.getByRole('button',{name:'完成 · 返回'}).click();s=await snap();assert.deepEqual(s.camera,beforeView.camera);assert.deepEqual(s.target,beforeView.target);assert.deepEqual(s.states,beforeView.states);assert.equal(s.showCeiling,beforeView.showCeiling);
  const layout=await exportJSON();assert.deepEqual(layout.walls.find(w=>w.id===id),wall(s));
  // GLB actual wall solids must exclude both door and stacked window, including after rotation.
  await page.getByLabel('墙体旋转角度').fill('15');await page.getByLabel('墙体旋转角度').press('Tab');s=await snap();const exportWall=wall(s);
  const dl=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前 GLB',exact:false}).click();const bytes=fs.readFileSync(await (await dl).path());const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());
  const nodes=gltf.nodes.filter(n=>n.extras?.wallId===id&&n.mesh!==undefined),openingNodes=nodes.filter(n=>n.extras?.openingId);assert(openingNodes.some(n=>n.extras.openingId===transomId));assert(openingNodes.some(n=>n.extras.openingId===doorId));
  let volume=0;for(const n of nodes.filter(n=>n.extras.layer==='wall')){const a=gltf.accessors[gltf.meshes[n.mesh].primitives[0].attributes.POSITION];volume+=(a.max[0]-a.min[0])*(a.max[1]-a.min[1])*(a.max[2]-a.min[2]);}
  const expected=(5*3-exportWall.openings.reduce((v,o)=>v+(o.end-o.start)*(o.top-o.bottom),0))*exportWall.thickness;assert(Math.abs(volume-expected)<.002,`Wall volume ${volume} != ${expected}`);
  await page.reload();await ready();assert.deepEqual(wall(await snap()),exportWall,'Openings lost on reload');
  const select=async(name)=>{await page.getByRole('button',{name:'墙体 / 装修',exact:true}).click();await page.getByRole('button',{name:'选择墙体',exact:true}).click();const list=page.locator('.wall-list');if(await list.getAttribute('open')===null)await list.locator('summary').click();await list.getByRole('button').filter({hasText:name}).click();};
  await select('入户门两侧固定墙体');await page.getByRole('button',{name:'查看门窗正视图',exact:true}).click();assert(await dialog.getByRole('button',{name:'画窗',exact:true}).isDisabled());assert(await dialog.getByRole('button',{name:'画门洞',exact:true}).isDisabled());assert.equal(await dialog.locator('[data-handle]').count(),0);const lockedBefore=await snap();await dialog.getByRole('button',{name:'选择 / 移动',exact:true}).click();await page.keyboard.press('Delete');assert.deepEqual((await snap()).architecture.walls,lockedBefore.architecture.walls);await dialog.getByRole('button',{name:'完成 · 返回'}).click();
  await select('新增隔墙');await page.getByRole('button',{name:'可视化编辑门窗',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await dialog.getByLabel('选择门窗洞口').selectOption(windowId);await dialog.screenshot({path:'test-results/openings-mobile.png'});
  // Actual touch input: one gesture commits once and cancellation rolls back.
  await face.scrollIntoViewIfNeeded();const b=await dialog.locator(`[data-opening-id="${windowId}"]`).boundingBox(),cdp=await context.newCDPSession(page),x=b.x+b.width/2,y=b.y+b.height/2;
  previous=await snap();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-8,y:y-8}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.deepEqual(wall(await snap()),wall(previous));
  await cdp.detach();await dialog.getByRole('button',{name:'完成 · 返回'}).click();
  // Undoing the creation of the wall from its own editor must close the editor
  // and restore camera controls, rather than leave an invisible modal session.
  await page.setViewportSize({width:1600,height:1100});await page.getByRole('button',{name:'绘制新墙',exact:true}).click();
  await page.mouse.click(...pt(3,-3));await page.mouse.click(...pt(4.5,-3));const count=(await snap()).architecture.walls.length;
  await page.getByRole('button',{name:'可视化编辑门窗',exact:true}).click();await dialog.getByRole('button',{name:'撤销门窗编辑'}).click();await dialog.waitFor({state:'hidden'});assert.equal((await snap()).architecture.walls.length,count-1);
  const target=(await snap()).target;await page.mouse.move(...pt(4.7,-3));await page.mouse.down({button:'middle'});await page.mouse.move(pt(4.7,-3)[0]+40,pt(4.7,-3)[1]+20,{steps:5});await page.mouse.up({button:'middle'});await page.waitForTimeout(150);assert.notDeepEqual((await snap()).target,target,'Camera stayed frozen after wall undo');
  assert.deepEqual(errors,[]);assert.equal(db.writes.length,0);
  fs.writeFileSync('test-results/openings-report.json',JSON.stringify({passed:true,consoleErrors:errors,checks:['draw wall auto-selects','window draw/move/8 handles','door floor anchor/5 handles','one undo per gesture','Escape cancellation','2D overlap rejection','front/back coordinates','door transom coexistence','stable IDs and copy/delete/undo','camera and room settings preserved','JSON and reload persistence','rotated GLB opening IDs and wall volume','fixed entrance protected','mobile layout and touch cancel','no shared writes']},null,2));console.log('Door/window visual editing passed');
 }catch(e){await page.screenshot({path:'test-results/openings-error.png'});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
