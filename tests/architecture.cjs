const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),T=require('three');
const ts=require('typescript');
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const motion=new Module(__filename);motion.paths=module.paths;motion._compile(compile('src/walk-motion.ts'),__filename);
const moduleForTest=new Module(__filename);moduleForTest.paths=module.paths;moduleForTest.require=id=>id==='./walk-motion'?motion.exports:require(id);moduleForTest._compile(compile('src/architecture.ts'),__filename);
const {validateWalls,makeWall,validateFinishes,transformWall,resizeWall,wallLength}=moduleForTest.exports;
const project=JSON.parse(fs.readFileSync('public/assets/raw-shell/project.json','utf8')),base=project.walls,rooms=project.rooms;
const layoutModule=new Module(__filename);layoutModule.paths=module.paths;layoutModule.require=id=>id==='./architecture'?moduleForTest.exports:require(id);layoutModule._compile(compile('src/layout.ts'),__filename);
const oldWalls=base.map(w=>structuredClone(project.layoutUpdate.wallUpdates.find(u=>u.before.id===w.id)?.before??w));
const oldLayout={format:'home-simulator',version:2,modelVersion:project.version,modelRevision:1,entities:[],rooms:{},walls:[...oldWalls,...structuredClone(project.layoutUpdate.retiredWalls)]};
const initial={...oldLayout,modelRevision:project.revision,walls:base};
const upgraded=layoutModule.exports.upgradeModelLayout(oldLayout,initial,project.layoutUpdate);assert.equal(upgraded.walls.length,62);assert.equal(upgraded.modelRevision,project.revision);validateWalls(upgraded.walls,base,rooms);
const revision2={...structuredClone(oldLayout),modelRevision:2};revision2.walls=revision2.walls.filter(w=>w.id!=='entry-east');validateWalls(layoutModule.exports.upgradeModelLayout(revision2,initial,project.layoutUpdate).walls,base,rooms);
const editedOld=structuredClone(oldLayout);editedOld.walls.find(w=>w.id==='entry-east').height=2.8;
const preserved=layoutModule.exports.upgradeModelLayout(editedOld,initial,project.layoutUpdate);assert(preserved.walls.some(w=>w.id==='wall-migrated-entry-east'&&w.height===2.8));validateWalls(preserved.walls,base,rooms);
const identified=base.map(w=>({...structuredClone(w),openings:w.openings.map((o,i)=>({...o,id:`${w.id}:opening:${i}`}))}));
assert.deepEqual(validateWalls(base,base,rooms),identified);assert.deepEqual(validateWalls(undefined,base,rooms),identified);
assert.deepEqual(validateWalls(identified,base,rooms),identified,'Stable IDs should survive repeat validation');
const revision3={...structuredClone(oldLayout),modelRevision:3,walls:structuredClone(base)};
for(const change of project.layoutUpdate.wallUpdates.filter(c=>c.restoreFixed)){
 const i=revision3.walls.findIndex(w=>w.id===change.before.id);revision3.walls[i]=structuredClone(change.before);revision3.walls[i].deleted=true;
}
const fixed=layoutModule.exports.upgradeModelLayout(revision3,initial,project.layoutUpdate);
for(const id of ['entry-door','guest-bath-west-top']){
 assert.equal(base.find(w=>w.id===id).lock,'fixed');
 assert.deepEqual(fixed.walls.find(w=>w.id===id),base.find(w=>w.id===id));
 for(const patch of [{deleted:true},{lock:''},{height:2},{a:[1,-6.9]},{openings:[]}]){
  const next=structuredClone(base),i=next.findIndex(w=>w.id===id);Object.assign(next[i],patch);
  if(JSON.stringify(next[i])!==JSON.stringify(base[i]))assert.throws(()=>validateWalls(next,base,rooms),undefined,'Fixed wall modification accepted');
 }
}
validateWalls(fixed.walls,base,rooms);
for(const field of ['deleted','lock','height','a','openings','rooms']){
 const next=structuredClone(base),w=next.find(w=>w.lock==='structural');
 if(field==='deleted')w.deleted=true;else if(field==='lock')w.lock='';else if(field==='height')w.height=2;else if(field==='a')w.a[0]+=.1;else if(field==='openings')w.openings=[{start:.1,end:.8,bottom:0,top:2,kind:'door'}];else w.rooms=['living'];
 assert.throws(()=>validateWalls(next,base,rooms),undefined,field+' bypassed protection');
}
assert.throws(()=>validateWalls(base.filter(w=>!w.lock),base,rooms));
const add={id:'wall-test',name:'测试隔墙',a:[4.4,-4.1],b:[6,-4.1],height:3,thickness:.12,rooms:['living'],lock:'',deleted:false,openings:[]};
assert.equal(validateWalls([...base,add],base,rooms).length,63);
for(const bad of [{a:[-20,0]},{height:3.1},{height:NaN},{thickness:-.1},{a:[6.5,-4],b:[7.5,-4]},{b:[4.4,-4.1]},{lock:'exterior'},{rooms:['missing']},{openings:[{start:.2,end:2,bottom:0,top:2.2,kind:'door'}]}])assert.throws(()=>validateWalls([...base,{...add,...bad}],base,rooms));
const cut={...add,openings:[{start:.35,end:1.25,bottom:0,top:2.2,kind:'door'}]};
const stacked={...add,openings:[{id:'lower',start:.3,end:1.2,bottom:0,top:2.2,kind:'door'},{id:'upper',start:.15,end:1.4,bottom:2.4,top:2.85,kind:'window'}]};
validateWalls([...base,stacked],base,rooms);
const stackedGroup=makeWall(stacked);let stackedVolume=0;
for(const mesh of stackedGroup.children){if(mesh.userData.layer!=='wall')continue;const p=mesh.geometry.parameters;stackedVolume+=p.width*p.height*p.depth;
 const left=mesh.position.x-add.a[0]-p.width/2,right=left+p.width,bottom=mesh.position.y-p.height/2,top=bottom+p.height;
 for(const o of stacked.openings)assert(!(left<o.end-1e-7&&right>o.start+1e-7&&bottom<o.top-1e-7&&top>o.bottom+1e-7),'Wall solid intrudes into stacked opening');
}
assert(Math.abs(stackedVolume-(1.6*3-.9*2.2-1.25*.45)*.12)<1e-6);
assert(stackedGroup.children.filter(o=>o.userData.layer==='window').every(o=>o.userData.openingId==='upper'));
assert.throws(()=>validateWalls([...base,{...stacked,openings:[stacked.openings[0],{...stacked.openings[1],bottom:2.1}]}],base,rooms),/重叠/);
assert.throws(()=>validateWalls([...base,{...stacked,openings:stacked.openings.map(o=>({...o,id:'duplicate'}))}],base,rooms),/标识/);
const wall=makeWall(cut);wall.updateMatrixWorld(true);let mass=0;for(const o of wall.children){if(o.userData.layer!=='wall')continue;const size=new T.Box3().setFromObject(o).getSize(new T.Vector3());mass+=size.x*size.y*size.z;}assert(Math.abs(mass-(1.6*3-.9*2.2)*.12)<1e-6,'True door opening geometry has wrong volume');
const rotated=transformWall(cut,.3,.1,Math.PI/4);assert.deepEqual(rotated.openings,cut.openings);assert(Math.abs(Math.hypot(rotated.b[0]-rotated.a[0],rotated.b[1]-rotated.a[1])-1.6)<1e-8);validateWalls([...base,rotated],base,rooms);
const resized=resizeWall(cut,{end:1,side:1},.4,.08);
assert(Math.abs(wallLength(resized)-2)<1e-8);assert(Math.abs(resized.thickness-.2)<1e-8);assert.equal(resized.height,cut.height);assert.deepEqual(resized.openings,cut.openings);
assert(Math.abs(resized.a[1]-resized.thickness/2-(cut.a[1]-cut.thickness/2))<1e-8,'Opposite corner moved');
const shrinkStart=resizeWall(cut,{end:-1,side:0},.1,0);assert.deepEqual(shrinkStart.b,cut.b);assert(Math.abs(shrinkStart.openings[0].start+shrinkStart.a[0]-(cut.openings[0].start+cut.a[0]))<1e-8);
assert.throws(()=>validateWalls([...base,resizeWall(cut,{end:-1,side:0},.6,0)],base,rooms));
assert.throws(()=>resizeWall(base.find(w=>w.lock),{end:1,side:1},.2,.2));assert.throws(()=>resizeWall(cut,{end:-1,side:0},2,0));
for(const [across,thickness] of [[-2,.06],[2,.4]]){const capped=resizeWall(cut,{end:0,side:1},0,across);assert.equal(capped.thickness,thickness);validateWalls([...base,capped],base,rooms);}
const rotatedResize=resizeWall(rotated,{end:1,side:-1},.2,-.1),L=wallLength(rotated),u=[(rotated.b[0]-rotated.a[0])/L,(rotated.b[1]-rotated.a[1])/L];
assert(Math.abs((rotatedResize.b[0]-rotatedResize.a[0])*u[1]-(rotatedResize.b[1]-rotatedResize.a[1])*u[0])<1e-8,'Resize rotated wall direction');
assert(Math.abs(rotatedResize.a[0]-u[1]*rotatedResize.thickness/2-(rotated.a[0]-u[1]*rotated.thickness/2))<1e-8);
assert(Math.abs(rotatedResize.a[1]+u[0]*rotatedResize.thickness/2-(rotated.a[1]+u[0]*rotated.thickness/2))<1e-8);
const windowWall={...add,openings:[{start:.2,end:1.4,bottom:1.1,top:2.3,kind:'window'}]};let windowMass=0;const windowGroup=makeWall(windowWall);windowGroup.updateMatrixWorld(true);for(const o of windowGroup.children){if(o.userData.layer!=='wall')continue;const size=new T.Box3().setFromObject(o).getSize(new T.Vector3());windowMass+=size.x*size.y*size.z;}assert(Math.abs(windowMass-(1.6*3-1.2*1.2)*.12)<1e-6);
assert.throws(()=>validateFinishes({living:{wall:'invalid',floor:'oak'}},rooms.map(r=>r.id)));
const bytes=fs.readFileSync('public/assets/raw-shell/home.glb'),gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());
const bounds=n=>{const b=new T.Box3();for(const p of gltf.meshes[n.mesh].primitives){const a=gltf.accessors[p.attributes.POSITION];b.union(new T.Box3(new T.Vector3(...a.min),new T.Vector3(...a.max)));}return b.applyMatrix4(n.matrix?new T.Matrix4().fromArray(n.matrix):new T.Matrix4().compose(new T.Vector3(...(n.translation??[0,0,0])),new T.Quaternion(...(n.rotation??[0,0,0,1])),new T.Vector3(...(n.scale??[1,1,1]))));};
assert(!base.some(w=>w.id==='bath-main-south'));
assert(!gltf.nodes.some(n=>n.extras?.wallId==='bath-main-south'),'Master bathroom south edge must remain fully open');
assert.deepEqual(base.find(w=>w.id==='bath-main-west').openings,[]);
const mainWest=gltf.nodes.filter(n=>n.extras?.wallId==='bath-main-west');assert(mainWest.length&&mainWest.every(n=>n.extras.layer==='wall'),'Unexpected door in west bathroom wall');
const westBounds=new T.Box3();mainWest.forEach(n=>westBounds.union(bounds(n)));
assert(Math.abs(westBounds.min.y)<1e-6&&Math.abs(westBounds.max.y-3)<1e-6);
assert(Math.abs(westBounds.min.z+6.9)<1e-5&&Math.abs(westBounds.max.z+4.9)<1e-5);
const rev4=JSON.parse(fs.readFileSync('tests/fixtures/raw-shell-revision4.json','utf8'));
const old4={...structuredClone(initial),modelRevision:4,walls:structuredClone(rev4.walls)};
const corrected4=layoutModule.exports.upgradeModelLayout(old4,initial,project.layoutUpdate);validateWalls(corrected4.walls,base,rooms);
assert(!corrected4.walls.some(w=>w.id==='bath-main-south'));assert.deepEqual(corrected4.walls.find(w=>w.id==='bath-main-west').openings,[]);
const edited4=structuredClone(old4);edited4.walls.find(w=>w.id==='bath-main-west').thickness=.18;edited4.walls.find(w=>w.id==='bath-main-south').thickness=.2;
const kept4=layoutModule.exports.upgradeModelLayout(edited4,initial,project.layoutUpdate);validateWalls(kept4.walls,base,rooms);
assert.deepEqual(kept4.walls.find(w=>w.id==='bath-main-west'),edited4.walls.find(w=>w.id==='bath-main-west'),'Edited west wall should be retained');
assert.equal(kept4.walls.find(w=>w.id==='wall-migrated-bath-main-south').thickness,.2,'Edited south wall should remain as a custom partition');
for(const id of ['west-bedroom-north','east-bedroom-north']){
 const sill=gltf.nodes.filter(n=>n.extras?.wallId===id&&n.extras.layer==='wall').map(bounds).find(b=>Math.abs(b.max.y-.5)<1e-5&&Math.abs(b.min.y)<1e-5);assert(sill,'Actual GLB missing 0.5m sill '+id);
}
for(const id of ['living-south','master-south']){const bottom=gltf.nodes.filter(n=>n.extras?.wallId===id&&n.extras.layer==='window').map(bounds).reduce((y,b)=>Math.min(y,b.min.y),Infinity);assert(Math.abs(bottom)<1e-5,'Actual GLB window does not reach floor '+id);}
for(const id of ['garden-north','garden-east']){const b=new T.Box3();gltf.nodes.filter(n=>n.extras?.wallId===id).forEach(n=>b.union(bounds(n)));assert(Math.abs(b.max.y-1.2)<1e-5);}
assert(!gltf.nodes.some(n=>n.extras?.entityId));
assert(!gltf.nodes.some(n=>n.extras?.wallId==='kitchen-partition'),'Kitchen partition must be absent');
for(const id of ['master-east','east-bedroom-east'])assert(!gltf.nodes.some(n=>n.extras?.wallId===id&&n.extras.layer==='window'),'Unexpected east window '+id);
assert(gltf.nodes.some(n=>n.extras?.wallId==='guest-bath-north'&&n.extras.layer==='window'),'Missing guest bathroom north window');
for(const w of base)assert(gltf.nodes.some(n=>n.extras?.wallId===w.id),'GLB missing '+w.id);
for(const id of ['west-bedroom-north','east-bedroom-north'])assert(base.find(w=>w.id===id).openings.every(o=>o.bottom===.5));
for(const id of ['living-south','master-south'])assert(base.find(w=>w.id===id).openings.every(o=>o.bottom===0));
assert(base.filter(w=>w.railing).every(w=>w.height===1.2&&w.lock==='exterior'));
assert(!gltf.nodes.some(n=>n.extras?.room==='garden'&&n.extras?.layer==='ceiling'));
const catalogModule=new Module(__filename);catalogModule.paths=module.paths;catalogModule._compile(compile('src/catalog.ts'),__filename);
assert.equal(catalogModule.exports.CATALOG.length,20);
for(const item of catalogModule.exports.CATALOG){const furniture=catalogModule.exports.makeFurniture(item.id);furniture.updateMatrixWorld(true);const before=new T.Box3().setFromObject(furniture),size=before.getSize(new T.Vector3());assert(size.toArray().every(v=>Number.isFinite(v)&&v>.1));furniture.position.x=2;furniture.updateMatrixWorld(true);const after=new T.Box3().setFromObject(furniture);assert(Math.abs(after.min.x-before.min.x-2)<1e-6,item.id+' did not move as one group');}
assert.equal(project.height,3);assert(!project.rooms.some(r=>/楼梯|电梯/.test(r.name)));
assert.equal(base.find(w=>w.id==='living-south').b[0]-base.find(w=>w.id==='living-south').a[0],7);
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/raw-shell-geometry-report.json',JSON.stringify({passed:true,sourcePlan:'codex-clipboard-708ca40a-ea27-4575-9fff-b8c045ab2347.jpg',height:3,northWindowSill:.5,livingMasterWindowSill:0,balustradeHeight:1.2,rooms:rooms.length,walls:base.length,editableWalls:base.filter(w=>!w.lock).length,checks:['GLB semantic wall coverage','no furniture / staircase / elevator room','source dimensions','sill and balustrade geometry','immutable protection metadata','import validation','in-bounds additions','protected wall crossing rejection','real door opening volume']},null,2));console.log('Architecture geometry and protection passed');

