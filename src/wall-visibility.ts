import { Box3, Ray, Vector3 } from 'three';

export type WallOccluder = {id:string;bounds:Box3};

/** Select one front wall on the current view axis, without peeling further walls away. */
export function nearestWallAlongView(walls:WallOccluder[],camera:Vector3,target:Vector3):string|null {
  // Use the plan projection for elevated views, so looking over a lintel still selects its facade.
  const origin=new Vector3(camera.x,0,camera.z);
  const direction=new Vector3(target.x-camera.x,0,target.z-camera.z);
  const focusDistance=direction.length();
  if(focusDistance<.001)return null;
  const ray=new Ray(origin,direction.normalize()),hit=new Vector3();
  let closest=focusDistance-.05,selected:string|null=null;
  for(const wall of walls){
    if(!wall.id||wall.bounds.isEmpty())continue;
    const footprint=wall.bounds.clone();footprint.min.y=-1;footprint.max.y=1;
    if(!ray.intersectBox(footprint,hit))continue;
    const distance=footprint.containsPoint(origin)?0:origin.distanceTo(hit);
    if(distance<closest){closest=distance;selected=wall.id;}
  }
  return selected;
}
