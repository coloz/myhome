import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { nearestWallAlongView } from './wall-visibility';
import type { AssemblyDefinition, LegacyEntity, ModelLayoutUpdate } from './layout';
import { SCHEMES, type Scheme } from './schemes';
import { WalkControls, type WalkStatus } from './walk-controls';
import { EYE_HEIGHT, entranceApproach, onFloor, blockedByWall } from './walk-motion';
import { inPolygon } from './walk-motion';
import { DEFAULT_FINISH, WALL_COLORS, FLOOR_STYLES, type WallRecord, type RoomFinish } from './architecture';

export type Room = {id:string;name:string;center:number[];bounds:number[];polygon:number[][];greeneryOnly:boolean;eye:number[];look:number[]};
export type Project = {rooms:Room[];height:number;version:string;revision?:number;visualRevision?:string;defaultDecorated?:boolean;walls?:WallRecord[];layoutUpdate?:ModelLayoutUpdate;stats:{bytes:number;exportGroups:number};scaleNote:string;view?:{center:number[];span:number};assemblyVersion?:number;assemblies?:AssemblyDefinition[];legacyEntities?:LegacyEntity[]};
export type RoomState = {visible:boolean;decorated:boolean};
export type Part = {mesh:THREE.Mesh;room:string;rooms:string[];layer:string;cutaway:string;box:THREE.Box3;original:THREE.Material|THREE.Material[];wallId?:string;disabled?:boolean;dynamicWall?:boolean};
export class HomeViewer {
  renderer:THREE.WebGLRenderer;
  scene=new THREE.Scene();
  perspective=new THREE.PerspectiveCamera(45,1,.035,150);
  ortho=new THREE.OrthographicCamera(-10,10,10,-10,.01,150);
  camera:THREE.Camera=this.perspective;
  controls:OrbitControls;
  parts:Part[]=[];
  model=new THREE.Group();
  protected exterior=new THREE.Group();
  private ground?:THREE.Mesh;
  private entranceFloor?:THREE.Mesh;
  mode:'overview'|'plan'|'room'|'eye'|'walk'='overview';
  selected='all';
  autoWalls=true;
  showCeiling=false;
  labels=true;
  hiddenWalls=0;
  states:Record<string,RoomState>={};
  project!:Project;
  finishes:Record<string,RoomFinish>={};
  private finishMaterials=new Map<string,THREE.MeshStandardMaterial>();
  private raw=new THREE.MeshStandardMaterial({color:0x999c96,roughness:.96,metalness:0});
  private clip=new THREE.Plane(new THREE.Vector3(0,-1,0),.22);
  private frame=0;
  private resize:ResizeObserver;
  private disposed=false;
  private moving?:{from:THREE.Vector3;to:THREE.Vector3;start:THREE.Vector3;target:THREE.Vector3;t:number};
  private viewFrozen=false;
  freezeView(frozen:boolean){
    if(frozen){this.moving=undefined;const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;}
    this.viewFrozen=frozen;this.controls.enabled=!frozen&&!this.roaming;
  }
  private lastCull=0;
  protected cutMaterials=new Set<THREE.Material>();
  private sceneBox=new THREE.Box3();
  private pmrem:THREE.PMREMGenerator;
  private env:THREE.WebGLRenderTarget;
  private keyHandler:(e:KeyboardEvent)=>void;
  private walk:WalkControls;
  private lastFrame=performance.now();
  private walkFloors:number[][][]=[];
  private walkWalls:THREE.Box3[]=[];
  private returnView?:{mode:'overview'|'plan'|'room'|'eye';camera:THREE.Camera;position:THREE.Vector3;rotation:THREE.Quaternion;target:THREE.Vector3;fov:number};
  onRoam=(_s:WalkStatus)=>{};
  get roaming(){return this.mode==='walk';}
  onStats=(_:{hidden:number;visible:number;triangles:number})=>{};
  constructor(private host:HTMLElement, readonly scheme:Scheme=SCHEMES[0]) {
    const canvas=document.createElement('canvas');
    const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});
    if(!gl)throw new Error('此设备未能启用 WebGL2，请使用支持 WebGL2 的浏览器并开启硬件加速。');
    this.renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=.95;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate=false;this.renderer.localClippingEnabled=true;
    canvas.setAttribute('aria-label','住宅三维模型；左键拖动旋转，中键或右键拖动平移，滚轮缩放');
    canvas.tabIndex=0;host.appendChild(canvas);
    this.scene.background=new THREE.Color('#eef0f3');
    this.pmrem=new THREE.PMREMGenerator(this.renderer);
    const roomEnv=new RoomEnvironment();this.env=this.pmrem.fromScene(roomEnv,.04);roomEnv.dispose();
    this.scene.environment=this.env.texture;this.scene.environmentIntensity=.45;
    this.scene.add(new THREE.HemisphereLight(0xf6f8ff,0x838072,1.3));
    const sun=new THREE.DirectionalLight(0xfff9ed,2.0);sun.position.set(-3,16,7);sun.target.position.set(4,0,-5);
    sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-14;sun.shadow.camera.right=14;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;sun.shadow.camera.far=40;sun.shadow.bias=-.0005;sun.shadow.normalBias=.025;
    this.scene.add(sun,sun.target);
    const fill=new THREE.DirectionalLight(0xe2eeff,.9);fill.position.set(10,10,-12);this.scene.add(fill);
    this.controls=new OrbitControls(this.perspective,canvas);
    this.controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.PAN};
    this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.maxPolarAngle=Math.PI*.495;
    this.controls.minDistance=.4;this.controls.maxDistance=40;this.controls.screenSpacePanning=true;
    this.controls.addEventListener('start',()=>{this.moving=undefined;});
    this.controls.addEventListener('change',()=>{this.lastCull=0;});
    this.resize=new ResizeObserver(()=>this.resizeCanvas());this.resize.observe(host);
    this.keyHandler=(e)=>{if(e.key==='Escape'&&!this.roaming)this.navigate('all');};
    canvas.addEventListener('keydown',this.keyHandler);
    this.walk=new WalkControls(canvas,this.perspective,(x,z)=>this.canWalkAt(x,z),s=>this.onRoam(s),()=>this.stopRoaming());
    this.animate();
  }
  async load(progress:(n:number)=>void) {
    // Re-read the template manifest on refresh/create. Layouts are user data;
    // model assets must follow the current template revision, not that snapshot.
    const response=await fetch(new URL(this.scheme.assets+'project.json',document.baseURI),{cache:'no-store'});if(!response.ok)throw new Error('模型说明文件加载失败。');
    this.project=await response.json();
    const modelUrl=new URL(this.scheme.assets+'home.glb',document.baseURI);
    modelUrl.searchParams.set('v',[this.project.version,this.project.revision??1,this.project.visualRevision??'',this.project.stats.bytes].join(':'));
    for(const r of this.project.rooms)this.states[r.id]={visible:true,decorated:this.project.defaultDecorated??true};
    const [gltf,scenery]=await Promise.all([
      new GLTFLoader().loadAsync(modelUrl.href,e=>progress(e.total?Math.min(99,Math.round(e.loaded/e.total*100)):30)),
      new GLTFLoader().loadAsync(new URL('assets/exterior.glb',document.baseURI).href)
    ]);
    this.model=gltf.scene;this.scene.add(this.model);this.model.updateMatrixWorld(true);
    this.model.traverse(obj=>{
      if(!(obj instanceof THREE.Mesh))return;
      let node:THREE.Object3D|null=obj;
      while(node && !node.userData['layer'])node=node.parent;
      const data=node?.userData??{};
      const layer=data['layer']??'decor';
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const m of materials){
        const standard=m as THREE.MeshStandardMaterial;
        if(standard.map)standard.map.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
        if(layer==='window'&&(standard.transparent||standard.name.includes('玻璃'))){
          standard.transparent=true;standard.opacity=.13;standard.depthWrite=false;
          if('transmission' in standard)(standard as THREE.MeshPhysicalMaterial).transmission=0;
          standard.side=THREE.DoubleSide;
        }
        if(layer==='wall')this.cutMaterials.add(m);
      }
      obj.castShadow=!['window','ceiling','shell-floor','finish'].includes(layer);obj.receiveShadow=true;
      if(layer==='wall'&&this.project.walls)this.assignWallFaces(obj,Array.from(data['rooms']??[data['room']]));
      if(layer==='ceiling')for(const m of materials)m.side=THREE.DoubleSide;
      this.parts.push({mesh:obj,room:data['room'],rooms:Array.from(data['rooms']??[data['room']]),layer,cutaway:data['cutaway']??'',box:new THREE.Box3().setFromObject(obj),original:obj.material,wallId:data['wallId']});
      if(layer==='finish'&&this.project.walls){
        const pos=obj.geometry.getAttribute('position'),uv:number[]=[];
        for(let i=0;i<pos.count;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(obj.matrixWorld);uv.push(v.x/1.2,v.z/1.2);}
        obj.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      }
    });
    this.sceneBox.setFromObject(this.model);
    this.exterior=scenery.scene;this.exterior.name='窗外树冠';this.exterior.userData['layer']='exterior';
    this.exterior.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      o.castShadow=false;o.receiveShadow=true;
      for(const m of Array.isArray(o.material)?o.material:[o.material])m.side=THREE.DoubleSide;
    });
    this.scene.add(this.exterior);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xe8ebe7,roughness:1}));
    ground.rotation.x=-Math.PI/2;ground.position.y=-.15;ground.receiveShadow=true;this.ground=ground;this.scene.add(ground);
    const approach=entranceApproach(this.scheme.entrance),[a,,b]=approach.floor;
    this.entranceFloor=new THREE.Mesh(new THREE.BoxGeometry(b[0]-a[0],.08,b[1]-a[1]),new THREE.MeshStandardMaterial({color:0xb3b5ad,roughness:1}));
    this.entranceFloor.name='入户门外漫游落脚区';this.entranceFloor.position.set((a[0]+b[0])/2,-.045,(a[1]+b[1])/2);this.entranceFloor.receiveShadow=true;this.scene.add(this.entranceFloor);
    this.applyStates();this.navigate('all',false);progress(100);
  }
  /** Assign each wall face to its adjacent room, so one room's paint stays on that side. */
  protected assignWallFaces(mesh:THREE.Mesh,roomIds:string[]){
    const geometry=mesh.geometry,pos=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),index=geometry.index;
    const original=Array.isArray(mesh.material)?mesh.material[0]:mesh.material,materials:THREE.Material[]=[],owners=new Map<string,number>();
    geometry.clearGroups();const count=index?index.count:pos.count,normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for(let i=0;i<count;i+=3){
      const point=new THREE.Vector3(),a=index?index.getX(i):i;
      for(let j=0;j<3;j++)point.add(new THREE.Vector3().fromBufferAttribute(pos,index?index.getX(i+j):i+j));
      point.divideScalar(3).applyMatrix4(mesh.matrixWorld);
      if(normal)point.addScaledVector(new THREE.Vector3().fromBufferAttribute(normal,a).applyNormalMatrix(normalMatrix),.045);
      const room=this.project.rooms.find(r=>roomIds.includes(r.id)&&inPolygon(point.x,point.z,r.polygon))?.id??roomIds[0];
      if(!owners.has(room)){const material=original.clone();material.userData={...material.userData,room};owners.set(room,materials.length);materials.push(material);this.cutMaterials.add(material);}
      geometry.addGroup(i,3,owners.get(room)!);
    }
    mesh.material=materials;
  }
  resizeCanvas() {
    const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;
    this.renderer.setSize(w,h);this.perspective.aspect=w/h;this.perspective.updateProjectionMatrix();
    this.updateOrtho(w/h);
  }
  private updateOrtho(aspect:number) {
    const base=this.project?.view?.span??16;
    const span=aspect<1?(base+1.5)/aspect:base;
    this.ortho.left=-span*aspect/2;this.ortho.right=span*aspect/2;this.ortho.top=span/2;this.ortho.bottom=-span/2;this.ortho.updateProjectionMatrix();
  }
  navigate(id:string,animated=true,eye=false) {
    if(!this.project)return;
    if(this.roaming)this.stopRoaming();
    this.selected=id;
    this.controls.enableRotate=id!=='plan';
    if(id==='plan'){
      this.mode='plan';this.camera=this.ortho;this.controls.object=this.ortho;
      this.ortho.up.set(0,0,-1);this.ortho.zoom=1;
      const ctr=this.project.view?new THREE.Vector3().fromArray(this.project.view.center):new THREE.Vector3(4.35,0,-5.6);ctr.y=0;
      this.ortho.position.set(ctr.x,26,ctr.z);this.controls.target.copy(ctr);this.ortho.lookAt(ctr);this.updateOrtho(this.host.clientWidth/this.host.clientHeight);
      this.moving=undefined;
    }else{
      this.camera=this.perspective;this.controls.object=this.perspective;
      this.perspective.up.set(0,1,0);
      this.mode=id==='all'?'overview':eye?'eye':'room';
      const r=this.project.rooms.find(x=>x.id===id);
      const target=r?new THREE.Vector3(...r.center as [number,number,number]):this.project.view?new THREE.Vector3().fromArray(this.project.view.center):new THREE.Vector3(4.2,.3,-5.6);
      let pos:THREE.Vector3;
      if(eye&&r){pos=new THREE.Vector3(...r.eye as [number,number,number]);target.fromArray(r.look);}
      else if(r){const b=r.bounds,size=Math.max(b[1]-b[0],b[3]-b[2]);pos=target.clone().add(new THREE.Vector3(-size*.45,Math.max(4,size*1.15),Math.max(3.6,size*1.1)));}
      else{pos=target.clone().add(new THREE.Vector3(-10,15,16));if(this.host.clientWidth/this.host.clientHeight<1)pos.sub(target).multiplyScalar(1.4).add(target);}
      this.perspective.fov=eye?65:45;this.perspective.updateProjectionMatrix();
      if(animated)this.moving={from:this.perspective.position.clone(),to:pos,start:this.controls.target.clone(),target,t:performance.now()};
      else{this.perspective.position.copy(pos);this.controls.target.copy(target);this.perspective.lookAt(target);this.moving=undefined;}
    }
    this.applyStates();this.lastCull=0;this.controls.update();
  }
  startRoaming():boolean {
    if(!this.project||this.roaming)return false;
    this.refreshWalkBounds();
    const {spawn,look}=entranceApproach(this.scheme.entrance);
    if(!this.canWalkAt(spawn.x,spawn.z))return false;
    this.moving=undefined;
    // Flush orbit damping before freezing it, so residual motion cannot affect walking.
    const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;
    this.returnView={mode:this.mode as 'overview'|'plan'|'room'|'eye',camera:this.camera,position:this.camera.position.clone(),rotation:this.camera.quaternion.clone(),target:this.controls.target.clone(),fov:this.perspective.fov};
    this.mode='walk';this.camera=this.perspective;this.controls.enabled=false;
    this.perspective.position.copy(spawn);this.perspective.position.y=EYE_HEIGHT;
    this.perspective.up.set(0,1,0);this.perspective.fov=70;this.perspective.updateProjectionMatrix();
    this.perspective.lookAt(look);
    this.applyStates();this.lastFrame=performance.now();this.walk.start();return true;
  }
  stopRoaming(){
    if(!this.roaming)return;
    const saved=this.returnView;this.returnView=undefined;
    this.mode=saved?.mode??'overview';this.walk.stop();
    if(saved){
      this.camera=saved.camera;this.camera.position.copy(saved.position);this.camera.quaternion.copy(saved.rotation);
      this.controls.object=this.camera;this.controls.target.copy(saved.target);this.perspective.fov=saved.fov;this.perspective.updateProjectionMatrix();
    }
    this.controls.enabled=true;this.controls.enableRotate=this.mode!=='plan';this.controls.update();this.applyStates();
  }
  lockRoamingMouse(){this.walk.lock();}
  private refreshWalkBounds(){
    this.walkFloors=this.project.rooms.filter(r=>this.states[r.id]?.visible).map(r=>r.polygon);
    this.walkFloors.push(entranceApproach(this.scheme.entrance).floor);
    this.walkWalls=this.parts.filter(p=>!p.disabled&&['wall','window'].includes(p.layer)&&p.rooms.some(r=>this.states[r]?.visible)).map(p=>p.box);
  }
  private canWalkAt(x:number,z:number){return onFloor(x,z,this.walkFloors)&&!blockedByWall(x,z,this.walkWalls);}
  applyStates() {
    // Window scenery is independent of room finishes, cutaway walls and furniture saves.
    this.exterior.visible=this.roaming;
    if(this.entranceFloor)this.entranceFloor.visible=this.roaming;
    const indoors=this.mode==='eye'||this.mode==='walk';
    if(this.ground)this.ground.position.y=indoors?-9.2:-.15;
    (this.scene.background as THREE.Color).set(indoors?'#e9edf3':'#eef0f3');
    for(const p of this.parts){
      const enabled=!p.disabled&&p.rooms.some(id=>this.states[id]?.visible);
      const decorated=this.states[p.room]?.decorated??true;
      let visible=enabled;
      if(['decor','finish','greenery'].includes(p.layer))visible&&=decorated;
      if(this.mode==='plan'&&['window','door','ceiling'].includes(p.layer))visible=false;
      if(!this.showCeiling && p.layer==='ceiling')visible=false;
      p.mesh.visible=visible;
      const mats=Array.isArray(p.original)?p.original:[p.original];
      if(p.layer==='wall'){
        const switched=mats.map(m=>{
          const rid=m.userData['room']??p.room;
          return (rid==='garden'||!this.states[rid]?.decorated)?this.raw:this.project.walls?this.finishMaterial('wall',(this.finishes[rid]??DEFAULT_FINISH).wall):m;
        });
        p.mesh.material=Array.isArray(p.original)?switched:switched[0];
      }
      if(p.layer==='finish'&&this.project.walls)p.mesh.material=this.finishMaterial('floor',(this.finishes[p.room]??DEFAULT_FINISH).floor);
    }
    for(const m of this.cutMaterials){m.clippingPlanes=this.mode==='plan'?[this.clip]:null;m.clipShadows=true;m.needsUpdate=true;}
    this.raw.clippingPlanes=this.mode==='plan'?[this.clip]:null;this.raw.clipShadows=true;this.raw.needsUpdate=true;
    this.lastCull=0;this.renderer.shadowMap.needsUpdate=true;
    if(this.roaming)this.refreshWalkBounds();
  }
  private finishMaterial(kind:'wall'|'floor',id:string){
    const key=kind+':'+id;let m=this.finishMaterials.get(key);if(m)return m;
    const preset=(kind==='wall'?WALL_COLORS:FLOOR_STYLES).find(v=>v.id===id)!;
    m=new THREE.MeshStandardMaterial({color:preset.color,roughness:.86});m.name=preset.name;
    if(kind==='wall')this.cutMaterials.add(m);
    else {
      const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;
      ctx.fillStyle=preset.color;ctx.fillRect(0,0,256,256);let seed=27;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      if(id.includes('oak')){
        for(let y=0;y<256;y+=32){ctx.fillStyle='rgba(60,34,8,'+(rnd()*.12)+')';ctx.fillRect(0,y,256,32);ctx.strokeStyle='#79563855';ctx.lineWidth=.6;ctx.strokeRect(0,y,256,32);ctx.beginPath();const x=rnd()*256;ctx.moveTo(x,y);ctx.lineTo(x,y+32);ctx.stroke();}
        for(let i=0;i<1500;i++){ctx.fillStyle='rgba(90,58,22,'+(rnd()*.07)+')';ctx.fillRect(rnd()*256,rnd()*256,rnd()*55,1);}
      }else if(id==='tile'){ctx.strokeStyle='#909493';ctx.lineWidth=1;ctx.strokeRect(0,0,128,128);ctx.strokeRect(128,0,128,128);ctx.strokeRect(0,128,128,128);ctx.strokeRect(128,128,128,128);}
      else for(let i=0;i<950;i++){ctx.fillStyle=['#b5b4aa','#ede9db','#9da6a4','#c0b096'][i%4];ctx.beginPath();ctx.ellipse(rnd()*256,rnd()*256,1+rnd()*2,1+rnd()*3,rnd()*3,0,7);ctx.fill();}
      const texture=new THREE.CanvasTexture(c);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;m.map=texture;m.color.set('#ffffff');
    }
    this.finishMaterials.set(key,m);return m;
  }
  setRoom(id:string,key:'visible'|'decorated',value:boolean){this.states[id][key]=value;this.applyStates();}
  setAllDecor(value:boolean){for(const s of Object.values(this.states))s.decorated=value;this.applyStates();}
  setAllVisible(){for(const s of Object.values(this.states))s.visible=true;this.applyStates();}
  setAuto(value:boolean){this.autoWalls=value;this.applyStates();}
  setCeiling(value:boolean){this.showCeiling=value;this.applyStates();}
  private cullWalls() {
    if(!this.project)return;
    // Reset using semantic state, not previous frame's visibility. Never accumulate hidden walls.
    const hidden=new Set<string>();
    if(this.autoWalls&&this.mode!=='plan'&&!this.roaming){
      // Re-evaluate the complete architectural set each frame. A hidden front wall must
      // continue to win, instead of exposing a second wall for removal on the next frame.
      const groups=new Map<string,THREE.Box3>();
      for(const p of this.parts){
        if(p.disabled||!p.cutaway||!['wall','window','door'].includes(p.layer)||!p.rooms.some(r=>this.states[r]?.visible))continue;
        const bounds=groups.get(p.cutaway)??new THREE.Box3();bounds.union(p.box);groups.set(p.cutaway,bounds);
      }
      const closest=nearestWallAlongView([...groups].map(([id,bounds])=>({id,bounds})),this.camera.position,this.controls.target);
      if(closest)hidden.add(closest);
    }
    let changed=false;let n=0;
    for(const p of this.parts){
      let vis=!p.disabled&&p.rooms.some(id=>this.states[id]?.visible);
      if(['decor','finish','greenery'].includes(p.layer))vis&&=this.states[p.room]?.decorated??true;
      if(this.mode==='plan'&&['window','door','ceiling'].includes(p.layer))vis=false;
      if(!this.showCeiling&&p.layer==='ceiling')vis=false;
      if(p.cutaway&&hidden.has(p.cutaway)){vis=false;if(p.layer==='wall')n++;}
      if(p.mesh.visible!==vis)changed=true;p.mesh.visible=vis;
    }
    this.hiddenWalls=n;
    if(changed)this.renderer.shadowMap.needsUpdate=true;
    this.onStats({hidden:n,visible:this.parts.filter(p=>p.mesh.visible).length,triangles:this.renderer.info.render.triangles});
  }
  private updatePins(){
    const w=this.host.clientWidth,h=this.host.clientHeight;
    for(const pin of this.host.parentElement!.querySelectorAll<HTMLElement>('.room-pin')){
      const r=this.project?.rooms.find(r=>r.id===pin.dataset['room']);if(!r)continue;
      const visible=this.labels&&this.states[r.id]?.visible&&(this.mode==='plan'||this.mode==='overview');
      const v=new THREE.Vector3(r.center[0],.32,r.center[2]).project(this.camera);
      pin.style.display=visible&&v.z<1?'block':'none';
      pin.style.transform='translate(-50%,-50%) translate('+((v.x*.5+.5)*w)+'px,'+((-v.y*.5+.5)*h)+'px)';
    }
  }
  private animate=()=>{
    if(this.disposed)return;
    this.frame=requestAnimationFrame(this.animate);
    const now=performance.now(),seconds=(now-this.lastFrame)/1000;this.lastFrame=now;
    if(this.moving){
      let t=Math.min(1,(performance.now()-this.moving.t)/650);t=t*t*(3-2*t);
      this.perspective.position.lerpVectors(this.moving.from,this.moving.to,t);this.controls.target.lerpVectors(this.moving.start,this.moving.target,t);
      if(t===1)this.moving=undefined;
    }
    if(this.roaming){
      this.walk.update(seconds);
      const facing=this.perspective.getWorldDirection(new THREE.Vector3());this.controls.target.copy(this.perspective.position).add(facing);
    }else if(!this.viewFrozen)this.controls.update();
    if(this.project&&performance.now()-this.lastCull>100){this.cullWalls();this.lastCull=performance.now();}
    this.renderer.render(this.scene,this.camera);this.updatePins();
  };
  screenshot(){this.renderer.render(this.scene,this.camera);const a=document.createElement('a');a.href=this.renderer.domElement.toDataURL('image/png');a.download='家的三维视图.png';a.click();}
  debug(){return {webgl2:this.renderer.getContext() instanceof WebGL2RenderingContext,mode:this.mode,selected:this.selected,hiddenWalls:this.hiddenWalls,showCeiling:this.showCeiling,walk:this.walk.debug(),exterior:{visible:this.exterior.visible,trees:this.exterior.children.filter(o=>o.userData['treeId']).length,groundHeight:this.ground?.position.y},direction:this.camera.getWorldDirection(new THREE.Vector3()).toArray(),states:this.states,parts:this.parts.map(p=>({room:p.room,layer:p.layer,cutaway:p.cutaway,visible:p.mesh.visible,invalidMaterialGroups:Array.isArray(p.mesh.material)&&p.mesh.geometry.groups.length===0,raw:(Array.isArray(p.mesh.material)?p.mesh.material:[p.mesh.material]).includes(this.raw)})),triangles:this.renderer.info.render.triangles,camera:this.camera.position.toArray(),target:this.controls.target.toArray()};}
  destroy(){
    this.disposed=true;this.walk.destroy();cancelAnimationFrame(this.frame);this.resize.disconnect();this.controls.dispose();this.renderer.domElement.removeEventListener('keydown',this.keyHandler);
    const mats=new Set([...this.parts.flatMap(p=>Array.isArray(p.original)?p.original:[p.original]),...this.finishMaterials.values(),...this.cutMaterials]);
    this.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);}});
    const textures=new Set<THREE.Texture>();for(const m of mats){for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);m.dispose();}
    for(const t of textures)t.dispose();this.raw.dispose();this.env.dispose();this.pmrem.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
}
