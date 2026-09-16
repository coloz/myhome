import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Cache files rather than live scenes. Every instance owns its materials and
// geometry; disposing/recolouring a placed object cannot corrupt cached assets.
const cache=new Map<string,ArrayBuffer>();let cacheBytes=0;
const MAX_BYTES=48*1024*1024,MAX_ENTRIES=24;
const pending=new Map<string,Promise<ArrayBuffer>>();
let active=0;const queue:Array<()=>void>=[];
async function slot(){if(active<3){active++;return;}await new Promise<void>(resolve=>queue.push(resolve));}
function release(){const next=queue.shift();if(next)next();else active--;}
async function file(url:string):Promise<ArrayBuffer>{
 const hit=cache.get(url);if(hit){cache.delete(url);cache.set(url,hit);return hit;}
 const inflight=pending.get(url);if(inflight)return inflight;
 const request=(async()=>{await slot();try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
   const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error('模型下载失败');
   if(Number(r.headers.get('Content-Length'))>20*1024*1024)throw Error('模型文件过大');
   const data=await r.arrayBuffer();if(data.byteLength<12||data.byteLength>20*1024*1024||new DataView(data).getUint32(0,true)!==0x46546c67)throw Error('无效模型文件');
   cache.set(url,data);cacheBytes+=data.byteLength;
   while(cacheBytes>MAX_BYTES||cache.size>MAX_ENTRIES){const key=cache.keys().next().value!;cacheBytes-=cache.get(key)!.byteLength;cache.delete(key);}
   return data;
  }finally{clearTimeout(timer);}
 }finally{release();pending.delete(url);}})();pending.set(url,request);return request;
}
export async function loadFurnitureModel(url:string):Promise<T.Group>{
 const data=await file(url);const gltf=await new GLTFLoader().parseAsync(data.slice(0),'');
 gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});return gltf.scene;
}
export function disposeFurnitureModel(g:T.Object3D){
 const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
 g.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v);}}});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();
}
export function libraryCacheStats(){return {entries:cache.size,bytes:cacheBytes,active,queued:queue.length};}
