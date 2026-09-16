// Repackage original glTF geometry and 2K PBR maps without remeshing/decimation.
const fs=require('node:fs'),path=require('node:path'),T=require('three');
const root=path.resolve(__dirname,'..'),src=path.join(root,'catalog-source'),out=path.join(root,'public/library');
const info=JSON.parse(fs.readFileSync(path.join(src,'polyhaven-assets.json'),'utf8'));
const names={ArmChair_01:'织物扶手椅',CoffeeTable_01:'实木茶几',GreenChair_01:'绿色软包休闲椅',Ottoman_01:'软包脚凳',Rockingchair_01:'木质摇椅',Sofa_01:'布艺沙发',WoodenChair_01:'木质餐椅',WoodenTable_01:'实木餐桌',bar_chair_round_01:'圆座吧椅',chinese_armchair:'中式扶手椅',chinese_cabinet:'中式高柜',chinese_commode:'中式斗柜',chinese_console_table:'中式条案',chinese_sofa:'中式木沙发',chinese_stool:'中式圆凳',chinese_tea_table:'中式茶桌',coffee_table_round_01:'圆形茶几',dining_chair_02:'软包餐椅',drawer_cabinet:'木质抽屉柜',electric_stove:'独立式电灶烤箱',folding_wooden_stool:'折叠木凳',industrial_coffee_table:'工业风茶几',mid_century_lounge_chair:'中古皮革休闲椅',modern_arm_chair_01:'现代软包扶手椅',modern_coffee_table_01:'现代茶几 01',modern_coffee_table_02:'现代茶几 02',modern_wooden_cabinet:'现代木柜',round_wooden_table_01:'圆形木餐桌 01',round_wooden_table_02:'圆形木餐桌 02',side_table_01:'木质边桌',sofa_02:'复古皮沙发',sofa_03:'雕花皮沙发',vintage_cabinet_01:'复古木柜',vintage_microwave:'复古微波炉',wooden_display_shelves_01:'实木展示架',wooden_stool_02:'木凳'};
const extraNames={metal_office_desk:'金属双柜书桌',steel_frame_shelves_01:'钢木五层置物架',steel_frame_shelves_02:'钢木宽幅置物架',steel_frame_shelves_03:'钢木抽屉置物架',desk_lamp_arm_01:'关节长臂台灯',modern_ceiling_lamp_01:'现代玻璃吊灯',painted_wooden_bench:'靠背木长凳',SchoolChair_01:'木座金属学习椅',painted_wooden_chair_01:'涂装木餐椅',wooden_table_02:'木质工作桌'};
const items=[];for(const id of JSON.parse(fs.readFileSync(path.join(src,process.argv[2]??'polyhaven-selected.json')))){
 const dir=path.join(src,'polyhaven',id),gltf=JSON.parse(fs.readFileSync(path.join(dir,id+'.gltf'))),bounds=new T.Box3();
 const chunks=[],offsets=[];let length=0;
 const append=data=>{const offset=length,pad=(4-data.length%4)%4;chunks.push(data,Buffer.alloc(pad));length+=data.length+pad;return offset;};
 for(const b of gltf.buffers)offsets.push(append(fs.readFileSync(path.join(dir,decodeURIComponent(b.uri)))));
 for(const v of gltf.bufferViews){v.byteOffset=(v.byteOffset??0)+offsets[v.buffer];v.buffer=0;}
 for(const image of gltf.images??[]){if(!image.uri)continue;const file=decodeURIComponent(image.uri),data=fs.readFileSync(path.join(dir,file));image.bufferView=gltf.bufferViews.length;image.mimeType=file.toLowerCase().endsWith('.png')?'image/png':'image/jpeg';gltf.bufferViews.push({buffer:0,byteOffset:append(data),byteLength:data.length});delete image.uri;}
 function visit(index,parent){const n=gltf.nodes[index],local=n.matrix?new T.Matrix4().fromArray(n.matrix):new T.Matrix4().compose(new T.Vector3().fromArray(n.translation??[0,0,0]),new T.Quaternion().fromArray(n.rotation??[0,0,0,1]),new T.Vector3().fromArray(n.scale??[1,1,1])),world=parent.clone().multiply(local);
  if(n.mesh!==undefined)for(const primitive of gltf.meshes[n.mesh].primitives){const a=gltf.accessors[primitive.attributes.POSITION];if(!a.min||!a.max)throw Error('Missing bounds '+id);bounds.union(new T.Box3(new T.Vector3().fromArray(a.min),new T.Vector3().fromArray(a.max)).applyMatrix4(world));}
  for(const child of n.children??[])visit(child,world);
 }
 const scene=gltf.scenes[gltf.scene??0];for(const index of scene.nodes)visit(index,new T.Matrix4());
 const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
 // One shelf was published in decimetres. Correct units uniformly using the
 // source's millimetre bounds, without stretching any part or changing topology.
 const unitScale=id==='steel_frame_shelves_01'?.1:1;
 const dims=[size.x*unitScale,size.z*unitScale,size.y*unitScale];
 if(unitScale!==1&&dims.some((v,i)=>Math.abs(v-info[id].dimensions[i]/1000)>.003))throw Error('Source unit calibration mismatch '+id);
 if(dims.some(n=>!Number.isFinite(n)||n<.01||n>7))throw Error('Invalid natural scale '+id+' '+dims);
 const source='https://polyhaven.com/a/'+id,creator=Object.keys(info[id].authors??{}).join(', ')+' / Poly Haven';
 const wrapper=gltf.nodes.length;gltf.nodes.push({name:id,translation:[-center.x*unitScale,-bounds.min.y*unitScale,-center.z*unitScale],scale:[unitScale,unitScale,unitScale],children:[...scene.nodes],extras:{source,creator,license:'CC0-1.0',geometry:'Original authored mesh, no decimation',textureResolution:'2K',unitScale}});scene.nodes=[wrapper];
 gltf.buffers=[{byteLength:length}];gltf.asset.generator='Home Planner · original Poly Haven glTF repack';
 const j=Buffer.from(JSON.stringify(gltf)),jp=Buffer.alloc((4-j.length%4)%4,32),bin=Buffer.concat(chunks),head=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
 head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+j.length+jp.length+8+bin.length,8);jh.writeUInt32LE(j.length+jp.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
 const data=Buffer.concat([head,jh,j,jp,bh,bin]);if(data.length>20*1024*1024)throw Error('Model exceeds load budget '+id+' '+data.length);
 const rid='ph-'+id;fs.writeFileSync(path.join(out,'models',rid+'.glb'),data);
 const text=id.toLowerCase(),category=/lamp/.test(text)?'灯具':/sofa/.test(text)?'沙发':/chair|stool|ottoman|bench/.test(text)?'椅凳':/cabinet|commode|shelves/.test(text)?'收纳':/stove|microwave/.test(text)?'家电':'桌子';
 const typeTags=[/microwave/.test(text)?'微波炉':/stove/.test(text)?'灶具/烤箱':/coffee|tea_table/.test(text)?'茶几':category];
 const styleTags=[/^chinese/.test(text)?'中式':/industrial/.test(text)?'工业风':/vintage|sofa_0[23]/.test(text)?'复古':/mid_century|armchair|greenchair/.test(text)?'中古':/modern/.test(text)?'简约现代':'北欧'];
 items.push({id:rid,name:names[id]??extraNames[id]??info[id].name,description:info[id].name,brand:'Poly Haven',category,type:category==='家电'?'appliance':category==='收纳'?'cabinet':category==='椅凳'?'chair':category==='沙发'?'sofa':category==='灯具'?'lamp':'table',typeTags,styleTags,style:styleTags.join(' · '),color:'#c3b091',dimensions:dims,size:dims.map(n=>(n*100).toFixed(1)).join(' × ')+' cm',model:'library/models/'+rid+'.glb',source,creator,license:'CC0-1.0',precision:'原模型米制比例 · 非品牌实测',styleKey:rid,elevation:id==='modern_ceiling_lamp_01'?3-dims[2]:0,modelBytes:data.length,quality:'完整造型 · 原始 PBR 材质',materialMaps:(gltf.images??[]).length});
}
fs.writeFileSync(path.join(src,process.argv[3]??'pbr-candidates.json'),JSON.stringify(items,null,2));console.log('Packed',items.length,'original models');
