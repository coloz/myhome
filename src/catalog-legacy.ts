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
 {id:'plant',name:'落地绿植',category:'绿植',style:'陶盆 · 可移动',color:'#73926a',size:'直径 0.6 m',type:'plant'},
 {id:'wardrobe',name:'白色双门衣柜',category:'床柜',style:'平板柜门 · 通高',color:'#e9e7df',size:'1.2 × 0.6 × 2.6 m',type:'wardrobe'},
 {id:'kitchen-base',name:'木色不锈钢地柜',category:'厨卫',style:'模块拼接 · 金属台面',color:'#bd945e',size:'0.6 × 0.6 × 0.86 m',type:'kitchen'},
 {id:'kitchen-sink',name:'不锈钢水槽地柜',category:'厨卫',style:'单槽 · 拉丝台面',color:'#bd945e',size:'0.9 × 0.6 × 0.86 m',type:'sink'},
 {id:'kitchen-hob',name:'燃气灶地柜',category:'厨卫',style:'双灶 · 不锈钢台面',color:'#bd945e',size:'0.8 × 0.6 × 0.86 m',type:'hob'},
 {id:'appliance-tower',name:'微波炉空气炸锅立柜',category:'厨卫',style:'木色高柜 · 双电器位',color:'#bd945e',size:'0.65 × 0.6 × 2.6 m',type:'appliances'},
 {id:'fridge',name:'双门冰箱',category:'厨卫',style:'不锈钢 · 整件移动',color:'#b8bdbd',size:'0.75 × 0.7 × 1.85 m',type:'fridge'},
 {id:'vanity',name:'悬空洗漱柜',category:'厨卫',style:'白陶盆 · 木色柜',color:'#b99168',size:'0.8 × 0.5 × 0.85 m',type:'vanity'},
 {id:'toilet',name:'白色坐便器',category:'厨卫',style:'一体式 · 白陶瓷',color:'#f0efeb',size:'0.4 × 0.7 m',type:'toilet'}
];
export type {CatalogItem} from './catalog-types';
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
 }else if(spec.type==='wardrobe'){
  box(0,1.3,0,1.2,2.6,.6,color);for(const x of [-.297,.297])box(x,1.31,.31,.585,2.54,.025,color);for(const x of [-.04,.04])box(x,1.2,.342,.013,.22,.02,chrome);
 }else if(['kitchen','sink','hob'].includes(spec.type)){
  const w=spec.type==='sink'?.9:spec.type==='hob'?.8:.6;
  box(0,.43,0,w,.8,.6,color);box(0,.035,0,w-.06,.07,.53,black);
  for(const x of [-w/4,w/4]){box(x,.46,.308,w/2-.012,.72,.025,color);box(x,.76,.33,w/2-.08,.012,.02,chrome);}
  if(spec.type==='sink'){
   box(0,.852,-.245,w,.025,.11,chrome);box(0,.852,.245,w,.025,.11,chrome);for(const x of [-.345,.345])box(x,.852,0,.21,.025,.38,chrome);
   box(0,.66,0,.48,.025,.38,chrome);for(const x of [-.235,.235])box(x,.755,0,.02,.19,.38,chrome);for(const z of [-.185,.185])box(0,.755,z,.48,.19,.02,chrome);
   rod(new T.Vector3(.2,.85,-.24),new T.Vector3(.2,1.15,-.24),.018,chrome);rod(new T.Vector3(.2,1.15,-.24),new T.Vector3(.2,1.15,-.03),.018,chrome);
  }else {box(0,.852,0,w+.012,.025,.615,chrome);if(spec.type==='hob'){box(0,.877,0,.62,.025,.4,black);for(const x of [-.18,.18]){cyl(x,.902,0,.1,.025,chrome);for(const z of [-.065,.065])box(x,.927,z,.23,.025,.02,black);}for(const x of [-.06,.06])cyl(x,.9,.13,.015,.025,chrome);}}
 }else if(spec.type==='appliances'){
  for(const x of [-.31,.31])box(x,1.3,0,.03,2.6,.6,color);box(0,1.3,-.285,.62,2.6,.03,color);
  for(const y of [.04,.73,1.4,1.99,2.58])box(0,y,0,.62,.035,.6,color);
  box(0,.38,.29,.59,.65,.025,color);box(0,2.3,.29,.59,.55,.025,color);
  box(0,1.62,0,.54,.39,.46,chrome);box(-.06,1.62,.238,.36,.28,.015,black);for(const y of [1.54,1.7])cyl(.205,y,.251,.019,.015,black).rotation.x=Math.PI/2;
  box(0,1.02,0,.35,.43,.37,black);box(0,.94,.2,.26,.23,.025,black);box(0,1.04,.23,.11,.045,.05,chrome);
 }else if(spec.type==='fridge'){
  box(0,.93,0,.75,1.84,.7,color);box(0,1.15,.363,.73,1.32,.03,color);box(0,.28,.363,.73,.4,.03,color);box(.27,1.05,.403,.018,.46,.035,chrome);box(0,.42,.403,.35,.018,.035,chrome);
 }else if(spec.type==='vanity'){
  box(0,.52,0,.8,.53,.5,color);box(0,.8,0,.83,.06,.53,white);ball(0,.83,0,.28,.09,.17,white);ball(0,.866,0,.235,.035,.13,mat('#c4cbc8'));rod(new T.Vector3(0,.83,-.2),new T.Vector3(0,1.07,-.2),.014,chrome);rod(new T.Vector3(0,1.07,-.2),new T.Vector3(0,1.07,-.04),.014,chrome);
 }else if(spec.type==='toilet'){
  ball(0,.2,.06,.15,.2,.24,color);ball(0,.405,.08,.2,.075,.3,color);ball(0,.452,.11,.145,.012,.21,mat('#c9cecc'));box(0,.53,-.24,.37,.55,.17,color);box(0,.82,-.24,.39,.035,.19,color);
 }else{
  cyl(0,.18,0,.20,.36,mat('#af7755'));cyl(0,.365,0,.185,.014,wood);
  for(let i=0;i<9;i++){const a=i*2.399;const h=.55+i*.075;const end=new T.Vector3(Math.cos(a)*.15,h,Math.sin(a)*.15);rod(new T.Vector3(0,.35,0),end,.009,color);const leaf=ball(end.x,h,end.z,.085,.02,.26,color);leaf.rotation.set(.3,a,.2);}
 }
 g.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
 return g;
}
