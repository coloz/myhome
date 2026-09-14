const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1536,height:1000}}),page=await context.newPage();
 const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const ready=async()=>{await page.waitForFunction(()=>window.__homeViewer&&document.querySelector('.loading')===null,{timeout:120000});await page.waitForTimeout(800);};
 const start=async()=>{await page.getByRole('button',{name:'第一人称漫游',exact:true}).click();await page.waitForFunction(()=>window.__homeViewer.snapshot().mode==='walk');await page.waitForTimeout(300);};
 const hold=async(key,ms=220)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);await page.waitForTimeout(100);};
 const near=(a,b)=>a.forEach((x,i)=>assert(Math.abs(x-b[i])<.002,`${a} differs from ${b}`));
 const entrances={original:[47.5/58.8,-408/58.8],alternative:[61.5/47,-316/47]};
 const atEntrance=(s,id)=>{const [x,z]=entrances[id];near(s.camera,[x,1.6,z-1.05]);assert(s.direction[2]>.999,'Entrance view must face indoors');};
 const nav=async()=>{
  const buttons=page.getByRole('group',{name:'查看方式',exact:true}).getByRole('button');
  assert.deepEqual(await buttons.allTextContents(),['自由查看','户型图','第一人称漫游']);assert.equal(await page.locator('.sidebar .main-nav').count(),0);
  const boxes=await Promise.all([0,1,2].map(i=>buttons.nth(i).boundingBox()));
  for(let i=1;i<3;i++){assert(boxes[i-1].x+boxes[i-1].width<=boxes[i].x+.5);assert(Math.abs(boxes[i].y-boxes[0].y)<1);}
 };
 const url=process.env.VIEWER_URL||'http://127.0.0.1:8788/';
 await page.goto(url);await ready();
 const initial=await snap(),furniture=initial.entities.map(e=>[e.id,e.position,e.rotation,e.scale]);
 await nav();await page.screenshot({path:'test-results/view-navigation.png'});
 const saved=await page.evaluate(()=>({...localStorage}));
 await start();let s=await snap();assert(s.walk.locked,'Native pointer lock did not start');atEntrance(s,'original');
 assert.equal(s.hiddenWalls,0);assert(s.parts.filter(p=>p.layer==='wall').every(p=>p.visible));assert(!s.showCeiling);
 checks.push('View controls sit to the left of roaming; scheme A starts outside the entrance at 160cm, facing indoors');
 await page.screenshot({path:'test-results/roaming-original.png'});
 for(const [key,axis,sign] of [['w','forward',1],['s','forward',-1],['a','right',-1],['d','right',1]]){
  const before=await snap();await hold(key);const after=await snap(),dx=after.camera[0]-before.camera[0],dz=after.camera[2]-before.camera[2],yaw=before.walk.yaw;
  const direction=axis==='forward'?[-Math.sin(yaw),-Math.cos(yaw)]:[Math.cos(yaw),-Math.sin(yaw)];
  assert((dx*direction[0]+dz*direction[1])*sign>.02,key+' did not move correctly');assert.equal(after.camera[1],1.6);
 }
 const stopped=await snap();await page.waitForTimeout(350);near((await snap()).camera,stopped.camera);
 checks.push('WASD moves relative to facing and stops when keys are released');
 const looked=await snap();await page.mouse.move(820,510,{steps:4});await page.mouse.move(965,610,{steps:8});await page.waitForTimeout(200);s=await snap();
 assert(Math.hypot(...s.direction.map((v,i)=>v-looked.direction[i]))>.05,'Mouse does not change view');
 assert(Math.abs(s.walk.pitch)<=Math.PI*.47);await hold('w');assert.equal((await snap()).camera[1],1.6);
 await page.keyboard.down('w');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const blurred=await snap();await page.waitForTimeout(250);near((await snap()).camera,blurred.camera);await page.keyboard.up('w');
 checks.push('Mouse controls yaw/pitch; height stays fixed and focus loss clears held keys');
 await page.keyboard.press('Delete');await page.keyboard.press('Control+z');
 assert.deepEqual((await snap()).entities.map(e=>[e.id,e.position,e.rotation,e.scale]),furniture);
 assert.deepEqual(await page.evaluate(()=>({...localStorage})),saved);
 await page.keyboard.press('Escape');await page.waitForTimeout(350);s=await snap();assert.equal(s.mode,initial.mode);assert(!s.walk.active&&!s.walk.locked);near(s.camera,initial.camera);near(s.target,initial.target);assert(s.hiddenWalls>0);
 checks.push('Roaming does not edit furniture or saves; Escape restores prior camera and wall setting');
 await page.getByRole('button',{name:'户型图',exact:false}).first().click();await page.waitForTimeout(300);const plan=await snap();
 await start();await page.keyboard.press('Escape');await page.waitForTimeout(250);assert.equal((await snap()).mode,'plan');near((await snap()).camera,plan.camera);
 await page.getByRole('button',{name:'查看次卧',exact:true}).click();await page.waitForTimeout(800);await start();s=await snap();
 atEntrance(s,'original');await hold('w',700);assert((await snap()).camera[2]>entrances.original[1]+.3,'Cannot walk through entrance into scheme A');
 await page.keyboard.press('Escape');
 checks.push('Plan view is restored on exit; entering from a bedroom still starts at the front door and can cross its threshold');
 await page.getByLabel('切换家装方案').selectOption('alternative');await ready();await start();atEntrance(await snap(),'alternative');
 await page.screenshot({path:'test-results/roaming-alternative.png'});
 await hold('w',700);assert((await snap()).camera[2]>entrances.alternative[1]+.3,'Cannot walk through entrance into scheme B');await page.keyboard.press('Escape');
 const distances=[];
 for(const shifted of [false,true]){
  await start();const before=await snap();if(shifted)await page.keyboard.down('Shift');
  assert(!(await snap()).walk.keys.some(k=>k.startsWith('Shift')),'Shift is still an active movement key');
  await hold('w',500);if(shifted)await page.keyboard.up('Shift');const after=await snap();distances.push(after.camera[2]-before.camera[2]);await page.keyboard.press('Escape');
 }
 assert(distances.every(d=>d>1.1&&d<1.7),'Walking does not use the former 2.8m/s fast speed: '+distances);
 assert(Math.abs(distances[0]-distances[1])<.25,'Shift still changes speed: '+distances);
 checks.push('Both entrance thresholds are passable; default speed is 2.8m/s and Shift does not accelerate');
 await page.getByRole('button',{name:'查看主卧',exact:true}).click();await start();atEntrance(await snap(),'alternative');
 // A scheme change must dispose input handlers and release any captured pointer.
 await page.getByLabel('切换家装方案').selectOption('original');await ready();s=await snap();assert.equal(s.mode,'overview');assert(!s.walk.active);assert.equal(await page.locator('canvas').count(),1);assert(await page.evaluate(()=>document.pointerLockElement===null));
 const afterSwitch=s.camera;await hold('w');near((await snap()).camera,afterSwitch);
 checks.push('Both schemes roam; switching models releases controls without leaking key handlers');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await nav();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'户型图',exact:true}).click();assert.equal((await snap()).mode,'plan');
 await page.getByRole('button',{name:'自由查看',exact:true}).click();assert.equal((await snap()).mode,'overview');
 await page.screenshot({path:'test-results/view-navigation-mobile.png'});
 checks.push('All three view controls remain adjacent and usable on mobile');
 // Embedded/restricted browsers can deny pointer lock; drag-to-look must remain usable.
 await context.close();const fallback=await browser.newContext({viewport:{width:1536,height:1000}});
 await fallback.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=function(){return Promise.reject(new DOMException('Unavailable in this frame','NotSupportedError'));};});
 const p=await fallback.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>window.__homeViewer&&document.querySelector('.loading')===null);await p.waitForTimeout(300);
 await p.getByRole('button',{name:'第一人称漫游',exact:true}).click();await p.getByText('鼠标未锁定：按住左键拖动转向，WASD 移动。').waitFor();
 const base=await p.evaluate(()=>window.__homeViewer.snapshot());const rect=await p.locator('canvas').boundingBox();
 await p.mouse.move(rect.x+rect.width*.45,rect.y+rect.height*.45);await p.mouse.down();await p.mouse.move(rect.x+rect.width*.6,rect.y+rect.height*.5,{steps:8});await p.mouse.up();
 const turned=await p.evaluate(()=>window.__homeViewer.snapshot());assert(Math.abs(turned.walk.yaw-base.walk.yaw)>.1);assert.deepEqual(turned.entities.map(e=>e.position),base.entities.map(e=>e.position));
 await p.keyboard.down('w');await p.waitForTimeout(250);await p.keyboard.up('w');assert.equal((await p.evaluate(()=>window.__homeViewer.snapshot())).camera[1],1.6);
 await p.getByRole('button',{name:'退出漫游 · Esc',exact:true}).click();assert.equal((await p.evaluate(()=>window.__homeViewer.snapshot())).mode,'overview');
 checks.push('Denied pointer lock falls back to mouse dragging with WASD and an exit button');
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/roaming-report.json',JSON.stringify({passed:true,checks,consoleErrors:errors},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,consoleErrors:errors}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
