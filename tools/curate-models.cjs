// Explicit visual approval list. An imported GLB is not automatically approved.
const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),pub=path.join(root,'public/library'),src=path.join(root,'catalog-source');
const old=JSON.parse(fs.readFileSync(path.join(src,'catalog-before-quality.json'))).items;
const approved=new Set([
 'blend0-refrigerator','blend0-kitchenaid','blend0-doubleOven','blend0-largeFridge',
 'scopia-clothes_washing_machine','scopia-coffee_machine','scopia-cooker',
 'scopia-induction-cooker-2-zones','scopia-induction-cooker-4-zones',
 'scopia-inkjet_and_scanner_printer','scopia-mini_stereo','scopia-dishwasher',
 'scopia-small-oven','scopia-stereo_amplifier','scopia-toaster','scopia-video-projector',
 'blend0-rangeHood','blend0-riggedFan','blend0-oven',
 'scopia-japanese-toilet','scopia-islandBath',
 'scopia-rattanArmchair','scopia-rattanSofa','blend0-bedWithTexture','blendby-cornerSofa'
]);
const reasons={
 appliance:'保留完整机壳、门缝、操作面板与内部/附件造型；修正金属、涂层、玻璃反射，保留原贴图。',
 upholstery:'保留原曲面、织物/藤编贴图与完整部件；修正材质反射。',
 bathroom:'保留实际盆腔、龙头或智能盖板等结构；修正釉面与镀铬材质。'
};
const materialLog=[];
function writeGlb(sourceFile,dest,id){
 const b=fs.readFileSync(sourceFile),len=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+len)),tail=b.subarray(20+len);
 for(const m of g.materials??[]){
  const n=(m.name??'').toLowerCase(),p=m.pbrMetallicRoughness??={},before=JSON.stringify(m);
  // Legacy MTL conversion set IOR=1 and often suppressed all dielectric reflection.
  if(m.extensions){delete m.extensions.KHR_materials_specular;delete m.extensions.KHR_materials_ior;}
  let rough=.5,metal=0;
  if(/rubber|hole|concrete|pot$/.test(n))rough=.86;
  else if(/cushion|coverlet|pillow|mattress|^1$|^2$|^6$|podush/.test(n))rough=.9;
  else if(/rattan|venge/.test(n))rough=.6;
  else if(/glass|vidro|display/.test(n)||id.includes('induction-cooker'))rough=.15;
  else if(/white.?metal|whitebath|watercontainer|sink|bodytoilet|wc|ceramic/.test(n))rough=.24;
  else if(/chrome|cromo|inox|stainless|alumin|metal/.test(n)){metal=1;rough=/brushed|dull|stainless/.test(n)?.3:.2;}
  else if(/plastic|base|panel|writing|controls|textured|yellow|white/.test(n))rough=.35;
  else if((p.metallicFactor??0)>.5){metal=.95;rough=.3;}
  if(id==='scopia-japanese-toilet'&&!/metal|hole|wheel/.test(n))rough=.24;
  p.roughnessFactor=rough;p.metallicFactor=metal;m.pbrMetallicRoughness=p;
  // Never recolour or replace UV textures; transparent source panes stay transparent.
  if(before!==JSON.stringify(m))materialLog.push({id,material:m.name,roughness:rough,metalness:metal});
 }
 g.asset.generator='Home Planner quality review v2 · original geometry and textures, material corrections';
 const raw=Buffer.from(JSON.stringify(g)),j=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),h=Buffer.alloc(20);
 h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(20+j.length+tail.length,8);h.writeUInt32LE(j.length,12);h.writeUInt32LE(0x4e4f534a,16);
 fs.writeFileSync(dest,Buffer.concat([h,j,tail]));return {bytes:20+j.length+tail.length,maps:g.images?.length??0};
}
const kept=old.filter(i=>approved.has(i.id)).map(i=>{
 const file='library/models/'+i.id+'-quality-v2.glb';
 const original=path.join(root,'public',i.model),backup=path.join(src,'retired-assets',path.basename(i.model));
 const {bytes,maps}=writeGlb(fs.existsSync(original)?original:backup,path.join(root,'public',file),i.id);
 return {...i,model:file,modelBytes:bytes,materialMaps:maps,quality:'完整原模型 · 材质优化',precision:'原模型标称尺寸 · 非品牌实测',variants:undefined};
});
if(kept.length!==approved.size)throw Error('Approval ID missing');
const pbr=JSON.parse(fs.readFileSync(path.join(src,'pbr-candidates.json')));
// Correct the publisher's mixed asset names with the inspected object and its measured bounds.
for(const i of pbr){
 if(i.id==='ph-WoodenTable_01'){i.name='实木茶几';i.typeTags=['茶几'];}
 if(/ph-(ArmChair_01|Sofa_01|GreenChair_01|CoffeeTable_01|WoodenChair_01)/.test(i.id))i.styleTags=['古典'];
 if(i.id==='ph-modern_arm_chair_01')i.styleTags=['中古','简约现代'];
 if(i.id==='ph-mid_century_lounge_chair')i.styleTags=['中古'];
 i.style=i.styleTags.join(' · ');
 const t=i.id.toLowerCase();
 if(i.category==='椅凳')i.typeTags=[/ottoman/.test(t)?'脚凳':/rocking/.test(t)?'摇椅':/bar_chair/.test(t)?'吧椅':/stool/.test(t)?'凳子':/dining|woodenchair/.test(t)?'餐椅':'休闲椅'];
 if(i.category==='收纳')i.typeTags=[/shelves|chinese_cabinet/.test(t)?'展示柜':/commode|drawer/.test(t)?'抽屉柜':'边柜'];
 if(i.category==='沙发')i.typeTags=['直排沙发'];
 if(i.category==='桌子'&&i.typeTags[0]==='桌子')i.typeTags=[/console/.test(t)?'玄关桌':/side_table/.test(t)?'边桌':'餐桌'];
}
const featured=['ph-mid_century_lounge_chair','ph-modern_arm_chair_01','ph-modern_wooden_cabinet','ph-modern_coffee_table_01','ph-industrial_coffee_table','ph-drawer_cabinet','ph-coffee_table_round_01','ph-side_table_01'];
const online=JSON.parse(fs.readFileSync(path.join(src,'everyday-online-candidates.json'))),authored=JSON.parse(fs.readFileSync(path.join(src,'authored-candidates.json')));
for(const i of online){
 const id=i.id;i.typeTags=[id.includes('shelves')?'置物架':id.includes('desk_lamp')?'台灯':id.includes('ceiling_lamp')?'吊灯':id.includes('desk')?'书桌':id.includes('bench')?'长凳':id.includes('SchoolChair')?'学习椅':id.includes('chair')?'餐椅':'餐桌'];
 i.styleTags=id.includes('metal_office')?['工业风','复古']:id.includes('painted_wooden')?['复古','田园']:['简约现代','工业风'];i.style=i.styleTags.join(' · ');
 if(id==='ph-steel_frame_shelves_01')i.precision='来源标称尺寸 · 统一单位校准';
}
const items=[...authored,...online,...[...pbr,...kept].sort((a,b)=>(featured.indexOf(a.id)<0?99:featured.indexOf(a.id))-(featured.indexOf(b.id)<0?99:featured.indexOf(b.id)))];
for(const i of items)i.image='library/previews/'+i.id+'-quality.webp';
const modulePath=path.join(src,'legacy-metadata.cjs');
fs.writeFileSync(modulePath,esbuild.transformSync(fs.readFileSync(path.join(root,'src/catalog-legacy.ts'),'utf8'),{loader:'ts',format:'cjs'}).code);
const legacy=require(modulePath).CATALOG;
const retired=[...old.filter(i=>!approved.has(i.id)),...legacy].map(i=>({id:i.id,name:i.name,category:i.category,type:i.type,size:i.size,color:i.color,style:i.style,dimensions:i.dimensions,retired:true,retirementReason:!i.model?'尺寸示意或通用几何模型已下架':'造型、材质细节不足，已下架'}));
const report=[...old,...legacy].map(i=>({id:i.id,name:i.name,decision:approved.has(i.id)?'optimized':'removed',reason:approved.has(i.id)?reasons[i.category==='厨卫'?'bathroom':i.category==='家电'?'appliance':'upholstery']:!i.model?'仅尺寸/通用几何示意，无法据此还原商品':'逐件预览未通过：细节不足、材质不完整或不适合作为家装家具'}));
report.push(...pbr.map(i=>({id:i.id,name:i.name,decision:'added',reason:'逐件预览通过，原始网格、UV、2K PBR 贴图完整保留'})));
report.push(...online.map(i=>({id:i.id,name:i.name,decision:'added',reason:'完整源模型、PBR 贴图；校核来源尺寸并渲染检查'})),...authored.map(i=>({id:i.id,name:i.name,decision:'authored',reason:i.constructionDetails.join('；')})));
fs.writeFileSync(path.join(pub,'catalog.v1.json'),JSON.stringify({version:2,qualityRevision:'2026-09-16-everyday-v3',items,retired}));
fs.writeFileSync(path.join(pub,'catalog-audit.json'),JSON.stringify({styles:items.length,licensedGlbStyles:items.length,pbrStyles:pbr.length+online.length,authoredStyles:authored.length,optimizedStyles:kept.length,removedStyles:retired.length,schematicStyles:0},null,2));
fs.writeFileSync(path.join(pub,'quality-review.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(src,'quality-material-changes.json'),JSON.stringify(materialLog,null,2));
console.log(JSON.stringify({active:items.length,optimized:kept.length,pbr:pbr.length+online.length,authored:authored.length,retired:retired.length,materialsUpdated:materialLog.length}));
