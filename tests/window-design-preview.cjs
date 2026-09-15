const {chromium}=require('playwright'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:780,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('../tmp/window-editor-preview.html')).href);
  const f=page.frameLocator('iframe'),root=f.locator('#window-wall-design');await f.locator('[data-window="1"]').waitFor();
  const read=field=>f.locator(`[data-field="${field}"]`).inputValue();
  const gesture=async (selector,dx,dy,cancel=false)=>{const b=await f.locator(selector).boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:5});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();};
  // Doors share the editor, but remain floor anchored and have no bottom handles.
  assert.equal(await f.locator('[data-handle]').count(),5);assert(await f.locator('[data-field="bottom"]').isDisabled());
  await gesture('[data-door="2"]',-15,-25);assert(+await read('left')<190);assert.equal(await read('bottom'),'0');
  await gesture('[data-handle="0,1"]',0,-15);assert(+await read('height')>220);assert.equal(await read('width'),'90');
  await gesture('[data-handle="1,0"]',10,0);assert(+await read('width')>90);
  const beforeCorner={w:+await read('width'),h:+await read('height')};await gesture('[data-handle="1,1"]',10,-10);assert(+await read('width')>beforeCorner.w);assert(+await read('height')>beforeCorner.h);assert.equal(await read('bottom'),'0');
  const beforeCancel=await read('left');await gesture('[data-door="2"]',-10,10,true);assert.equal(await read('left'),beforeCancel);
  await f.getByLabel('距墙左侧厘米').fill('80');await f.getByLabel('距墙左侧厘米').press('Tab');assert.notEqual(await read('left'),'80');assert((await f.getByRole('status').innerText()).includes('重叠'));
  await f.getByRole('button',{name:'删除门洞 · 恢复墙面'}).click();assert.equal(await f.locator('[data-door]').count(),0);await f.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await f.locator('[data-door]').count(),1);
  await f.getByRole('button',{name:'删除门洞 · 恢复墙面'}).click();
  const doorSvg=f.locator('.wv-canvas'),doorBox=await doorSvg.boundingBox(),doorRect=await doorSvg.locator(':scope > rect').first().evaluate(el=>({x:+el.getAttribute('x'),y:+el.getAttribute('y'),s:+el.getAttribute('width')/300}));
  const doorPt=(x,y)=>[doorBox.x+doorRect.x+x*doorRect.s,doorBox.y+doorRect.y+(300-y)*doorRect.s];
  await f.getByRole('button',{name:'画门洞',exact:true}).click();await page.mouse.move(...doorPt(280,80));await page.mouse.down();await page.mouse.move(...doorPt(190,220),{steps:5});await page.mouse.up();assert.equal(await f.locator('[data-door]').count(),1);assert.equal(await read('width'),'90');assert.equal(await read('height'),'220');assert.equal(await read('bottom'),'0');
  await page.reload();await f.locator('[data-window="1"]').waitFor();
  const window=await f.locator('[data-window="1"]').boundingBox();
  await page.mouse.move(window.x+window.width/2,window.y+window.height/2);await page.mouse.down();await page.mouse.move(window.x+window.width/2+20,window.y+window.height/2-20,{steps:5});await page.mouse.up();assert(+await read('left')>20);assert(+await read('bottom')>110);
  const handle=await f.locator('[data-handle="1,1"]').boundingBox();
  await page.mouse.move(handle.x+4,handle.y+4);await page.mouse.down();await page.mouse.move(handle.x+24,handle.y-11,{steps:5});await page.mouse.up();assert(+await read('width')>120);assert(+await read('height')>120);
  await f.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await read('width'),'120');
  await f.getByLabel('距墙左侧厘米').fill('100');await f.getByLabel('距墙左侧厘米').press('Tab');assert.notEqual(await read('left'),'100');assert((await f.getByRole('status').innerText()).includes('重叠'));
  const svg=f.locator('.wv-canvas'),box=await svg.boundingBox();const rect=await svg.locator(':scope > rect').first().evaluate(el=>({x:+el.getAttribute('x'),y:+el.getAttribute('y'),s:+el.getAttribute('width')/300}));
  const pt=(x,y)=>[box.x+rect.x+x*rect.s,box.y+rect.y+(300-y)*rect.s];
  await f.getByRole('button',{name:'画一扇窗'}).click();await page.mouse.move(...pt(30,20));await page.mouse.down();await page.mouse.move(...pt(110,90),{steps:5});await page.mouse.up();assert.equal(await f.locator('[data-window]').count(),2);
  await f.getByRole('button',{name:'删除窗户 · 恢复墙面'}).click();assert.equal(await f.locator('[data-window]').count(),1);await f.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await f.locator('[data-window]').count(),2);
  // Capture the initial interaction state for visual review.
  await page.reload();await f.locator('[data-window="1"]').waitFor();await root.screenshot({path:'test-results/window-design-desktop.png'});
  await page.setViewportSize({width:360,height:1200});await page.waitForTimeout(200);await root.screenshot({path:'test-results/window-design-mobile.png'});
  const overflow=await root.evaluate(el=>el.scrollWidth>el.clientWidth);assert(!overflow);assert.deepEqual(errors,[]);
  await page.emulateMedia({colorScheme:'dark'});await root.screenshot({path:'test-results/window-design-dark.png'});
  console.log('Door/window prototype: floor-anchored door move/draw, five handles, cancellation, collision, delete/undo, window regression and mobile layout passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
