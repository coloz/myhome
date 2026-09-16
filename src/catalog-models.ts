import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {CatalogItem} from './catalog-types';

// Dimension-controlled schematic geometry. It is deliberately labelled as such in
// the catalogue: manufacturer dimensions are factual, fine shape/materials are approximate.
export function makeDimensionFurniture(s:CatalogItem):T.Group {
 const [w,d,h]=s.dimensions!, g=new T.Group();g.name=s.name;
 const body=new T.MeshStandardMaterial({color:s.color,roughness:.65}),wood=new T.MeshStandardMaterial({color:'#b38c62',roughness:.65}),metal=new T.MeshStandardMaterial({color:'#929da2',metalness:.82,roughness:.3}),dark=new T.MeshStandardMaterial({color:'#252a2d',roughness:.5}),fabric=new T.MeshStandardMaterial({color:s.color,roughness:.95}),white=new T.MeshStandardMaterial({color:'#eeece5',roughness:.85}),glass=new T.MeshStandardMaterial({color:'#b9d3d8',transparent:true,opacity:.32,roughness:.12,metalness:.15,depthWrite:false});
 const text=(s.series??'')+' '+(s.description??s.name),m=s.measures??{}, t=Math.min(.025,w*.04,d*.045,h*.07);
 function box(x:number,y:number,z:number,a:number,b:number,c:number,mat:T.Material=body){const mesh=new T.Mesh(new T.BoxGeometry(Math.max(.001,a),Math.max(.001,b),Math.max(.001,c)),mat);mesh.position.set(x,y,z);g.add(mesh);return mesh;}
 function cylinder(x:number,y:number,z:number,a:number,b:number,c:number,mat:T.Material=body){const mesh=new T.Mesh(new T.CylinderGeometry(a,a,b,20),mat);mesh.scale.z=c/a;mesh.position.set(x,y,z);g.add(mesh);return mesh;}
 function rod(a:T.Vector3,b:T.Vector3,r:number,mat:T.Material=metal){const v=b.clone().sub(a),o=new T.Mesh(new T.CylinderGeometry(r,r,v.length(),12),mat);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());g.add(o);}
 function soft(x:number,y:number,z:number,a:number,b:number,c:number,mat:T.Material=fabric,r=.05){const mesh=new T.Mesh(new RoundedBoxGeometry(a,b,c,3,Math.min(r,a*.45,b*.45,c*.45)),mat);mesh.position.set(x,y,z);g.add(mesh);return mesh;}
 function bentRail(points:number[][],radius:number,mat:T.Material){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p as [number,number,number])));const mesh=new T.Mesh(new T.TubeGeometry(curve,24,radius,8,false),mat);g.add(mesh);}
 function legs(top:number,mat:T.Material=wood,inset=.055){for(const x of [-1,1])for(const z of [-1,1])box(x*(w/2-inset),top/2,z*(d/2-inset),Math.min(.055,w*.08),top,Math.min(.055,d*.08),mat);}
 const seat=Math.min(h*.62,m['座高']??.45);
 if(/DYVLINGE|迪夫林厄/.test(text)){
  const sh=h*.40;
  cylinder(0,sh*.47,0,.036,sh*.84,.036,metal);
  for(let i=0;i<5;i++){const a=i*Math.PI*.4+.3;rod(new T.Vector3(0,.12,0),new T.Vector3(Math.cos(a)*w*.48,.025,Math.sin(a)*d*.46),.021,metal);}
  soft(0,sh,.035,w*.94,h*.21,d*.79,fabric,.09);
  soft(0,sh-.09,.005,w*.88,h*.1,d*.71,fabric,.045);
  const back=soft(0,h*.71,-d*.28,w*.93,h*.60,d*.24,fabric,.095);back.rotation.x=-.18;
  // Six inset-style buttons on the same upholstery, attached to the assembly.
  for(const row of [0,1])for(const col of [-1,0,1]){
   const button=new T.Mesh(new T.SphereGeometry(.017,12,8),fabric);button.scale.z=.32;
   const y=h*(.63+row*.17);button.position.set(col*w*.25,y,-d*.135+(y-h*.71)*.18);g.add(button);
  }
 }else if(/POÄNG|波昂/.test(text)&&s.type!=='stool'){
  for(const sign of [-1,1]){
   const x=sign*w*.43;
   bentRail([[x,.026,-d*.43],[x,.025,d*.33],[x,seat*.36,d*.38],[x,seat*.94,d*.12],[x,h*.70,-d*.20],[x,h*.96,-d*.40]],.026,wood);
   bentRail([[x,seat*.90,d*.2],[x,seat*1.34,d*.22],[x,seat*1.42,-d*.13],[x,seat*1.35,-d*.31]],.024,wood);
  }
  rod(new T.Vector3(-w*.43,.07,-d*.32),new T.Vector3(w*.43,.07,-d*.32),.023,wood);
  soft(0,seat*.91,.04,w*.80,.10,d*.57,fabric,.035).rotation.x=.12;
  soft(0,(seat+h)*.50,-d*.27,w*.80,h-seat+.06,.11,fabric,.035).rotation.x=-.23;
  soft(0,h*.91,-d*.355,w*.78,.17,.13,fabric,.035).rotation.x=-.23;
 }else if(/STRANDMON|斯佳蒙/.test(text)&&s.type!=='stool'){
  const leg=h*.13,sh=h*.4;
  legs(leg,wood,w*.12);soft(0,leg+(sh-leg)*.4,0,w*.95,(sh-leg)*.8,d*.86,fabric,.05);
  soft(0,sh,d*.08,w*.70,h*.13,d*.71,fabric,.06);
  soft(0,h*.68,-d*.33,w*.72,h*.64,d*.22,fabric,.095).rotation.x=-.10;
  for(const sign of [-1,1]){
   soft(sign*w*.40,h*.43,0,w*.19,h*.39,d*.9,fabric,.07);
   const wing=soft(sign*w*.38,h*.78,-d*.27,w*.18,h*.44,d*.33,fabric,.07);wing.rotation.y=-sign*.28;
   const roll=soft(sign*w*.4,h*.59,d*.16,w*.20,h*.12,d*.54,fabric,.065);roll.rotation.x=.06;
  }
 }else if(s.type==='sofa'||s.type==='armchair'){
  const arm=Math.min(.18,w*.10),leg=/ÄPPLARYD|MORABO|LANDSKRONA|斯德哥尔摩|实木/.test(text)?.17:.075,backD=Math.min(.23,d*.23);
  legs(leg,/LANDSKRONA|ÄPPLARYD/.test(text)?metal:wood,.07);
  box(0,leg+(seat-leg)*.45,0,w,(seat-leg)*.9,d,fabric);
  const n=Math.max(1,/四人/.test(text)?4:/三人/.test(text)?3:/双人|两人/.test(text)?2:Math.round(w/.85));
  for(let i=0;i<n;i++){
   const sw=(w-arm*2)/n;
   soft(-w/2+arm+sw*(i+.5),seat-.08,backD*.4,sw-.012,.16,d-backD-.03,fabric);
   const back=soft(-w/2+arm+sw*(i+.5),(seat+h)/2,-d/2+backD/2,sw-.015,h-seat,backD,fabric);back.rotation.x=-.07;
  }
  if(!/无扶手/.test(text))for(const x of [-1,1])soft(x*(w-arm)/2,(seat*.65+h*.75)/2,0,arm,h*.75-seat*.65,d,fabric);
  if(/STRANDMON|斯佳蒙/.test(text))for(const x of [-1,1])box(x*(w-arm)/2,h*.84,-d*.26,arm*.7,h*.32,d*.34,fabric);
  if(/贵妃|躺椅/.test(text)&&w>1.3)box(w*.27,seat-.11,d*.2,w*.42,.22,d*.58,fabric);
 }else if(s.type==='chair'||s.type==='stool'||s.type==='bench'){
  const sh=s.type==='stool'||s.type==='bench'?h-.05:seat;
  const swivel=/转椅|旋转|办公|电竞/.test(text),bent=/POÄNG|波昂/.test(text);
  if(swivel){cylinder(0,sh/2,0,.035,sh,.035,metal);for(let i=0;i<5;i++){const a=i*Math.PI*.4;rod(new T.Vector3(0,.10,0),new T.Vector3(Math.cos(a)*w*.44,.04,Math.sin(a)*d*.44),.021);}}
  else if(bent){for(const x of [-1,1]){rod(new T.Vector3(x*w*.43,.03,-d*.45),new T.Vector3(x*w*.43,sh,d*.25),.027,wood);rod(new T.Vector3(x*w*.43,sh,d*.25),new T.Vector3(x*w*.43,h,-d*.37),.028,wood);}}
  else legs(sh,/钢|金属|折叠/.test(text)?metal:wood,Math.min(w,d)*.1);
  if(/圆|转椅|旋转/.test(text))cylinder(0,sh,0,w/2,.09,d*.44,fabric);else box(0,sh,0,w,.07,d*.83,body);
  if(s.type==='chair'){
   const backH=h-sh;box(0,sh+backH/2,-d*.43,w*.85,backH,.07,body);
   if(/扶手/.test(text))for(const x of [-1,1]){box(x*w*.46,sh+.2,0,w*.075,.06,d*.65,wood);box(x*w*.46,sh+.1,d*.22,.03,.2,.03,wood);}
  }
 }else if(['table','desk','dining'].includes(s.type)){
  const round=!!m['直径']||/圆桌|圆形/.test(text),top=.035;
  const surface=/玻璃/.test(text)?glass:body;
  if(round)cylinder(0,h-top/2,0,w/2,top,d/2,surface);else box(0,h-top/2,0,w,top,d,surface);
  if(/DOCKSTA|杜克塔/.test(text)){cylinder(0,h/2,0,w*.08,h-top,d*.08,white);cylinder(0,.035,0,w*.32,.07,d*.32,white);}
  else if(/升降/.test(text)){for(const x of [-1,1]){box(x*w*.33,(h-top)/2,0,.08,h-top,.08,metal);box(x*w*.33,.025,0,.08,.05,d*.85,metal);}}
  else legs(h-top,/金属|钢|玻璃/.test(text)?metal:wood,Math.min(w,d)*.10);
  if(s.type==='desk'&&/抽屉/.test(text))box(w*.3,h*.64,0,w*.27,h*.6,d*.85,body);
  if(/LACK|拉克/.test(text)&&h<.6&&w>.8)box(0,.17,0,w*.86,.025,d*.84,body);
 }else if(s.type==='bed'){
  const bunk=/双层|高架|阁楼/.test(text),base=bunk?h*.65:Math.min(.35,h*.32),pillowZ=-d*.3;
  legs(base,wood,.04);box(0,base,0,w,.16,d,body);box(0,base+.14,0,w*.95,.16,d*.96,white);
  box(0,h/2,-d/2+.035,w,h,.07,body);
  if(bunk){for(const x of [-1,1])for(const z of [-1,1])box(x*(w/2-.03),h/2,z*(d/2-.03),.06,h,.06,body);for(let i=0;i<5;i++)box(w*.36,(i+.5)*base/5,d*.46,w*.25,.025,.045,wood);}
  else{box(0,base+.245,d*.15,w*.94,.045,d*.6,new T.MeshStandardMaterial({color:'#a8becb',roughness:1}));for(const x of w>1.2?[-1,1]:[0])box(x*w*.24,base+.26,pillowZ,w*.42,.10,d*.18,white);}
 }else if(['cabinet','wardrobe','shelf','kitchen','vanity','rack'].includes(s.type)){
  const open=s.type==='shelf'||s.type==='rack'||/开放式|框架|搁架|书柜/.test(text)&&!/门|抽屉/.test(text),grid=/KALLAX|卡莱克/.test(text),leg=/斗柜|餐边|电视柜/.test(text)?Math.min(.1,h*.15):0;
  const bh=h-leg;box(-w/2+t/2,leg+bh/2,0,t,bh,d);box(w/2-t/2,leg+bh/2,0,t,bh,d);box(0,h-t/2,0,w,t,d);box(0,leg+t/2,0,w,t,d);
  if(s.type!=='rack')box(0,leg+bh/2,-d/2+t/2,w,bh,t,body);
  if(leg)legs(leg,wood,.035);
  const rows=grid?Math.max(1,Math.round(h/.37)):Math.min(7,Math.max(1,Math.round(bh/.38))),cols=grid?Math.max(1,Math.round(w/.37)):Math.max(1,Math.round(w/.7));
  if(open){for(let i=1;i<rows;i++)box(0,leg+bh*i/rows,0,w,t,d);for(let i=1;i<cols;i++)box(-w/2+w*i/cols,leg+bh/2,0,t,bh,d);}
  else{
   const drawerMatch=text.match(/(\d+)屉/),drawerWords=/抽屉|斗柜/.test(text),n=drawerMatch?+drawerMatch[1]:drawerWords?Math.min(6,Math.max(2,Math.round(h/.23))):1;
   for(let c=0;c<cols;c++)for(let i=0;i<n;i++){
    const cw=(w-t*2)/cols,ch=(bh-t*2)/n,xx=-w/2+t+cw*(c+.5),yy=leg+t+ch*(i+.5);
    box(xx,yy,d/2-t/2,cw-.008,ch-.008,t,/玻璃/.test(text)?glass:body);
    box(xx,yy+(n>1?ch*.27:0),d/2+.014,Math.min(.11,cw*.3),.014,.024,metal);
   }
  }
  if(s.type==='kitchen'||s.type==='vanity'){box(0,h-.013,0,w,.026,d,s.type==='kitchen'?metal:white);if(/水槽|洗脸|洗手/.test(text)){box(0,h+.002,0,w*.65,.012,d*.5,dark);rod(new T.Vector3(0,h,-d*.35),new T.Vector3(0,h+.2,-d*.35),.014);}}
 }else if(s.type==='lamp'){
  const ceiling=/吊灯|吸顶/.test(text),wall=/壁灯/.test(text);
  if(ceiling){cylinder(0,h*.5,0,.006,h,.006,metal);cylinder(0,h*.2,0,w/2,h*.4,d/2,body);}
  else if(wall){box(0,h/2,-d*.4,w*.65,h*.75,d*.2,metal);cylinder(0,h*.5,0,w/2,h*.6,d/2,body);}
  else{cylinder(0,.02,0,w*.36,.04,d*.36,metal);cylinder(0,h*.45,0,.012,h*.88,.012,metal);cylinder(0,h*.82,0,w/2,h*.36,d/2,body);}
 }else if(s.type==='mirror'){
  box(0,h/2,0,w,h,d,body);box(0,h/2,d*.51,w*.96,h*.96,.003,metal);
 }else if(s.type==='appliance'){
  box(0,h/2,0,w,h,d,body);const oven=/烤箱|微波炉/.test(text),fridge=/冰箱|冷藏|冷冻/.test(text);
  if(oven){box(0,h*.45,d/2+.003,w*.86,h*.65,.016,dark);box(0,h*.8,d/2+.027,w*.8,.025,.035,metal);for(const x of [-1,1])cylinder(x*w*.33,h*.92,d*.5,.026,.02,.026,metal).rotation.x=Math.PI/2;}
  else if(fridge){box(0,h*.33,d/2+.004,w,.008,.012,dark);box(w*.39,h*.61,d/2+.025,.026,h*.32,.035,metal);}
  else if(/灶/.test(text)){for(const x of [-1,1])for(const z of [-1,1])cylinder(x*w*.26,h+.004,z*d*.27,w*.13,.014,d*.13,dark);}
  else{box(0,h*.7,d/2+.002,w*.75,h*.12,.01,dark);box(0,h*.55,d/2+.02,w*.7,.024,.028,metal);}
 }else box(0,h/2,0,w,h,d,body);
 // Normalize to the manufacturer's assembled outer size. No guessed dimension
 // can enter this function: the manifest builder requires all three dimensions.
 const bounds=new T.Box3().setFromObject(g,true),extent=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 const matrix=new T.Matrix4().makeScale(w/extent.x,h/extent.y,d/extent.z).multiply(new T.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
 for(const child of g.children){if(child instanceof T.Mesh){child.updateMatrix();child.geometry.applyMatrix4(matrix.clone().multiply(child.matrix));child.position.set(0,0,0);child.quaternion.identity();child.scale.set(1,1,1);child.updateMatrix();child.castShadow=true;child.receiveShadow=true;}}
 g.userData['precision']=s.precision;return g;
}
