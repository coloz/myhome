import * as T from 'three';
import type {CatalogItem} from './catalog-types';
export type {CatalogItem} from './catalog-types';

export const CATALOG:CatalogItem[]=[];
const byId=new Map<string,CatalogItem>();
let loading:Promise<void>|undefined;
export function catalogItem(id?:string){return id?byId.get(id):undefined;}
export function loadCatalog(){
 return loading??=fetch('library/catalog.v1.json').then(r=>{if(!r.ok)throw Error('家具库暂时无法加载，请重试');return r.json();}).then(data=>{
  if(data.version!==2||!Array.isArray(data.items)||!Array.isArray(data.retired)||data.items.length+data.retired.length>15000)throw Error('家具库格式不正确');
  const items:CatalogItem[]=data.items,retired:CatalogItem[]=data.retired;
  const ids=new Set<string>();
  for(const s of [...items,...retired]){
   if(!s.id||ids.has(s.id)||!s.name)throw Error('家具库条目校验失败');ids.add(s.id);
  }
  for(const s of items)if(s.retired||!s.dimensions||s.dimensions.length!==3||s.dimensions.some(v=>!Number.isFinite(v)||v<=0||v>10)||!s.typeTags?.length||!s.styleTags?.length||!s.quality||!s.model||!/^library\/models\/[a-zA-Z0-9_-]+\.glb$/.test(s.model))throw Error('家具必须使用审核通过的完整模型');
  for(const s of retired)if(!s.retired||s.model)throw Error('下架记录不能包含模型');
  CATALOG.splice(0,CATALOG.length,...items);byId.clear();for(const s of [...items,...retired])byId.set(s.id,s);
 }).catch(e=>{loading=undefined;throw e;});
}
export function visibleCatalog(){return [...CATALOG];}
export function makeFurniture(id:string):T.Group {
 const spec=catalogItem(id);if(!spec)throw Error('未知家具样式');
 // Keep coordinates for replacement; never render substitute geometry.
 const g=new T.Group();g.userData[spec.retired?'modelRetired':'modelPending']=true;return g;
}
