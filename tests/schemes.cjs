const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const KEY_A='home-simulator:2026-09-14:v1',KEY_B='home-simulator:scheme-b:2026-09-14:v2';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1536,height:1000},acceptDownloads:true});
 await require('./supabase-mock.cjs').installSupabaseMock(context);
 const page=await context.newPage(),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const ready=async(id)=>{await page.waitForFunction(id=>window.__homeViewer?.snapshot().schemeId===id&&window.__homeViewer?.snapshot().modelVersion&&document.querySelector('.loading')===null,id,{timeout:120000});await page.waitForTimeout(500);};
 const change=async(id)=>{await require('./scheme-ui.cjs').selectScheme(page,id);await ready(id);assert.equal(await page.locator('canvas').count(),1,'Switch leaked a canvas');};
 const exportJson=async()=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出方案',exact:false}).click();const d=await pending;return {data:JSON.parse(fs.readFileSync(await d.path(),'utf8')),name:d.suggestedFilename()};};
 const setX=async(name,room,x)=>{await page.getByRole('button',{name:'查看'+room,exact:true}).click();await page.getByRole('button',{name:'选中物件',exact:true}).click();await page.locator('.object-list button').filter({hasText:name}).first().click();await page.getByLabel('家具横向位置').fill(String(x));await page.getByLabel('家具横向位置').press('Tab');await page.waitForTimeout(200);};
 await page.goto(process.env.VIEWER_URL||'http://127.0.0.1:8788/');await ready('original');
 let a=await snap();assert.equal(a.entities.length,121);assert.equal(Object.keys(a.states).length,12);
 const aSofa=a.entities.find(e=>e.name==='白色布艺沙发');
 await setX('白色布艺沙发','客厅',aSofa.position[0]+.25);
 await page.getByRole('button',{name:'隐藏次卧装修',exact:true}).click();
 const savedA=(await exportJson()).data;
 const storedA=await page.evaluate(key=>localStorage.getItem(key),KEY_A);assert(storedA);
 checks.push('Original scheme and pre-existing storage key remain compatible');
 await change('alternative');let b=await snap();
 assert.equal(b.entities.length,78);assert.equal(Object.keys(b.states).length,11);assert(!b.states.garden);
 assert(b.entities.every(e=>e.id.startsWith('b-')));assert(b.states.guest.decorated);
 assert(b.parts.filter(p=>p.layer==='ceiling').every(p=>!p.visible));
 assert.equal(new Set(b.parts.filter(p=>p.layer==='wall'&&!p.visible).map(p=>p.cutaway)).size,1);
 const meta=JSON.parse(fs.readFileSync('public/assets/scheme-b/project.json','utf8'));
 assert(!meta.rooms.some(r=>/光厅|电梯|楼梯/.test(r.name)));
 // Convert room boundaries back to the drawing: no private floor enters the excluded zones.
 for(const r of meta.rooms)for(const [x,z] of r.polygon){const px=x*47+200,py=z*47+549;assert(!((px<150&&py<390)||(px<194&&py<290)),'Floor enters elevator/stair area');assert(!((px<322&&py<158)||(px<294&&py<228)),'Floor enters the excluded light hall');}
 for(const name of ['玄关洞洞板','冰箱','白色布艺沙发','厨房电器立柜']){
  const ass=meta.assemblies.find(a=>a.name===name);assert(ass?.sourceCount>2,name+' has loose parts');
 }
 checks.push('New model has 11 private spaces and 78 complete editable assemblies, including the entry alcove');
 await page.getByRole('button',{name:'户型图',exact:false}).first().click();await page.waitForTimeout(600);
 await page.screenshot({path:'test-results/scheme-b-plan.png'});
 await page.getByRole('button',{name:'自由查看',exact:false}).first().click();await page.waitForTimeout(900);
 await page.screenshot({path:'test-results/scheme-b-overview.png'});
 await page.getByRole('button',{name:'清水房',exact:true}).click();await page.waitForTimeout(300);b=await snap();
 assert(b.parts.filter(p=>['finish','decor','greenery'].includes(p.layer)).every(p=>!p.visible));
 assert(b.parts.some(p=>p.layer==='shell-floor'&&p.visible));
 await page.screenshot({path:'test-results/scheme-b-raw.png'});
 await page.getByRole('button',{name:'装修效果',exact:true}).click();
 await page.getByRole('button',{name:'隐藏主卧装修',exact:true}).click();await page.waitForTimeout(200);b=await snap();
 assert(b.parts.filter(p=>p.room==='master'&&p.layer==='decor').every(p=>!p.visible));assert(b.parts.some(p=>p.room==='living'&&p.layer==='decor'&&p.visible));
 await page.getByRole('button',{name:'隐藏书房 / 衣帽间',exact:true}).click();
 checks.push('New scheme supports raw finish, per-room decoration and room visibility');
 const sofa=b.entities.find(e=>e.name==='白色布艺沙发');
 const before=await page.evaluate(id=>window.__homeViewer.components(id),sofa.id);
 await setX('白色布艺沙发','客厅',sofa.position[0]+.35);
 const after=await page.evaluate(id=>window.__homeViewer.components(id),sofa.id);
 assert.equal(before.parts.length,after.parts.length);
 for(let i=0;i<before.parts.length;i++){
  assert.deepEqual(before.parts[i].local,after.parts[i].local);
  assert(Math.abs(after.parts[i].world[12]-before.parts[i].world[12]-.35)<1e-4);
 }
 const savedB=(await exportJson());assert(savedB.name.includes('方案二'));assert.equal(savedB.data.modelVersion,'2026-09-14-plan-b');
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY_A),storedA,'B overwrote A storage');
 assert(await page.evaluate(key=>localStorage.getItem(key),KEY_B));
 checks.push('All sofa components move together; export identifies scheme B');
 await page.locator('input[type=file]').setInputFiles({name:'scheme-a.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(savedA))});
 await page.getByRole('status').filter({hasText:'另一套户型'}).waitFor();
 assert.deepEqual((await exportJson()).data,savedB.data,'Cross-scheme import mutated the active model');
 checks.push('Cross-scheme JSON import is rejected before any mutation');
 await change('original');assert.deepEqual((await exportJson()).data,savedA);
 assert.equal((await snap()).history.undo,0);
 await change('alternative');assert.deepEqual((await exportJson()).data,savedB.data);
 await page.reload();await ready('alternative');assert.deepEqual((await exportJson()).data,savedB.data);
 checks.push('Independent furniture and room states survive switching and page reload');
 for(const room of meta.rooms){await page.getByRole('button',{name:'查看'+room.name,exact:true}).click();await page.waitForTimeout(160);assert.equal((await snap()).selected,room.id);}
 checks.push('All 11 room navigation targets work');
 for(let i=0;i<2;i++){await change('original');await change('alternative');}
 checks.push('Repeated switching retains one canvas and does not mix furniture');
 await page.getByRole('button',{name:'恢复初始布置',exact:false}).click();
 await page.getByRole('button',{name:'查看客厅',exact:true}).click();await page.waitForTimeout(900);
 await page.screenshot({path:'test-results/scheme-b-living.png'});
 await page.getByRole('button',{name:'查看厨房',exact:true}).click();await page.waitForTimeout(900);
 await page.screenshot({path:'test-results/scheme-b-kitchen.png'});
 const pending=page.waitForEvent('download',{timeout:120000});await page.getByRole('button',{name:'导出当前 GLB',exact:false}).click();const download=await pending;
 assert(download.suggestedFilename().includes('方案二'));const bytes=fs.readFileSync(await download.path());assert.equal(bytes.toString('utf8',0,4),'glTF');assert(bytes.length>1_000_000);
 const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)).trim());assert(gltf.nodes.some(n=>n.extras?.entityId?.startsWith('b-')));
 checks.push('Current scheme B exports a valid editable GLB');
 await page.getByRole('button',{name:'查看当前户型原图',exact:false}).click();assert((await page.locator('.plan-card img').getAttribute('src')).includes('scheme-b'));await page.getByLabel('关闭户型图').click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(700);
 await require('./scheme-ui.cjs').openSchemes(page);await page.waitForTimeout(250);const picker=await page.getByLabel('切换家装方案').boundingBox();assert(picker.x>=0&&picker.x+picker.width<=390);assert(await page.getByLabel('切换家装方案').isVisible());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'test-results/scheme-b-mobile.png'});
 await change('original');await change('alternative');
 checks.push('Current reference image and mobile scheme selector work without overflow');
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/schemes-report.json',JSON.stringify({passed:true,checks,consoleErrors:errors},null,2));
 console.log(JSON.stringify({passed:true,checks:checks.length,consoleErrors:errors}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
