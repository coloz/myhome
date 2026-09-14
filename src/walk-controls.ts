import { Euler, PerspectiveCamera } from 'three';
import { advanceWalk } from './walk-motion';

export type WalkStatus={active:boolean;locked:boolean;message:string};
export class WalkControls {
 active=false;locked=false;
 private keys=new Set<string>();
 private angles=new Euler(0,0,0,'YXZ');
 private abort=new AbortController();
 private drag?:{x:number;y:number;id:number};
 private message='';
 constructor(private canvas:HTMLCanvasElement,private camera:PerspectiveCamera,
  private canStand:(x:number,z:number)=>boolean,private changed:(s:WalkStatus)=>void,private exit:()=>void){
  const signal=this.abort.signal;
  document.addEventListener('keydown',e=>{
   if(!this.active)return;
   if(e.key==='Escape'){e.preventDefault();this.exit();return;}
   const el=e.target as HTMLElement;
   if(el.matches('input,select,textarea')||el.isContentEditable||e.ctrlKey||e.metaKey||e.altKey)return;
   if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();this.keys.add(e.code);}
  },{signal});
  document.addEventListener('keyup',e=>this.keys.delete(e.code),{signal});
  window.addEventListener('blur',()=>this.clearInput(),{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clearInput();},{signal});
  document.addEventListener('focusin',e=>{if(e.target!==canvas)this.clearInput();},{signal});
  document.addEventListener('pointerlockchange',()=>{
   const was=this.locked;this.locked=document.pointerLockElement===canvas;
   if(!this.active){if(this.locked)document.exitPointerLock();return;}
   if(was&&!this.locked){this.exit();return;}
   this.message='';this.report();
  },{signal});
  document.addEventListener('pointerlockerror',()=>this.lockFailed(),{signal});
  document.addEventListener('mousemove',e=>{if(this.active&&this.locked)this.turn(e.movementX,e.movementY);},{signal});
  canvas.addEventListener('pointerdown',e=>{
   if(!this.active||this.locked||e.button!==0)return;
   canvas.focus();this.drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);e.preventDefault();
  },{signal});
  canvas.addEventListener('pointermove',e=>{
   if(!this.active||this.locked||!this.drag)return;
   this.turn(e.clientX-this.drag.x,e.clientY-this.drag.y);this.drag.x=e.clientX;this.drag.y=e.clientY;
  },{signal});
  for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>this.endDrag(),{signal});
 }
 start(){this.active=true;this.clearInput();this.angles.setFromQuaternion(this.camera.quaternion,'YXZ');this.canvas.focus();this.report();this.lock();}
 lock(){
  if(!this.active)return;this.canvas.focus();
  if(!this.canvas.requestPointerLock){this.lockFailed();return;}
  try{const pending=this.canvas.requestPointerLock() as Promise<void>|undefined;pending?.catch(()=>this.lockFailed());}catch{this.lockFailed();}
 }
 private lockFailed(){if(!this.active)return;this.message='鼠标未锁定：按住左键拖动转向，WASD 移动。';this.report();}
 private report(){this.changed({active:this.active,locked:this.locked,message:this.message});}
 private endDrag(){if(this.drag&&this.canvas.hasPointerCapture(this.drag.id))this.canvas.releasePointerCapture(this.drag.id);this.drag=undefined;}
 private clearInput(){this.keys.clear();this.endDrag();}
 private turn(dx:number,dy:number){
  this.angles.y-=dx*.0022;this.angles.x=Math.max(-Math.PI*.47,Math.min(Math.PI*.47,this.angles.x-dy*.0022));
  this.camera.quaternion.setFromEuler(this.angles);
 }
 update(seconds:number){
  if(!this.active)return;
  advanceWalk(this.camera.position,this.angles.y,Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS')),
   Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA')),seconds,this.canStand);
 }
 stop(){this.active=false;this.clearInput();if(document.pointerLockElement===this.canvas)document.exitPointerLock();this.locked=false;this.message='';this.report();}
 debug(){return {active:this.active,locked:this.locked,keys:[...this.keys],yaw:this.angles.y,pitch:this.angles.x};}
 destroy(){this.abort.abort();this.stop();}
}
