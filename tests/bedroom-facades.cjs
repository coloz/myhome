const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {installSupabaseMock}=require('./supabase-mock.cjs');
const BASE=process.env.VIEWER_URL||'http://127.0.0.1:8788/';
const groups=['master-south-facade','bed-east-north-facade'];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:1600,height:1100},acceptDownloads:true});
 const db=await installSupabaseMock(context,{signedIn:true}),page=await context.newPage(),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot());
 const ready=()=>page.waitForFunction(()=>window.__homeViewer&&!document.querySelector('.loading'),{},{timeout:120000});
 const grouped=(s,g)=>s.parts.filter(p=>p.cutaway===g);
 const visibility=(s,g,visible)=>{const parts=grouped(s,g);assert(parts.length>0);assert(parts.every(p=>p.visible===visible),g+' did not '+(visible?'restore':'hide')+' as a whole');};
 // Rotate through the same mouse gestures as the user; debug access stays read-only.
 const orbitTo=async angle=>{
  for(let i=0;i<8;i++){
   const s=await snap(),current=Math.atan2(s.camera[0]-s.target[0],s.camera[2]-s.target[2]);
   const delta=Math.atan2(Math.sin(angle-current),Math.cos(angle-current));if(Math.abs(delta)<.015)return;
   const r=await page.locator('canvas').boundingBox(),step=Math.max(-.8,Math.min(.8,delta));
   const x=r.x+r.width*.5,y=r.y+r.height*.15;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-step*r.height/(Math.PI*2),y,{steps:8});await page.mouse.up();await page.waitForTimeout(750);
  }
  throw Error('Orbit did not reach requested facade');
 };
 try{
  await page.goto(BASE+'?scheme=raw-shell');await ready();await page.waitForTimeout(400);
  let s=await snap();assert(await page.getByLabel('自动隐藏最近墙面').isChecked());
  const ends=s.architecture.parts.filter(p=>p.id==='living-south'&&p.layer==='wall'&&p.bounds[0][1]<.01);assert.equal(ends.length,2);assert(ends.every(p=>p.visible));
  for(const [straight,curve,group] of [['master-south','master-curve',groups[0]],['east-bedroom-north','bed-curve',groups[1]]]){
   assert(s.parts.some(p=>p.wallId===straight&&p.layer==='window'&&p.cutaway===group));
   const corner=s.parts.filter(p=>p.curveGroup===curve);assert(corner.length>20);assert(corner.every(p=>p.cutaway===group));
  }
  checks.push('Straight windows, curved glass, frames and adjacent sill/header share one facade per bedroom; living solid end returns stay visible');
  for(const [name,group,straightAngle,curveAngle,other] of [['主卧',groups[0],0,.62,groups[1]],['次卧一',groups[1],Math.PI,2.43,groups[0]]]){
   await page.getByRole('button',{name:'查看'+name,exact:true}).click();await page.waitForTimeout(850);
   for(const [view,angle] of [['straight',straightAngle],['curve',curveAngle]]){
    await orbitTo(angle);s=await snap();visibility(s,group,false);visibility(s,other,true);
    assert.equal(new Set(s.parts.filter(p=>p.cutaway&&!p.visible&&['window','wall'].includes(p.layer)).map(p=>p.cutaway)).size,1,'More than the nearest facade was hidden');
    await page.screenshot({path:'test-results/facade-'+group+'-'+view+'.png'});
   }
   if(await page.getByLabel('关闭保存失败消息').count())await page.getByLabel('关闭保存失败消息').click();
   await page.getByLabel('自动隐藏最近墙面').uncheck();await page.waitForTimeout(250);s=await snap();visibility(s,group,true);visibility(s,other,true);
   await page.getByLabel('自动隐藏最近墙面').check();await page.waitForTimeout(250);visibility(await snap(),group,false);
   await orbitTo(straightAngle+Math.PI);visibility(await snap(),group,true);
   checks.push(name+': straight and curved approaches hide the complete nearest facade, then restore it when rotating away or turning cutaway off');
  }
  await page.getByRole('button',{name:'户型图',exact:true}).click();await page.waitForTimeout(300);s=await snap();
  for(const g of groups)assert(grouped(s,g).every(p=>p.visible===(p.layer==='wall')));assert(!s.showCeiling);
  await page.getByRole('button',{name:'第一人称漫游',exact:true}).click();await page.waitForTimeout(350);s=await snap();assert.equal(s.mode,'walk');for(const g of groups)visibility(s,g,true);await page.keyboard.press('Escape');
  checks.push('Plan view retains the wall section; first-person roaming restores all facade glass');
  // New and reopened local schemes use the same viewer grouping without modifying their saved layout.
  await page.getByRole('button',{name:'新建方案',exact:true}).click();await page.getByLabel('方案名称',{exact:true}).fill('卧室连续窗面验证');await page.getByLabel('起始布置').selectOption('raw-shell');await page.getByRole('button',{name:'创建方案',exact:true}).click();
  await page.waitForFunction(()=>window.__homeViewer?.snapshot().schemeId&&!['raw-shell','original','alternative'].includes(window.__homeViewer.snapshot().schemeId)&&!document.querySelector('.loading')&&!document.querySelector('.scheme-dialog[open]'));
  await page.waitForFunction(()=>{const s=window.__homeViewer.snapshot();return s.sync.find(x=>x.id===s.schemeId)?.state==='saved';});
  const id=(await snap()).schemeId;await page.reload();await ready();s=await snap();assert.equal(s.schemeId,id);for(const g of groups)assert(grouped(s,g).length>20);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前 GLB',exact:false}).click();
  const bytes=fs.readFileSync(await(await download).path()),glb=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  for(const [curve,g] of [['master-curve',groups[0]],['bed-curve',groups[1]]]){const nodes=glb.nodes.filter(n=>n.extras?.curveGroup===curve);assert(nodes.length>20);assert(nodes.every(n=>n.extras.cutaway===g));}
  checks.push('New/reopened raw schemes and GLB exports retain the continuous facade grouping');
  for(const scheme of ['original','alternative']){
   await require('./scheme-ui.cjs').selectScheme(page,scheme);await page.waitForTimeout(350);s=await snap();
   const windows=s.parts.filter(p=>p.room==='master'&&p.layer==='window');assert(windows.length>=4);assert(windows.every(p=>p.cutaway===groups[0]));
   await page.getByRole('button',{name:'查看主卧',exact:true}).click();await page.waitForTimeout(850);await orbitTo(0);visibility(await snap(),groups[0],false);
  }
  checks.push('Both furnished templates also hide the master straight and curved window as one facade');
  assert.deepEqual(errors,[]);
  fs.writeFileSync('test-results/bedroom-facades-report.json',JSON.stringify({passed:true,base:BASE,checks,consoleErrors:errors},null,2));console.log(checks.join('\n'));
 }catch(e){await page.screenshot({path:'test-results/bedroom-facades-failure.png'});fs.writeFileSync('test-results/bedroom-facades-failure.json',JSON.stringify(await snap(),null,2));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
