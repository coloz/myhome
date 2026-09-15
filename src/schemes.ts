import type { Entrance } from './walk-motion';
export type Scheme = {id:string;name:string;templateId?:string;assets:string;storageKey:string;plan:string;note:string;entrance:Entrance};
export const SCHEMES:Scheme[] = [
 {id:'original',name:'方案一 · 原方案',assets:'assets/',storageKey:'home-simulator:2026-09-14:v1',plan:'assets/latest-plan.png',note:'光厅仅布置可移动盆栽，保留原有空间。',entrance:{center:[(277.5-230)/58.8,(288-696)/58.8],width:73/58.8}},
 {id:'alternative',name:'方案二 · 新户型',assets:'assets/scheme-b/',storageKey:'home-simulator:scheme-b:2026-09-14:v2',plan:'assets/scheme-b/plan.png',note:'仅设计户内空间，不包含电梯间、楼梯间和入户光厅。',entrance:{center:[(261.5-200)/47,(233-549)/47],width:43/47}}
];
export const RAW_SCHEME:Scheme={id:'raw-shell',name:'原始户型 · 清水房',assets:'assets/raw-shell/',storageKey:'home-simulator:raw-shell:2026-09-15:v1',plan:'assets/raw-shell/plan.jpg',note:'层高3m。电梯、楼梯间不建模；光厅护栏暂按1.2m。灰色内隔墙可编辑，黑色实墙和外围墙锁定。',entrance:{center:[.97,-6.9],width:1.2}};

/** A saved design references a fixed floor-plan template; it never changes asset URLs. */
export function designScheme(id:string,name:string,templateId:string):Scheme {
 const template=[...SCHEMES,RAW_SCHEME].find(s=>s.id===templateId);
 if(!template)throw new Error('方案使用了尚不支持的户型。');
 return {...template,id,name,templateId,storageKey:[...SCHEMES,RAW_SCHEME].find(s=>s.id===id)?.storageKey??'home-simulator:design:'+id};
}
