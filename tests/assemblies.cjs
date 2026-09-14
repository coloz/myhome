const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const KEY='home-simulator:2026-09-14:v1';
const close=(a,b,label)=>{assert.equal(a.length,b.length,label);for(let i=0;i<a.length;i++)assert(Math.abs(a[i]-b[i])<1e-4,label+' at '+i);};
(async()=>{
 const project=JSON.parse(fs.readFileSync('public/assets/project.json'));
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1536,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snap=()=>page.evaluate(()=>window.__homeViewer.snapshot()),components=id=>page.evaluate(id=>window.__homeViewer.components(id),id);
 const pause=()=>page.waitForTimeout(450);
 await page.goto(process.env.VIEWER_URL||'http://127.0.0.1:8788/');await page.waitForFunction(()=>window.__homeViewer,{timeout:120000});await pause();
 const initial=await snap(),definition=name=>project.assemblies.find(a=>a.name===name),entity=(s,name)=>s.entities.find(e=>e.name===name);
 const board=definition('玄关洞洞板'),fridge=definition('冰箱');
 assert.equal(board.sourceCount,57);assert.equal(board.memberNames.filter(n=>n.startsWith('洞洞板孔')).length,56);
 assert.equal(fridge.sourceCount,4);assert(fridge.memberNames.some(n=>n.includes('柜体')));assert(fridge.memberNames.some(n=>n.includes('银色面板')));
 const names=project.assemblies.flatMap(a=>a.memberNames);assert.equal(new Set(names).size,names.length,'A component has multiple furniture owners');
 assert.equal(new Set(project.assemblies.flatMap(a=>a.legacyIds)).size,project.legacyEntities.length,'A legacy component was dropped');
 assert.equal(initial.entities.length,project.assemblies.length);
 assert(!initial.entities.some(e=>['洞洞板孔','冰箱银色面板','电视脚轮','微波炉黑玻璃'].includes(e.name)),'Loose component remains selectable');
 assert.equal(project.assemblies.filter(a=>a.name.startsWith('书房办公椅')).length,2);
 const select=async(name)=>{
  const a=definition(name);await page.getByRole('button',{name:'查看'+project.rooms.find(r=>r.id===a.room).name,exact:true}).click();await page.waitForTimeout(750);
  await page.getByRole('button',{name:'选中物件',exact:true}).click();await page.locator('.object-list button').filter({hasText:name}).first().click();await page.waitForTimeout(750);assert.equal((await snap()).selection,a.id);
 };
 for(const name of ['玄关洞洞板','冰箱','移动电视','落地灯','厨房电器立柜','空气炸锅','次卫洗漱柜']){
  const a=definition(name);await select(name);const before=await components(a.id);assert(before.parts.length>=1&&a.sourceCount>=2,name+' lacks source components');
  const base=entity(await snap(),name);
  await page.getByLabel('家具横向位置').fill(String(base.position[0]+.65));await page.getByLabel('家具横向位置').press('Tab');await pause();
  const moved=await components(a.id);assert.equal(moved.parts.length,before.parts.length);
  for(let i=0;i<before.parts.length;i++){
   close(moved.parts[i].local,before.parts[i].local,name+' relative component transform changed');
   assert(Math.abs(moved.parts[i].world[12]-before.parts[i].world[12]-.65)<1e-4,name+' left a component behind');
  }
  await page.getByLabel('家具旋转角度').fill('35');await page.getByLabel('家具旋转角度').press('Tab');
  await page.getByLabel('家具比例').fill('1.2');await page.getByLabel('家具比例').press('Tab');await pause();
  const changed=await components(a.id);for(let i=0;i<before.parts.length;i++)close(changed.parts[i].local,before.parts[i].local,name+' separated while rotating/scaling');
  assert.equal(new Set(changed.parts.map(p=>p.room)).size,1,name+' split across room states');
  await page.getByRole('button',{name:'复制物件',exact:false}).click();await pause();const copyId=(await snap()).selection,copy=await components(copyId);
  assert.equal(copy.parts.length,before.parts.length,name+' copy omitted a component');
  await page.getByRole('button',{name:'删除物件',exact:true}).click();await pause();assert((await components(copyId)).parts.every(p=>!p.visible),name+' delete left components visible');
  await page.getByRole('button',{name:'撤销',exact:true}).click();await pause();assert((await components(copyId)).parts.every(p=>p.visible));
  await page.getByRole('button',{name:'恢复初始布置',exact:false}).click();await pause();
 }
 // Real pointer dragging of the complete board, including all of its hole geometry.
 await select('玄关洞洞板');const beforeDrag=await components(board.id),b=entity(await snap(),'玄关洞洞板');
 await page.mouse.move(...b.screen);await page.mouse.down();await page.mouse.move(b.screen[0]-85,b.screen[1]+35,{steps:12});await page.mouse.up();await pause();
 const afterDrag=await components(board.id);assert.equal((await snap()).selection,board.id);assert(Math.abs(afterDrag.transform[12]-beforeDrag.transform[12])+Math.abs(afterDrag.transform[14]-beforeDrag.transform[14])>.1,'Board pointer drag failed');
 for(let i=0;i<beforeDrag.parts.length;i++)close(afterDrag.parts[i].local,beforeDrag.parts[i].local,'Hole geometry did not follow board drag');
 await page.screenshot({path:'test-results/assembly-board.png'});
 await page.getByRole('button',{name:'恢复初始布置',exact:false}).click();await pause();
 // A saved old board or fridge door edit becomes a rigid move of the complete new item.
 const legacy={format:'home-simulator',version:1,modelVersion:project.version,rooms:Object.fromEntries(project.rooms.map(r=>[r.id,{visible:true,decorated:true}])),entities:project.legacyEntities.map(e=>({id:e.id,room:e.room,position:[...e.position],rotation:0,scale:1,deleted:false}))};
 const oldId=name=>project.legacyEntities.find(e=>e.name===name).id;
 legacy.entities.find(e=>e.id===oldId('玄关洞洞板')).position[0]+=.6;
 const door=legacy.entities.find(e=>e.id===oldId('冰箱银色面板'));door.position[2]-=.4;
 legacy.entities.push({...structuredClone(door),id:'copy-legacy-fridge',sourceId:door.id,position:[door.position[0]+2,0,door.position[2]],rotation:Math.PI/2,scale:1.1});
 legacy.entities.push({id:'add-legacy-chair',catalogId:'chair-egg',room:'living',position:[3,0,-2],rotation:.2,scale:1,deleted:false});
 legacy.rooms.study.decorated=false;
 const originalText=JSON.stringify(legacy);await page.evaluate(([key,value])=>localStorage.setItem(key,value),[KEY,originalText]);
 await page.reload();await page.waitForFunction(()=>window.__homeViewer,{timeout:120000});await pause();
 let migrated=await snap();assert.equal(migrated.entities.length,project.assemblies.length+2);
 close(entity(migrated,'玄关洞洞板').position,entity(initial,'玄关洞洞板').position.map((v,i)=>v+(i===0?.6:0)),'Legacy board offset lost');
 close(entity(migrated,'冰箱').position,entity(initial,'冰箱').position.map((v,i)=>v-(i===2?.4:0)),'Legacy door did not move complete fridge');
 assert.equal((await components('copy-legacy-fridge')).parts.length,(await components(fridge.id)).parts.length,'Legacy copied door was not upgraded to complete fridge');
 assert.equal(migrated.states.study.decorated,false);
 assert.deepEqual(migrated.entities.find(e=>e.id==='add-legacy-chair').position,[3,0,-2]);
 assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).version,KEY),2);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key+':before-assemblies-v2'),KEY),originalText,'Original legacy file was not backed up');
 assert(await page.getByRole('button',{name:'下载家具合并前的原存档',exact:false}).isVisible());
 const migratedPositions=migrated.entities.map(e=>({id:e.id,position:e.position,rotation:e.rotation,scale:e.scale}));
 await page.reload();await page.waitForFunction(()=>window.__homeViewer,{timeout:120000});await pause();
 assert.deepEqual((await snap()).entities.map(e=>({id:e.id,position:e.position,rotation:e.rotation,scale:e.scale})),migratedPositions,'V2 reload changed assembly positions');
 fs.writeFileSync('test-results/layout-legacy-assemblies.json',originalText);await page.locator('input[type=file]').setInputFiles('test-results/layout-legacy-assemblies.json');await pause();
 assert.equal((await snap()).entities.length,project.assemblies.length+2,'Legacy JSON import failed');
 const glbDownload=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前 GLB',exact:false}).click();const glb=await glbDownload;await glb.saveAs('test-results/assemblies-edited.glb');
 const bytes=fs.readFileSync('test-results/assemblies-edited.glb'),json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 const descendantMeshes=index=>{const n=json.nodes[index];return (n.mesh===undefined?0:1)+(n.children||[]).reduce((sum,i)=>sum+descendantMeshes(i),0);};
 for(const id of [board.id,fridge.id,'copy-legacy-fridge']){
  const index=json.nodes.findIndex(n=>n.extras?.furnitureId===id);assert(index>=0);assert.equal(descendantMeshes(index),(await components(id)).parts.length,'GLB omitted an assembly component');
 }
 assert.deepEqual(errors,[]);
 const report={passed:true,assemblies:project.assemblies.length,legacyOwners:project.legacyEntities.length,checks:['unique complete-object ownership','57-part pegboard / 4-part refrigerator','seven assemblies translate/rotate/scale rigidly','whole-object copy/delete/undo','real pegboard pointer drag','room ownership remains consistent','legacy changed-panel migration','legacy copied-panel migration','catalog objects and room state preserved','original autosave backup','V2 reload','legacy JSON import','GLB retains every assembly primitive'],consoleErrors:errors};
 fs.writeFileSync('test-results/assembly-report.json',JSON.stringify(report,null,2));console.log('PASS: '+report.checks.length+' assembly checks');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
