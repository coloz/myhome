const fs=require('node:fs'),assert=require('node:assert/strict'),T=require('three'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {assignMetricWallUV}=require('../src/finish-uv.ts'),{validateFinishes}=require('../src/architecture.ts'),{WALL_COLORS,FLOOR_STYLES}=require('../src/finish-presets.ts');
assert.equal(WALL_COLORS.length,14);assert.equal(FLOOR_STYLES.length,12);
for(const p of [...WALL_COLORS,...FLOOR_STYLES]){assert(fs.existsSync('public/'+p.preview));for(const n of ['color','normal','roughness'])assert(fs.existsSync(`public/materials/${p.texture}/${n}.jpg`));}
for(const floor of FLOOR_STYLES)for(const wall of WALL_COLORS)assert.deepEqual(validateFinishes({living:{wall:wall.id,floor:floor.id}},['living']),{living:{wall:wall.id,floor:floor.id}});
assert.throws(()=>validateFinishes({living:{wall:'made-up',floor:'oak'}},['living']));
function measure(length,angle){const m=new T.Mesh(new T.BoxGeometry(length,3,.15));m.rotation.y=angle;m.position.set(3,1.5,4);m.updateMatrixWorld(true);assignMetricWallUV(m);const uv=m.geometry.getAttribute('uv'),pos=m.geometry.getAttribute('position'),n=m.geometry.getAttribute('normal');let min=Infinity,max=-Infinity;
 for(let i=0;i<pos.count;i++){if(n.getZ(i)>.9){min=Math.min(min,uv.getX(i));max=Math.max(max,uv.getX(i));assert(Math.abs(uv.getY(i)-(pos.getY(i)+1.5))<.00001);}}
 assert(Math.abs(max-min-length)<.00001,'wall texture width in metres');return m;
}
for(const angle of [0,.47,Math.PI/2])for(const width of [1,3,7])measure(width,angle);
console.log('26 finish presets validate; metric UVs preserve texture scale on rotated/resized walls.');
