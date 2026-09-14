export type SavedEntity={id:string;sourceId?:string;catalogId?:string;room:string;position:number[];rotation:number;scale:number;deleted:boolean;color?:string};
export type Layout={format:'home-simulator';version:1|2;modelVersion:string;modelRevision?:number;entities:SavedEntity[];rooms:Record<string,{visible:boolean;decorated:boolean}>};
export type ModelLayoutUpdate={fromRevision:number;previousOriginalIds:string[];additions:string[];previousPositions:Record<string,number[]>};
export type LegacyEntity={id:string;name:string;room:string;position:number[]};
export type AssemblyDefinition={id:string;name:string;room:string;legacyIds:string[];memberNames:string[];sourceCount:number};

/** Add explicitly introduced furniture without replacing a user's existing edits. */
export function upgradeModelLayout(data:Layout,initial:Layout,update?:ModelLayoutUpdate):Layout {
  const previous=data.modelRevision??1,current=initial.modelRevision??1;
  if(!Number.isInteger(previous)||previous<1||previous>current)throw new Error('方案的模型修订版本不受支持。');
  if(previous===current)return data;
  if(!update||previous!==update.fromRevision)throw new Error('缺少模型修订迁移信息。');
  const ids=new Set(data.entities.map(e=>e.id));
  if(update.previousOriginalIds.some(id=>!ids.has(id)))throw new Error('方案缺少原始家具记录。');
  const result=structuredClone(data),defaults=new Map(initial.entities.map(e=>[e.id,e]));
  for(const id of update.additions){
    const base=defaults.get(id);if(!base)throw new Error('模型修订缺少新增家具。');
    if(!ids.has(id))result.entities.push(structuredClone(base));
  }
  for(const e of result.entities){
    const old=update.previousPositions[e.id],base=defaults.get(e.id);
    // Only move untouched defaults; a user's deliberate placement takes precedence.
    if(old&&base&&!e.deleted&&Math.abs(e.rotation)<.00001&&Math.abs(e.scale-1)<.00001&&e.position.every((v,i)=>Math.abs(v-old[i])<.0001))e.position=[...base.position];
  }
  result.modelRevision=current;return result;
}

/** Reapply a legacy part's world-space delta to the complete, newly assembled object. */
export function migrateLegacyLayout(data:Layout,assemblies:AssemblyDefinition[],legacy:LegacyEntity[],bases:Map<string,number[]>):Layout {
  if(data.version!==1)return data;
  const saved=new Map(data.entities.map(e=>[e.id,e])),old=new Map(legacy.map(e=>[e.id,e]));
  const moved=(s:SavedEntity,b:LegacyEntity)=>s.deleted||Math.abs(s.rotation)>.00001||Math.abs(s.scale-1)>.00001||s.position.some((v,i)=>Math.abs(v-b.position[i])>.0001);
  const convert=(s:SavedEntity,b:LegacyEntity,a:AssemblyDefinition,id:string,sourceId?:string):SavedEntity=>{
    const target=bases.get(a.id)!;
    const [dx,dy,dz]=target.map((v,i)=>(v-b.position[i])*s.scale),c=Math.cos(s.rotation),sn=Math.sin(s.rotation);
    return {id,sourceId,room:s.room===b.room?a.room:s.room,
      position:[s.position[0]+c*dx+sn*dz,s.position[1]+dy,s.position[2]-sn*dx+c*dz],
      rotation:s.rotation,scale:s.scale,deleted:s.deleted,color:s.color};
  };
  const entities:SavedEntity[]=assemblies.map(a=>{
    const candidates=a.legacyIds.map(id=>saved.get(id)!);
    // Body-first ordering is supplied by the model; an edited child still moves the whole item.
    const anchor=candidates.find(s=>moved(s,old.get(s.id)!))??candidates.find(s=>s.color)??candidates[0];
    return convert(anchor,old.get(anchor.id)!,a,a.id);
  });
  for(const state of data.entities){
    if(old.has(state.id))continue;
    if(state.sourceId){
      const source=old.get(state.sourceId)!;
      const owners=assemblies.filter(a=>a.legacyIds.includes(state.sourceId!));
      for(let i=0;i<owners.length;i++)entities.push(convert(state,source,owners[i],i?state.id+'-part-'+i:state.id,owners[i].id));
    }else entities.push(structuredClone(state));
  }
  return {...data,version:2,entities};
}
