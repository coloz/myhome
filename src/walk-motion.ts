import { Box3, Vector3 } from 'three';

export const EYE_HEIGHT=1.60;
export const WALK_SPEED=2.8;
export type Entrance={center:[number,number];width:number};
export function entranceApproach(entrance:Entrance){
 const [x,z]=entrance.center,half=entrance.width/2+.3;
 return {spawn:new Vector3(x,EYE_HEIGHT,z-1.05),look:new Vector3(x,EYE_HEIGHT,z+.65),
  floor:[[x-half,z-1.8],[x+half,z-1.8],[x+half,z+.35],[x-half,z+.35]]};
}
export function inPolygon(x:number,z:number,poly:number[][]):boolean {
 let yes=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const [xi,zi]=poly[i],[xj,zj]=poly[j];
  if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)yes=!yes;
 }
 return yes;
}
export function onFloor(x:number,z:number,polygons:number[][][]):boolean {
 return polygons.some(poly=>inPolygon(x,z,poly)||poly.some(([ax,az],i)=>{
  const [bx,bz]=poly[(i+1)%poly.length],dx=bx-ax,dz=bz-az;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
  // Bridge small gaps between separately exported room slabs at door openings.
  return Math.hypot(x-ax-t*dx,z-az-t*dz)<=.12;
 }));
}
export function blockedByWall(x:number,z:number,boxes:Box3[],radius=.16):boolean {
 return boxes.some(b=>{
  if(b.max.y<.25||b.min.y>EYE_HEIGHT+.1)return false;
  const dx=x-Math.max(b.min.x,Math.min(b.max.x,x)),dz=z-Math.max(b.min.z,Math.min(b.max.z,z));
  return dx*dx+dz*dz<radius*radius;
 });
}
export function advanceWalk(position:Vector3,yaw:number,forward:number,right:number,seconds:number,canStand:(x:number,z:number)=>boolean){
 const n=Math.hypot(forward,right);if(!n)return;
 const distance=Math.min(Math.max(seconds,0),.05)*WALK_SPEED/n;
 const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*right)*distance;
 const dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*right)*distance;
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.035));
 for(let i=0;i<steps;i++){
  if(canStand(position.x+dx/steps,position.z))position.x+=dx/steps;
  if(canStand(position.x,position.z+dz/steps))position.z+=dz/steps;
 }
 position.y=EYE_HEIGHT;
}
