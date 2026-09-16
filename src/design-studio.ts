import { Component, ElementRef, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CATALOG } from './catalog';
import type { Layout } from './layout';
import type { Project } from './viewer';
import { DESIGN_SCENARIOS, analyzeDesign, generateDesign, validateDesign, type DesignBrief, type DesignDocument, type DesignReport } from './design-engine';

@Component({selector:'design-studio',standalone:true,templateUrl:'./design-studio.html',styleUrl:'./design-studio.css'})
export class DesignStudio {
  @Input({required:true}) currentLayout!:Layout;
  @Input({required:true}) currentProject!:Project;
  @Input() busy=false;
  @Output() closeStudio=new EventEmitter<void>();
  @Output() applyDesign=new EventEmitter<DesignDocument>();
  scenarios=DESIGN_SCENARIOS;
  brief=signal<DesignBrief>(structuredClone(DESIGN_SCENARIOS[0]));
  document=signal<DesignDocument|null>(null);report=signal<DesignReport|null>(null);
  comparison=signal<{brief:DesignBrief;report:DesignReport}[]>([]);
  error=signal('');loading=signal(false);current=signal(false);
  remote=signal<{id:string;name:string}[]>([]);private remoteBase='';
  private project?:Project;
  private element=inject<ElementRef<HTMLElement>>(ElementRef);
  private reveal(){requestAnimationFrame(()=>this.element.nativeElement.querySelector('.studio-body')?.scrollTo({top:0}));}
  private async rawProject(){
    if(!this.project){const r=await fetch('assets/raw-shell/project.json');if(!r.ok)throw Error('无法读取清水房户型');this.project=await r.json();}
    return this.project!;
  }
  choose(b:DesignBrief){this.brief.set(structuredClone(b));this.document.set(null);this.report.set(null);this.current.set(false);this.error.set('');}
  field(key:keyof DesignBrief,event:Event){const value=(event.target as HTMLInputElement).value;this.brief.update(b=>({...b,[key]:typeof b[key]==='number'?Number(value):value}));this.document.set(null);this.report.set(null);this.current.set(false);}
  async preview(){this.loading.set(true);this.error.set('');try{const project=await this.rawProject();const d=generateDesign(project,CATALOG,this.brief(),'preview');this.document.set(d);this.report.set(analyzeDesign(project,CATALOG,d.layout,d.brief,d.roomUses));this.current.set(false);this.reveal();}catch(e){this.error.set((e as Error).message);}finally{this.loading.set(false);}}
  inspectCurrent(){this.error.set('');try{const b=this.currentLayout.design?.brief??this.brief();this.report.set(analyzeDesign(this.currentProject,CATALOG,this.currentLayout,b,this.currentLayout.design?.roomUses));this.document.set(null);this.current.set(true);}catch(e){this.error.set((e as Error).message);}}
  async compare(){this.loading.set(true);try{const p=await this.rawProject();this.comparison.set(this.scenarios.map(b=>{const d=generateDesign(p,CATALOG,b,'compare');return {brief:b,report:analyzeDesign(p,CATALOG,d.layout,b,d.roomUses)};}));}catch(e){this.error.set((e as Error).message);}finally{this.loading.set(false);}}
  async loadRemote(){
    this.loading.set(true);this.error.set('');
    try{
      let r=await fetch('api/designs');this.remoteBase='api/designs/';
      if(!r.ok||!r.headers.get('content-type')?.includes('application/json')){r=await fetch('designs/index.json');this.remoteBase='designs/';}
      if(!r.ok)throw Error('尚无已保存的 MCP 方案。请运行 npm run simulate:designs。');
      const list=await r.json();if(!Array.isArray(list)||list.length>500||list.some(d=>typeof d.id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(d.id)||typeof d.name!=='string'))throw Error('方案目录无效');
      this.remote.set(list);
    }catch(e){this.error.set((e as Error).message);}finally{this.loading.set(false);}
  }
  async openRemote(id:string){
    this.loading.set(true);this.error.set('');
    try{const r=await fetch(this.remoteBase+id+(this.remoteBase==='designs/'?'.json':''));if(!r.ok)throw Error('无法读取方案');const d=validateDesign(await r.json(),await this.rawProject(),CATALOG);this.brief.set(d.brief);this.document.set(d);this.report.set(analyzeDesign(this.project!,CATALOG,d.layout,d.brief,d.roomUses));this.current.set(false);}catch(e){this.error.set((e as Error).message);}finally{this.loading.set(false);}
  }
  errors(){return this.report()?.issues.filter(i=>i.severity==='error').length??0;}
  warnings(){return this.report()?.issues.filter(i=>i.severity==='warning').length??0;}
  apply(){const d=this.document();if(d&&!this.errors()&&!this.busy)this.applyDesign.emit(d);}
  money(n:number){return '¥'+Math.round(n).toLocaleString('zh-CN');}
  download(kind:'design'|'report'){
    const value=kind==='design'?this.document():this.report();if(!value)return;
    const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=(this.document()?.brief.name??'当前方案')+'-'+kind+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  }
}
