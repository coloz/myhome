import {Component,ElementRef,ViewChild,input,signal,AfterViewInit,OnDestroy} from '@angular/core';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import type {CatalogItem} from './catalog-types';
import {loadFurnitureModel,disposeFurnitureModel} from './model-library';

@Component({selector:'furniture-preview',standalone:true,template:`<div #surface class="furniture-preview" aria-label="家具三维预览"></div><p class="preview-hint" aria-live="polite">{{status()}}</p>@if(failed()){<button class="library-details" (click)="load()">重试预览</button>}`})
export class FurniturePreview implements AfterViewInit,OnDestroy {
 @ViewChild('surface',{static:true}) surface!:ElementRef<HTMLDivElement>;
 item=input.required<CatalogItem>();status=signal('正在加载模型…');failed=signal(false);
 private renderer?:T.WebGLRenderer;private scene=new T.Scene();private camera=new T.PerspectiveCamera(38,1,.01,100);
 private controls?:OrbitControls;private resize?:ResizeObserver;private model?:T.Group;private environment?:T.WebGLRenderTarget;
 private floor?:T.Mesh;private light=new T.DirectionalLight(0xffffff,2);
 private closed=false;private revision=0;
 private render=()=>{if(!this.closed)this.renderer?.render(this.scene,this.camera);};
 ngAfterViewInit(){
  try{
   const host=this.surface.nativeElement;
   this.renderer=new T.WebGLRenderer({antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
   this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.85;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;host.appendChild(this.renderer.domElement);
   this.scene.background=new T.Color('#e2e5e7');this.scene.environmentIntensity=.3;this.scene.add(new T.HemisphereLight(0xffffff,0xb1a394,.65));
   this.light.castShadow=true;this.light.shadow.mapSize.set(1024,1024);this.light.shadow.bias=-.0002;this.scene.add(this.light,this.light.target);
   const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;room.dispose();pmrem.dispose();
   this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enablePan=false;this.controls.addEventListener('change',this.render);
   this.resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;this.renderer!.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.render();});this.resize.observe(host);
   void this.load();
  }catch{this.status.set('此设备暂时无法显示三维预览，可继续查看商品图片。');}
 }
 async load(){
  if(!this.renderer||this.closed)return;
  const revision=++this.revision;this.failed.set(false);this.status.set('正在加载模型…');
  try{
   const item=this.item();if(!item.model||item.retired)throw Error('模型已下架');const g=await loadFurnitureModel(item.model);
   if(this.closed||revision!==this.revision){disposeFurnitureModel(g);return;}
   if(this.model){this.scene.remove(this.model);disposeFurnitureModel(this.model);}
   this.model=g;this.scene.add(g);const box=new T.Box3().setFromObject(g),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
   const radius=size.length()*.5,distance=radius/Math.sin(T.MathUtils.degToRad(this.camera.fov/2))*1.08;
   this.light.shadow.normalBias=radius*.025;
   if(this.floor){this.scene.remove(this.floor);disposeFurnitureModel(this.floor);}
   this.floor=new T.Mesh(new T.PlaneGeometry(radius*12,radius*12),new T.ShadowMaterial({opacity:.20}));this.floor.rotation.x=-Math.PI/2;this.floor.position.y=box.min.y-.004;this.floor.receiveShadow=true;this.scene.add(this.floor);
   this.light.position.copy(center).add(new T.Vector3(radius*2,radius*4,radius*3));this.light.target.position.copy(center);const shadow=this.light.shadow.camera;shadow.left=shadow.bottom=-radius*2;shadow.right=shadow.top=radius*2;shadow.near=.01;shadow.far=radius*12;shadow.updateProjectionMatrix();
   this.camera.position.copy(center).add(new T.Vector3(.85,.5,1.35).normalize().multiplyScalar(distance));this.camera.far=Math.max(100,distance*10);this.camera.updateProjectionMatrix();
   this.controls!.target.copy(center);this.controls!.minDistance=radius*.6;this.controls!.maxDistance=distance*3;this.controls!.update();this.render();
   this.status.set('拖动旋转 · 滚轮缩放');
  }catch{if(!this.closed&&revision===this.revision){this.failed.set(true);this.status.set('模型预览加载失败，请重试。');}}
 }
 ngOnDestroy(){this.closed=true;this.revision++;this.resize?.disconnect();this.controls?.dispose();if(this.model)disposeFurnitureModel(this.model);if(this.floor)disposeFurnitureModel(this.floor);this.light.shadow.map?.dispose();this.environment?.dispose();this.renderer?.dispose();this.renderer?.forceContextLoss();this.renderer?.domElement.remove();}
}
