import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { nearestWallAlongView } from '../src/wall-visibility.ts';

const v=(x,y,z)=>new Vector3(x,y,z);
const wall=(id,z,x=0)=>({id,bounds:new Box3(v(x-2,0,z-.1),v(x+2,3,z+.1))});
const walls=[wall('far',4),wall('near',8)];
assert.equal(nearestWallAlongView(walls,v(0,2,12),v(0,1,0)),'near','Only the front wall may be removed');
assert.equal(nearestWallAlongView(walls,v(0,15,12),v(0,0,0)),'near','Elevated view must keep the same nearest facade');
assert.equal(nearestWallAlongView(walls,v(0,2,0),v(0,1,12)),'far','Turning around must restore the old wall and choose the new front wall');
assert.equal(nearestWallAlongView([wall('off-axis',10,6),...walls],v(0,2,12),v(0,1,0)),'near','A nearer wall outside the view axis must stay visible');
assert.equal(nearestWallAlongView(walls,v(0,2,12),v(0,1,10)),null,'Walls behind the focus must remain visible');
assert.equal(nearestWallAlongView(walls,v(0,10,6),v(0,0,6)),null,'A vertical plan view needs no facade cutaway');
assert.equal(nearestWallAlongView(walls,v(0,1,8),v(0,1,0)),'near','A camera intersecting the wall must hide that wall first');
console.log('PASS: 7 nearest-wall geometry regressions');
