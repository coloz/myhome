import * as T from 'three';
/** Project in metres, so walls of different lengths and opening fragments share texture scale. */
export function assignMetricWallUV(mesh:T.Mesh){
 const old=mesh.geometry;if(old.index){mesh.geometry=old.toNonIndexed();old.dispose();}
 const g=mesh.geometry,p=g.getAttribute('position'),normal=g.getAttribute('normal'),uv:number[]=[];
 const nm=new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
 for(let i=0;i<p.count;i+=3){
  const n=new T.Vector3().fromBufferAttribute(normal,i).applyNormalMatrix(nm);
  const horizontal=new T.Vector2(n.z,-n.x).normalize();
  for(let j=0;j<3;j++){
   const v=new T.Vector3().fromBufferAttribute(p,i+j).applyMatrix4(mesh.matrixWorld);
   uv.push(Math.abs(n.y)>.8?v.x:v.x*horizontal.x+v.z*horizontal.y,Math.abs(n.y)>.8?v.z:v.y);
  }
 }
 g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
}
