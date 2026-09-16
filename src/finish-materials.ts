import * as T from 'three';
import {FLOOR_STYLES,WALL_COLORS,type FinishPreset} from './finish-presets';
type Entry={material:T.MeshStandardMaterial;preset:FinishPreset;pending:Promise<void>;error:boolean};
/** Texture files are fetched only when a finish is applied. Presets share image data. */
export class FinishMaterials {
 private entries=new Map<string,Entry>();
 private images=new Map<string,Promise<T.Texture>>();
 private textures=new Set<T.Texture>();
 private disposed=false;
 constructor(private fail:(message:string)=>void,private anisotropy=4){}
 get(kind:'wall'|'floor',id:string){
  const key=kind+':'+id,old=this.entries.get(key);if(old)return old.material;
  const preset=(kind==='wall'?WALL_COLORS:FLOOR_STYLES).find(p=>p.id===id);
  if(!preset)throw Error('未知装修材质');
  const material=new T.MeshStandardMaterial({color:preset.color,roughness:.9});material.name=preset.name;
  material.userData['finishId']=id;material.userData['finishKind']=kind;
  const e:Entry={material,preset,error:false,pending:Promise.resolve()};this.entries.set(key,e);this.load(e);return material;
 }
 private image(path:string){
  let job=this.images.get(path);if(job)return job;
  job=new Promise<T.Texture>((resolve,reject)=>{
   let ended=false;const timer=setTimeout(()=>{ended=true;reject(Error('材质下载超时'));},25000);
   new T.TextureLoader().load(new URL(path,document.baseURI).href,texture=>{
    if(ended||this.disposed){texture.dispose();clearTimeout(timer);if(!ended)reject(Error('方案已切换'));return;}
    ended=true;clearTimeout(timer);this.textures.add(texture);resolve(texture);
   },undefined,()=>{if(!ended){ended=true;clearTimeout(timer);reject(Error('材质下载失败'));}});
  });
  this.images.set(path,job);void job.catch(()=>{if(this.images.get(path)===job)this.images.delete(path);});return job;
 }
 private load(e:Entry){
  e.error=false;
  e.pending=Promise.all(['color','normal','roughness'].map(n=>this.image(`materials/${e.preset.texture}/${n}.jpg`))).then(images=>{
   if(this.disposed)return;
   const maps=images.map((base,i)=>{const t=base.clone();t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.setScalar(1/e.preset.meters);t.colorSpace=i===0?T.SRGBColorSpace:T.NoColorSpace;t.anisotropy=this.anisotropy;t.needsUpdate=true;this.textures.add(t);return t;});
   [e.material.map,e.material.normalMap,e.material.roughnessMap]=maps;e.material.color.set(e.preset.tint??'#ffffff');e.material.roughness=1;e.material.normalScale.setScalar(e.preset.normal);e.material.needsUpdate=true;
  }).catch(()=>{e.error=true;if(!this.disposed)this.fail(`“${e.preset.name}”纹理加载失败，可点击“重试纹理”。`);});
 }
 retry(){for(const e of this.entries.values())if(e.error)this.load(e);}
 async ready(materials:Set<T.Material>){
  const used=[...this.entries.values()].filter(e=>materials.has(e.material));await Promise.all(used.map(e=>e.pending));
  if(used.some(e=>e.error))throw Error('有装修纹理未加载成功，请重试纹理后导出。');
 }
 debug(){return [...this.entries.values()].map(e=>({id:e.preset.id,kind:e.material.userData['finishKind'],ready:!!e.material.map,error:e.error,repeat:e.material.map?.repeat.toArray()}));}
 destroy(){this.disposed=true;for(const t of this.textures)t.dispose();for(const e of this.entries.values())e.material.dispose();this.images.clear();this.entries.clear();}
}
