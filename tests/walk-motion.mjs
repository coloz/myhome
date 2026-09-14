import assert from 'node:assert/strict';
import {Box3,Vector3} from 'three';
import {advanceWalk,onFloor,blockedByWall,EYE_HEIGHT,WALK_SPEED,entranceApproach} from '../src/walk-motion.ts';
const origin=()=>new Vector3(0,EYE_HEIGHT,0),anywhere=()=>true;
const travel=(forward,right,yaw=0)=>{const p=origin();for(let i=0;i<60;i++)advanceWalk(p,yaw,forward,right,1/60,anywhere);return p;};
assert.equal(EYE_HEIGHT,1.6);assert.equal(WALK_SPEED,2.8);
assert(Math.abs(travel(1,0).z+2.8)<1e-8);assert(Math.abs(travel(-1,0).z-2.8)<1e-8);
assert(Math.abs(travel(0,1).x-2.8)<1e-8);assert(Math.abs(travel(0,-1).x+2.8)<1e-8);
assert(Math.abs(travel(1,1).distanceTo(origin())-2.8)<1e-8,'Diagonal input changes walking speed');
assert(Math.abs(travel(1,0,Math.PI/2).x+2.8)<1e-8,'Movement does not follow yaw');
const floorA=[[0,0],[2,0],[2,2],[0,2]],floorB=[[2.1,0],[4,0],[4,2],[2.1,2]];
assert(onFloor(1,1,[floorA]));assert(onFloor(2.05,1,[floorA,floorB]),'Doorway slab seam blocks passage');assert(!onFloor(5,1,[floorA,floorB]));
const wall=new Box3(new Vector3(1,0,-20),new Vector3(1.15,3,20));
assert(blockedByWall(.9,0,[wall]));assert(!blockedByWall(.6,0,[wall]));
const lintel=new Box3(new Vector3(-1,2.3,-1),new Vector3(1,3,1));assert(!blockedByWall(0,0,[lintel]),'Overhead lintel blocks walking');
const p=origin();for(let i=0;i<200;i++)advanceWalk(p,0,1,1,1/30,(x,z)=>!blockedByWall(x,z,[wall]));assert(p.x<.841&&p.z<-2,'Wall sliding failed');
const stalled=origin();advanceWalk(stalled,0,1,0,10,anywhere);assert(stalled.distanceTo(origin())<=.141,'A delayed frame causes a large jump');
assert.equal(p.y,EYE_HEIGHT);
for(const entrance of [{center:[47.5/58.8,-408/58.8],width:73/58.8},{center:[61.5/47,-316/47],width:43/47}]){
 const approach=entranceApproach(entrance),[x,z]=entrance.center;
 assert.equal(approach.spawn.y,1.6);assert(approach.spawn.z<z);assert(approach.look.z>z);
 assert(onFloor(approach.spawn.x,approach.spawn.z,[approach.floor]));
 for(let depth=-1.05;depth<=.2;depth+=.01)assert(onFloor(x,z+depth,[approach.floor]),'Gap across entry threshold');
 assert(!onFloor(x+2,z-1,[approach.floor]),'Entry landing permits walking into the excluded public area');
}
console.log('PASS: walking direction, speed, diagonal input, floor boundaries, doorway gaps, wall sliding and frame clamping');
