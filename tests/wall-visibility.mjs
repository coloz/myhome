import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { facadeCutawayGroup, nearestWallAlongView } from '../src/wall-visibility.ts';

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

for(const ids of [['master-south','master-curve'],['east-bedroom-north','bed-curve']]){
 const group=facadeCutawayGroup(ids[0]);assert.equal(facadeCutawayGroup(ids[1]),group);
 const facade=[wall(group,8),wall(group,7,3),wall('rear',4)];
 assert.equal(nearestWallAlongView(facade,v(0,2,12),v(0,1,0)),group);
 assert.equal(nearestWallAlongView(facade,v(3,2,12),v(3,1,0)),group,'Looking at the corner selects the same facade');
}
for(const id of ['living-south','living-south:solid:0.000:0.500','master-south:solid:0.000:0.150','master-east','east-bedroom-east','garden-round'])assert.equal(facadeCutawayGroup(id),id);
for(const name of ['主卧南落地窗 横框','主卧弧角落地窗3 窗上梁','B主卧南落地窗 横框','B主卧弧窗2 横框'])assert.equal(facadeCutawayGroup('numbered-wall',name),'master-south-facade');
assert.equal(facadeCutawayGroup('numbered-wall','主卧东实墙'),'numbered-wall');
console.log('PASS: Continuous bedroom facades are grouped, with solid returns and other walls kept separate');
