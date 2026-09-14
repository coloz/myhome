import type { Entrance } from './walk-motion';
export type Scheme = {id:string;name:string;assets:string;storageKey:string;plan:string;note:string;entrance:Entrance};
export const SCHEMES:Scheme[] = [
 {id:'original',name:'方案一 · 原方案',assets:'assets/',storageKey:'home-simulator:2026-09-14:v1',plan:'assets/latest-plan.png',note:'光厅仅布置可移动盆栽，保留原有空间。',entrance:{center:[(277.5-230)/58.8,(288-696)/58.8],width:73/58.8}},
 {id:'alternative',name:'方案二 · 新户型',assets:'assets/scheme-b/',storageKey:'home-simulator:scheme-b:2026-09-14:v2',plan:'assets/scheme-b/plan.png',note:'仅设计户内空间，不包含电梯间、楼梯间和入户光厅。',entrance:{center:[(261.5-200)/47,(233-549)/47],width:43/47}}
];
