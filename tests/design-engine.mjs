import test from 'node:test';
import assert from 'node:assert/strict';
import { context } from '../mcp/design-store.mjs';
import { DESIGN_SCENARIOS, generateDesign, analyzeDesign, validateDesign, validateBrief, roomArea } from '../src/design-engine.ts';
const {project,catalog}=context(),brief=DESIGN_SCENARIOS[0];
const create=()=>generateDesign(project,catalog,brief,'test-family');
const report=d=>analyzeDesign(project,catalog,d.layout,d.brief,d.roomUses);
test('three layouts preserve structure and pass placement checks; estimates reconcile',()=>{
  for(const b of DESIGN_SCENARIOS){const d=generateDesign(project,catalog,b,'test-'+b.scenario);assert.deepEqual(d.layout.walls,project.walls);assert.equal(validateDesign(d,project,catalog).id,d.id);const r=report(d);assert.equal(r.issues.filter(i=>i.severity==='error'||i.code==='door').length,0);assert.equal(r.total,r.costs.reduce((sum,c)=>sum+c.amount,0)+r.reserve);assert.equal(r.balance,r.budget-r.total);assert.equal(r.rooms.length,9);assert(r.area>90&&r.area<120);}
  assert.equal(roomArea([[0,0],[4,0],[4,3],[0,3]]),12);
});
test('concave boundary, rotation, collision, walls, doors and vertical stacking',()=>{
  const d=create(),e=d.layout.entities[0];e.position=[-20,0,0];assert(report(d).issues.some(i=>i.code==='outside'));
  const a=create(),b=structuredClone(a.layout.entities[0]);b.id='overlap';a.layout.entities.push(b);assert(report(a).issues.some(i=>i.code==='overlap'));b.position[1]=2;assert(!report(a).issues.some(i=>i.code==='overlap'&&i.entityIds.includes(b.id)));
  const c=create();c.layout.entities[0].position=[7,0,-2.4];assert(report(c).issues.some(i=>i.code==='wall'));
  const f=create();f.layout.entities[8].position=[1,0,-6.3];assert(report(f).issues.some(i=>i.code==='door'));
  const g=create();g.layout.entities[1].position=[2,0,-4.9];g.layout.entities[1].rotation=Math.PI/4;assert(report(g).issues.some(i=>i.code==='outside'));
});
test('deleted items excluded; hidden rooms retain costs; unknown dimensions disclosed',()=>{
  const d=create(),before=report(d);for(const r of Object.values(d.layout.rooms))r.visible=false;assert.equal(report(d).total,before.total);
  d.layout.entities[0].deleted=true;assert.equal(report(d).furnitureCount,before.furnitureCount-1);assert(report(d).total<before.total);
  d.layout.entities[1].catalogId='unknown';assert.equal(report(d).unmeasured,1);assert(report(d).issues.some(i=>i.code==='unmeasured'));
});
test('reject malformed, stale, protected geometry and non-finite inputs',()=>{
  for(const mutate of [d=>d.layout.entities.push(d.layout.entities[0]),d=>d.layout.entities[0].position[0]=NaN,d=>d.layout.entities[0].catalogId='bad',d=>d.layout.walls[0].a[0]+=1,d=>d.layout.modelRevision=1,d=>d.id='../escape',d=>d.brief.budget=-1,d=>d.layout.finishes.master.floor='ice']){const d=create();mutate(d);assert.throws(()=>validateDesign(d,project,catalog));}
  assert.throws(()=>validateBrief({...brief,clearance:Infinity}));
});
