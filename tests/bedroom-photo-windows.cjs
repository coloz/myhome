const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8789/';
const project=JSON.parse(fs.readFileSync('public/assets/raw-shell/project.json','utf8'));
function glb(p){const b=fs.readFileSync(p);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString().trim());}
(async()=>{
 const checks=[];
 const expected=[['west-bedroom-north',1.9],['east-bedroom-north',2.05]];
 for(const [id,width] of expected){const o=project.walls.find(w=>w.id===id).openings[0];assert(Math.abs(o.end-o.start-width)<1e-5);assert.equal(o.bottom,.5);assert.equal(o.top,2.45);}
 assert(project.walls.filter(w=>w.id.startsWith('bed-curve-')).every(w=>w.openings[0].top===2.45));
 const native=glb('public/assets/raw-shell/home.glb');
 for(const kind of ['master','bed-west','bed-east']){
  const nodes=native.nodes.filter(n=>n.extras?.bedroomPhotoWindow===kind&&n.extras.windowPart);
  assert.equal(nodes.filter(n=>n.extras.windowPart==='分格竖框').length,1);
  assert.equal(nodes.filter(n=>n.extras.windowPart==='边窗下部横框').length,1);
  assert.equal(nodes.filter(n=>n.extras.windowPart.includes('玻璃')).length,3);
 }
 for(const group of ['master-curve','bed-curve']){
  const nodes=native.nodes.filter(n=>n.extras?.curveGroup===group&&n.extras.layer==='window');
  assert.equal(nodes.filter(n=>n.extras.curvePart==='glass').length,8);assert.equal(nodes.filter(n=>n.extras.curvePart==='end-post').length,2);
 }
 const frames=native.nodes.filter(n=>n.extras?.windowPart==='侧窗开启扇玻璃'&&n.extras.bedroomPhotoWindow);
 const x=n=>n.translation[0];
 assert(x(frames.find(n=>n.extras.bedroomPhotoWindow==='master'))<8);
 assert(x(frames.find(n=>n.extras.bedroomPhotoWindow==='bed-west'))>5.5);
 assert(x(frames.find(n=>n.extras.bedroomPhotoWindow==='bed-east'))<8);
 checks.push('Bedroom openings resized to photograph proportions; 50cm sills and 3m storey retained; opening leaves mirror the photographs');
 checks.push('Master and east-bedroom corners retain continuous curved glass without intermediate mullions');
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1600,height:1040},acceptDownloads:true});
 const db=await require('./supabase-mock.cjs').installSupabaseMock(context);
 const seed=JSON.parse(fs.readFileSync('test-results/raw-shell-layout.json','utf8'));assert.equal(seed.modelRevision,6);
 db.rows.set('raw-shell',{id:'raw-shell',owner_id:'11111111-1111-4111-8111-111111111111',name:'原始户型 · 清水房',template_id:'raw-shell',layout:seed,revision:2,updated_at:new Date().toISOString(),last_mutation_id:null});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());const ready=()=>page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),null,{timeout:90000});
 const dump=async()=>{const d=page.waitForEvent('download');await page.getByRole('button',{name:'导出方案',exact:true}).click();return JSON.parse(fs.readFileSync(await(await d).path(),'utf8'));};
 const orbit=async(theta,phi)=>{
  for(let i=0;i<10;i++){
   const s=await snap(),[x,y,z]=s.camera.map((v,i)=>v-s.target[i]),angle=Math.atan2(x,z),polar=Math.atan2(Math.hypot(x,z),y);
   const da=Math.atan2(Math.sin(theta-angle),Math.cos(theta-angle)),dp=phi-polar;if(Math.abs(da)<.02&&Math.abs(dp)<.02)return;
   const r=await page.locator('canvas').boundingBox(),sx=r.x+r.width*.5,sy=r.y+r.height*.2;
   await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx-Math.max(-.8,Math.min(.8,da))*r.height/(Math.PI*2),sy-Math.max(-.4,Math.min(.4,dp))*r.height/(Math.PI*2),{steps:8});await page.mouse.up();await page.waitForTimeout(650);
  }
 };
 const eye=async(name,angle,distance)=>{
  await page.getByRole('button',{name:'查看'+name,exact:true}).click();await page.waitForTimeout(750);await page.getByRole('button',{name:'室内视角',exact:true}).click();await page.waitForTimeout(750);await orbit(angle,1.51);
  const r=await page.locator('canvas').boundingBox(),sx=r.x+r.width*.5,sy=r.y+r.height*.35;
  for(let i=0;i<6;i++){
   const s=await snap(),radius=Math.hypot(...s.camera.map((v,i)=>v-s.target[i])),delta=1.45-s.target[1];if(Math.abs(delta)<.02)break;
   const pixels=Math.max(-r.height*.3,Math.min(r.height*.3,delta*r.height/(2*radius*Math.tan(65*Math.PI/360))));
   await page.mouse.move(sx,sy);await page.mouse.down({button:'middle'});await page.mouse.move(sx,sy+pixels,{steps:8});await page.mouse.up({button:'middle'});await page.waitForTimeout(650);
  }
  await page.mouse.move(sx,sy);
  for(let i=0;i<12;i++){
   const s=await snap(),radius=Math.hypot(...s.camera.map((v,i)=>v-s.target[i]));if(Math.abs(radius-distance)<.06)break;
   await page.mouse.wheel(0,Math.max(-1200,Math.min(1200,-Math.log(distance/radius)/Math.log(.95)*100)));await page.waitForTimeout(500);
  }
 };
 try{
  await page.goto(BASE+'?scheme=raw-shell');await ready();let s=await snap();assert.equal(s.modelRevision,7);
  const upgraded=await dump();assert.deepEqual(upgraded.entities,seed.entities);assert.deepEqual(upgraded.finishes,seed.finishes);
  const changed=new Set(project.walls.filter(w=>w.id==='west-bedroom-north'||w.id==='east-bedroom-north'||w.id.startsWith('bed-curve-')).map(w=>w.id));
  assert.deepEqual(upgraded.walls.filter(w=>!changed.has(w.id)),seed.walls.filter(w=>!changed.has(w.id)));
  for(const [id,width] of expected){const o=upgraded.walls.find(w=>w.id===id).openings[0];assert(Math.abs(o.end-o.start-width)<1e-5);assert.equal(o.top,2.45);}
  await page.reload();await ready();assert.equal((await snap()).modelRevision,7);
  checks.push('Existing revision-6 saved layout upgrades and reloads at revision 7; custom partitions, furniture and finishes are preserved');
  await page.getByLabel('自动隐藏最近墙面').uncheck();await page.getByRole('button',{name:'清水房',exact:true}).click();
  await page.getByRole('button',{name:/恢复全部房间可见/}).click();await page.getByRole('button',{name:'标签',exact:true}).click();
  for(const [id,name,angle,distance] of [['master','主卧',Math.PI,1.7],['bed-west','次卧二',0,1.25],['bed-east','次卧一',0,1.25]]){
   await eye(name,angle,distance);await page.locator('canvas').screenshot({path:'test-results/photo-window-'+id+'.png'});
  }
  await page.getByRole('button',{name:'新建方案',exact:true}).click();await page.getByLabel('方案名称',{exact:true}).fill('实拍窗框新方案');await page.getByLabel('起始布置').selectOption('raw-shell');await page.getByRole('button',{name:'创建方案',exact:true}).click();
  await page.waitForFunction(()=>window.__homeViewer.snapshot().schemeId!=='raw-shell'&&!document.querySelector('.loading')&&!document.querySelector('.scheme-dialog[open]'));
  s=await snap();assert.equal(s.modelRevision,7);assert.equal(s.entities.length,0);assert(s.architecture.walls.every(w=>!w.deleted));
  for(const [id,width] of expected){const o=s.architecture.walls.find(w=>w.id===id).openings[0];assert(Math.abs(o.end-o.start-width)<1e-5);assert.equal(o.top,2.45);}
  checks.push('New original-floor-plan schemes start with the corrected smaller windows and mirrored opening leaves');
  assert.deepEqual(errors,[]);fs.writeFileSync('test-results/bedroom-photo-windows-report.json',JSON.stringify({passed:true,base:BASE,checks,consoleErrors:errors},null,2));console.log(checks.join('\n'));
 }catch(e){await page.screenshot({path:'test-results/bedroom-photo-windows-failure.png'});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
