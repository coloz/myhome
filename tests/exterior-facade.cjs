const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8789/';
function glb(path){const b=fs.readFileSync(path);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString().trim());}
(async()=>{
 const checks=[];
 for(const [key,sub] of [['raw-shell','raw-shell/'],['original',''],['alternative','scheme-b/']]){
  const scene=glb('public/assets/'+sub+'home.glb'),old=glb('../output/webgl/backups/before-exterior-facade/'+key+'/home.glb');
  const ids=j=>[...new Set(j.nodes.map(n=>n.extras?.entityId).filter(Boolean))].sort();assert.deepEqual(ids(scene),ids(old));
  const facade=scene.nodes.filter(n=>n.extras?.layer==='facade');assert(facade.length>40);assert(facade.every(n=>!n.extras.entityId));
  const photo=scene.nodes.filter(n=>n.extras?.livingPhotoWindow),panes=photo.filter(n=>n.extras.windowPart?.includes('玻璃'));
  assert.equal(panes.length,6);assert.equal(photo.filter(n=>n.extras.windowPart==='分格竖框').length,3);assert.equal(photo.filter(n=>n.extras.windowPart==='边窗下部横框').length,2);
  assert(panes.filter(n=>n.extras.windowPart==='中央整幅固定玻璃').length===2);
  const brown=facade.filter(n=>n.extras.facadePart==='厨房棕色外墙面');assert(brown.length>0);
  for(const n of brown){const primitive=scene.meshes[n.mesh].primitives[0];assert(scene.materials[primitive.material].name.startsWith('厨房南外墙'))}
  if(key==='raw-shell'){
   const hosts=new Set(facade.map(n=>n.extras.facadeHost));for(const id of ['living-south','master-south','master-east','east-bedroom-north','west-bedroom-north','east-bedroom-east','bed-curve-0','master-curve-0','kitchen-south'])assert(hosts.has(id),id);
   assert(!hosts.has('elevator-front'));assert(!hosts.has('bedrooms-partition'));assert(!hosts.has('guest-bath-south'));
  }
 }
 checks.push('All three GLBs retain furniture IDs; outer white/bronze surfaces and the brown kitchen facade are separate from interior finishes');
 checks.push('Living windows have six glass panels: two large central panes, two split side lights, three internal mullions and two side transoms');
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1600,height:1040},acceptDownloads:true});
 const db=await require('./supabase-mock.cjs').installSupabaseMock(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const ready=()=>page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),null,{timeout:90000});
 const orbit=async(theta,phi)=>{
  for(let i=0;i<10;i++){
   const s=await snap(),[x,y,z]=s.camera.map((v,i)=>v-s.target[i]),current=Math.atan2(x,z),polar=Math.atan2(Math.hypot(x,z),y);
   const da=Math.atan2(Math.sin(theta-current),Math.cos(theta-current)),dp=phi-polar;if(Math.abs(da)<.02&&Math.abs(dp)<.02)return;
   const r=await page.locator('canvas').boundingBox(),sx=r.x+r.width*.5,sy=r.y+r.height*.20;
   await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx-Math.max(-.8,Math.min(.8,da))*r.height/(2*Math.PI),sy-Math.max(-.4,Math.min(.4,dp))*r.height/(2*Math.PI),{steps:8});await page.mouse.up();await page.waitForTimeout(650);
  }
  throw Error('Camera did not reach exterior view');
 };
 try{
  await page.goto(BASE+'?scheme=raw-shell');await ready();await page.getByLabel('自动隐藏最近墙面').uncheck();
  let s=await snap();assert(!s.showCeiling);assert(Object.values(s.states).every(r=>!r.decorated));assert(s.parts.filter(p=>p.layer==='facade').every(p=>p.visible&&!p.raw));
  await page.getByRole('button',{name:'装修效果',exact:true}).click();await page.getByRole('button',{name:'清水房',exact:true}).click();
  assert((await snap()).parts.filter(p=>p.layer==='facade').every(p=>p.visible&&!p.raw));
  await page.getByLabel('隐藏主卧',{exact:true}).click();assert((await snap()).parts.filter(p=>p.room==='master'&&p.layer==='facade').every(p=>!p.visible));await page.getByLabel('显示主卧',{exact:true}).click();
  checks.push('Exterior finish remains when switching to bare-shell mode and hides with its room');
  await orbit(.62,1.17);await page.locator('canvas').screenshot({path:'test-results/exterior-facade-south-east.png'});
  await orbit(2.45,1.13);await page.locator('canvas').screenshot({path:'test-results/exterior-facade-north-east.png'});
  await page.getByRole('button',{name:'查看客餐厅',exact:true}).click();await page.waitForTimeout(750);await orbit(0,1.35);
  await page.locator('canvas').screenshot({path:'test-results/living-photo-window.png'});
  await page.getByLabel('自动隐藏最近墙面').check();await page.waitForTimeout(250);s=await snap();
  const linked=s.parts.filter(p=>p.cutaway==='living-south'&&p.layer==='facade');assert(linked.length>0&&linked.every(p=>!p.visible));
  const solid=s.parts.filter(p=>p.cutaway?.startsWith('living-south:solid:')&&p.layer==='facade');assert(solid.length>0&&solid.every(p=>p.visible));
  await page.getByRole('button',{name:'户型图',exact:true}).click();await page.waitForTimeout(250);assert((await snap()).parts.filter(p=>p.layer==='facade').every(p=>!p.visible));
  const dl=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前 GLB',exact:false}).click();
  const exported=glb(await(await dl).path());assert(exported.nodes.some(n=>n.extras?.layer==='facade'));assert.equal(exported.nodes.filter(n=>n.extras?.livingPhotoWindow&&n.extras.windowPart?.includes('玻璃')).length,6);
  await page.reload();await ready();assert((await snap()).visualRevision==='2026-09-16-photo-windows-v2');
  checks.push('Nearest living window hides its attached exterior; solid end returns stay; plan hides all trim, export and refresh retain it');
  assert.deepEqual(errors,[]);fs.writeFileSync('test-results/exterior-facade-report.json',JSON.stringify({passed:true,base:BASE,checks,consoleErrors:errors},null,2));console.log(checks.join('\n'));
 }catch(e){await page.screenshot({path:'test-results/exterior-facade-failure.png'});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
