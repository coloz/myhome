const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8788/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}),context=await browser.newContext({viewport:{width:1536,height:1040},acceptDownloads:true});
 const db=await require('./supabase-mock.cjs').installSupabaseMock(context),page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/materials\/[^/]+\/(color|normal|roughness)\.jpg/.test(r.url()))requests.push(r.url());});
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const ready=()=>page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),null,{timeout:90000});
 const texture=id=>page.waitForFunction(id=>window.__homeViewer.snapshot().finishTextures.some(t=>t.id===id&&t.ready),id,{timeout:30000});
 const download=async(label)=>{const e=page.waitForEvent('download',{timeout:60000});await page.getByRole('button',{name:label,exact:true}).click();return fs.readFileSync(await (await e).path());};
 try{
  await page.goto(BASE+'?scheme=raw-shell');await ready();await texture('oak');assert(requests.length<=6,'only default used textures loaded');
  await page.getByRole('button',{name:'墙体 / 装修',exact:true}).click();assert.equal(await page.locator('.finish-grid button').count(),26);
  await page.getByLabel('装修材质应用范围').selectOption('living');await page.getByRole('button',{name:'地面材质 人字拼木地板',exact:true}).click();await texture('herringbone');
  await page.getByRole('button',{name:'墙面材质 淡蓝方砖',exact:true}).click();await texture('blue-tile');
  let s=await snap();assert.deepEqual(s.architecture.finishes.living,{floor:'herringbone',wall:'blue-tile'});assert(!s.architecture.finishes.garden);assert(!s.architecture.finishes.master);assert(s.states.living.decorated);
  const fixture=JSON.parse(await download('导出方案'));assert.deepEqual(fixture.finishes.living,s.architecture.finishes.living);
  await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal((await snap()).architecture.finishes.living.wall,'white');await page.getByRole('button',{name:'重做',exact:true}).click();assert.equal((await snap()).architecture.finishes.living.wall,'blue-tile');
  // Applying another tint reuses the same full PBR image requests.
  const squareCount=requests.filter(u=>u.includes('/clean_square_tiles/')).length;
  await page.getByRole('button',{name:'墙面材质 奶油黄方砖',exact:true}).click();await texture('yellow-tile');assert.equal(requests.filter(u=>u.includes('/clean_square_tiles/')).length,squareCount);
  await page.getByRole('button',{name:'墙面材质 淡蓝方砖',exact:true}).click();
  await page.waitForFunction(()=>window.__homeViewer.snapshot().sync.some(s=>s.id==='raw-shell'&&s.state==='saved'),null,{timeout:20000});assert(db.writes.some(w=>w.p_layout.finishes?.living?.wall==='blue-tile'));
  await page.reload();await ready();await texture('blue-tile');assert.deepEqual((await snap()).architecture.finishes.living,fixture.finishes.living);
  await page.getByRole('button',{name:'墙体 / 装修',exact:true}).click();await page.getByLabel('装修材质应用范围').selectOption('living');
  // Failure is explicit; retry recovers without changing the selected preset.
  await page.route('**/materials/clay_plaster/color.jpg',r=>r.abort());await page.getByRole('button',{name:'墙面材质 砂色泥灰涂料',exact:true}).click();await page.getByRole('status').filter({hasText:'砂色泥灰涂料'}).waitFor();assert((await snap()).finishTextures.find(t=>t.id==='clay').error);
  await page.unroute('**/materials/clay_plaster/color.jpg');await page.getByRole('button',{name:'重试纹理',exact:true}).click();await texture('clay');await page.getByRole('button',{name:'墙面材质 淡蓝方砖',exact:true}).click();
  const b=await download('导出当前 GLB ↗');assert.equal(b.readUInt32LE(),0x46546c67);const gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
  for(const id of ['blue-tile','herringbone']){const material=gltf.materials.find(m=>m.extras?.finishId===id);assert(material?.normalTexture&&material.pbrMetallicRoughness?.baseColorTexture&&material.pbrMetallicRoughness?.metallicRoughnessTexture,id+' exports all texture channels');}
  assert(gltf.images.every(i=>i.bufferView!==undefined));
  await page.getByRole('button',{name:'地面材质 人字拼木地板',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/finish-materials.png'});
  assert.deepEqual(errors,[]);fs.writeFileSync('test-results/finish-materials-report.json',JSON.stringify({passed:true,floors:12,walls:14,exportBytes:b.length,checks:['26 material thumbnails and per-room application','Other rooms and entry garden unchanged','Undo / redo / JSON and debounced cloud persistence','Shared image requests across tints; lazy full texture loading','Failed texture message and explicit retry','GLB embeds current color, normal and roughness maps'],consoleErrors:errors},null,2));console.log('Floor / wall materials passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
