import { RAW_SCHEME, designScheme } from './schemes';
import type { Layout } from './layout';
import type { SaveStatus } from './scheme-store';
const KEY='home-simulator:raw-workspace:v1';
type Design={id:string;name:string;layout:Layout|null};
/** A standalone local workbench, explicitly separate from authenticated shared designs. */
export class LocalWorkspace {
 onChange=()=>{};writable=true;warning='';pendingCount=0;
 private designs:Design[]=[{id:RAW_SCHEME.id,name:RAW_SCHEME.name,layout:null}];
 constructor(){try{const d=JSON.parse(localStorage.getItem(KEY)||'null');if(Array.isArray(d)&&d.length&&d.every(x=>typeof x.id==='string'&&typeof x.name==='string'))this.designs=d;}catch{this.warning='本地存档无法读取，请导出JSON备份。';}}
 get schemes(){return this.designs.map(d=>designScheme(d.id,d.name,RAW_SCHEME.id));}
 layout(id:string){return structuredClone(this.designs.find(d=>d.id===id)?.layout??null);}
 status(_id:string):SaveStatus{return {state:this.warning?'error':'saved',message:this.warning||'本地工作台 · 自动保存于此浏览器'};}
 private persist(){try{localStorage.setItem(KEY,JSON.stringify(this.designs));this.warning='';}catch{this.warning='本地空间不足，请立即导出JSON备份。';}this.onChange();}
 save(id:string,layout:Layout){const d=this.designs.find(d=>d.id===id);if(d){d.layout=structuredClone(layout);this.persist();}}
 create(name:string,_templateId:string,layout:Layout|null){if(!name.trim()||name.length>60)throw new Error('请输入60字以内的方案名称。');const d={id:'local-'+crypto.randomUUID(),name:name.trim(),layout:structuredClone(layout)};this.designs.push(d);this.persist();return designScheme(d.id,d.name,RAW_SCHEME.id);}
 async refresh(){this.onChange();}
 async prepare(_id:string){}
 flush(){} retry(){this.persist();} destroy(){}
 async preserveConflict(_id:string,layout:Layout){return this.create('我的清水房副本',RAW_SCHEME.id,layout);}
}
