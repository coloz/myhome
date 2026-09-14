import * as T from 'three';
export const CATALOG=[
 {id:'sofa-white',name:'云白布艺沙发',category:'沙发',style:'直线 · 三人位',color:'#ede9df',size:'2.2 × 0.92 m',type:'sofa'},
 {id:'sofa-blue',name:'雾蓝模块沙发',category:'沙发',style:'包豪斯 · 低靠背',color:'#92aebc',size:'2.2 × 0.92 m',type:'sofa'},
 {id:'chair-egg',name:'蛋黄旋转单椅',category:'椅子',style:'软包 · 镀铬底座',color:'#e5c56d',size:'0.78 × 0.8 m',type:'chair'},
 {id:'chair-green',name:'森林绿单椅',category:'椅子',style:'软包 · 镀铬底座',color:'#729377',size:'0.78 × 0.8 m',type:'chair'},
 {id:'table-black',name:'黑色正方茶几',category:'桌子',style:'薄台面 · 细腿',color:'#272b28',size:'0.65 × 0.65 m',type:'table'},
 {id:'table-oak',name:'橡木正方茶几',category:'桌子',style:'自然木色 · 细腿',color:'#b48857',size:'0.65 × 0.65 m',type:'table'},
 {id:'dining-glass',name:'透明玻璃圆桌',category:'桌子',style:'圆形 · 镀铬支架',color:'#c4ddd8',size:'直径 1.05 m',type:'dining'},
 {id:'dining-oak',name:'温润木圆桌',category:'桌子',style:'中古 · 实木',color:'#b58855',size:'直径 1.05 m',type:'dining'},
 {id:'bed-oak',name:'木靠背双人床',category:'床柜',style:'1.8 m · 浅蓝床品',color:'#b0875f',size:'2.08 × 1.88 m',type:'bed'},
 {id:'cabinet-white',name:'轻巧白色斗柜',category:'床柜',style:'三层收纳 · 细脚',color:'#e7e8df',size:'1.0 × 0.42 m',type:'cabinet'},
 {id:'cabinet-oak',name:'自然木色斗柜',category:'床柜',style:'三层收纳 · 细脚',color:'#b68c61',size:'1.0 × 0.42 m',type:'cabinet'},
 {id:'plant',name:'落地绿植',category:'绿植',style:'陶盆 · 可移动',color:'#73926a',size:'直径 0.6 m',type:'plant'}
];
export type CatalogItem=typeof CATALOG[number];
function mat(c:string,metal=0,rough=.55){return new T.MeshStandardMaterial({color:c,roughness:rough,metalness:metal});}
export function makeFurniture(id:string) {
 const spec=CATALOG.find(x=>x.id===id);if(!spec)throw new Error('未知家具样式');
 const g=new T.Group();const color=mat(spec.color),chrome=mat('#9fa9aa',.9,.23),wood=mat('#a2784b'),white=mat('#eeece4'),black=mat('#242a26');
 function box(x:number,y:number,z:number,w:number,h:number,d:number,m:T.Material){const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o);return o;}
 function ball(x:number,y:number,z:number,sx:number,sy:number,sz:number,m:T.Material){const o=new T.Mesh(new T.SphereGeometry(1,20,12),m);o.scale.set(sx,sy,sz);o.position.set(x,y,z);g.add(o);return o;}
 function cyl(x:number,y:number,z:number,r:number,h:number,m:T.Material){const o=new T.Mesh(new T.CylinderGeometry(r,r,h,40),m);o.position.set(x,y,z);g.add(o);return o;}
 function rod(a:T.Vector3,b:T.Vector3,r:number,m:T.Material){const o=cyl(0,0,0,r,a.distanceTo(b),m);o.position.copy(a.clone().add(b).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());return o;}
 if(spec.type==='sofa'){
  box(0,.25,0,2.2,.3,.9,color);box(0,.66,-.37,2.2,.7,.18,color);
  for(const x of [-.72,0,.72]){box(x,.45,.04,.70,.17,.68,color);box(x,.77,-.22,.68,.55,.17,color);}
  for(const x of [-1.03,1.03])box(x,.52,0,.16,.54,.88,color);
  for(const x of [-.94,.94])for(const z of [-.32,.32])cyl(x,.08,z,.026,.16,black);
 }else if(spec.type==='chair'){
  ball(0,.44,0,.39,.14,.4,color);const b=ball(0,.76,-.23,.35,.39,.12,color);b.rotation.x=-.16;
  cyl(0,.22,0,.035,.31,chrome);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;rod(new T.Vector3(0,.13,0),new T.Vector3(.39*Math.cos(a),.035,.39*Math.sin(a)),.022,chrome);}
  for(const x of [-.16,.16])for(const y of [.69,.89])ball(x,y,-.112,.017,.017,.01,color);
 }else if(spec.type==='table'){
  box(0,.395,0,.65,.025,.65,color);for(const x of [-.29,.29])for(const z of [-.29,.29])box(x,.19,z,.025,.38,.025,color);
 }else if(spec.type==='dining'){
  const top=id==='dining-glass'?new T.MeshPhysicalMaterial({color:'#d9eee7',transparent:true,opacity:.35,roughness:.08,metalness:.1}):color;
  cyl(0,.75,0,.525,.023,top);const frame=id==='dining-glass'?chrome:wood;
  for(const x of [-.26,.26])for(const z of [-.26,.26])rod(new T.Vector3(x*1.3,.025,z*1.3),new T.Vector3(x,.735,z),.022,frame);
 }else if(spec.type==='bed'){
  box(0,.22,0,1.88,.20,2.08,color);box(0,.42,0,1.8,.23,2.0,white);box(0,.57,0,1.82,.12,1.96,white);box(0,.61,-1.03,1.9,.95,.07,color);
  for(const x of [-.44,.44])box(x,.69,-.63,.68,.15,.46,white);box(0,.642,.50,1.84,.02,.65,mat('#a8c2ce'));
 }else if(spec.type==='cabinet'){
  box(0,.49,0,1,.72,.42,color);for(const y of [.27,.50,.72]){box(0,y,.218,.965,.205,.025,color);box(0,y+.04,.24,.17,.012,.016,chrome);}
  for(const x of [-.42,.42])for(const z of [-.15,.15])cyl(x,.07,z,.015,.14,chrome);
 }else{
  cyl(0,.18,0,.20,.36,mat('#af7755'));cyl(0,.365,0,.185,.014,wood);
  for(let i=0;i<9;i++){const a=i*2.399;const h=.55+i*.075;const end=new T.Vector3(Math.cos(a)*.15,h,Math.sin(a)*.15);rod(new T.Vector3(0,.35,0),end,.009,color);const leaf=ball(end.x,h,end.z,.085,.02,.26,color);leaf.rotation.set(.3,a,.2);}
 }
 g.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
 return g;
}

