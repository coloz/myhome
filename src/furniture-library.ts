import {Component,ViewChild,ElementRef,input,output,computed,signal,OnDestroy} from '@angular/core';
import type {CatalogItem} from './catalog-types';
import {FurniturePreview} from './furniture-preview';

@Component({selector:'furniture-library',standalone:true,imports:[FurniturePreview],templateUrl:'./furniture-library.html'})
export class FurnitureLibrary implements OnDestroy {
 @ViewChild('details',{static:true}) details!:ElementRef<HTMLDialogElement>;
 items=input.required<CatalogItem[]>();enabled=input(false);
 add=output<{id:string;color?:string}>();
 query=signal('');search=signal('');category=signal('全部');brand=signal('全部品牌');type=signal('全部类型');styles=signal<string[]>([]);width=signal(0);page=signal(0);
 selected=signal<CatalogItem|null>(null);variant=signal(0);private timer?:ReturnType<typeof setTimeout>;
 readonly pageSize=24;
 preview=signal(false);
 categories=computed(()=>['全部',...new Set(this.items().map(i=>i.category))]);
 brands=computed(()=>['全部品牌',...new Set(this.items().map(i=>i.brand??'方案定制'))]);
 styleOptions=computed(()=>[...new Set(this.items().flatMap(i=>i.styleTags??[]))].sort((a,b)=>a.localeCompare(b,'zh-CN')));
 typeOptions=computed(()=>['全部类型',...[...new Set(this.items().filter(i=>this.category()==='全部'||i.category===this.category()).flatMap(i=>i.typeTags??[]))].sort((a,b)=>a.localeCompare(b,'zh-CN'))]);
 filtered=computed(()=>{
  const terms=this.search().trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),category=this.category(),brand=this.brand(),type=this.type(),styles=this.styles(),width=this.width();
  return this.items().filter(i=>(category==='全部'||i.category===category)&&(brand==='全部品牌'||i.brand===brand)&&(type==='全部类型'||i.typeTags?.includes(type))&&(!styles.length||styles.some(s=>i.styleTags?.includes(s)))&&(!width||!!i.dimensions&&i.dimensions[0]*100<=width)&&terms.every(t=>[i.name,i.description,i.article,i.brand,...i.typeTags??[],...i.styleTags??[]].join(' ').toLocaleLowerCase().includes(t)));
 });
 pageCount=computed(()=>Math.max(1,Math.ceil(this.filtered().length/this.pageSize)));
 visible=computed(()=>this.filtered().slice(Math.min(this.page(),this.pageCount()-1)*this.pageSize,(Math.min(this.page(),this.pageCount()-1)+1)*this.pageSize));
 stockCount=computed(()=>this.items().filter(i=>i.brand!=='方案定制').length);
 categorySelect(value:string){this.category.set(value);this.type.set('全部类型');this.page.set(0);}
 filter(key:'brand'|'type',event:Event){this[key].set((event.target as HTMLSelectElement).value);this.page.set(0);}
 queryInput(event:Event){const value=(event.target as HTMLInputElement).value;this.query.set(value);clearTimeout(this.timer);this.timer=setTimeout(()=>{this.search.set(value);this.page.set(0);},160);}
 setWidth(event:Event){this.width.set(Math.max(0,Number((event.target as HTMLInputElement).value)||0));this.page.set(0);}
 toggleStyle(style:string){this.styles.update(s=>s.includes(style)?s.filter(x=>x!==style):[...s,style]);this.page.set(0);}
 clear(){clearTimeout(this.timer);this.query.set('');this.search.set('');this.category.set('全部');this.brand.set('全部品牌');this.type.set('全部类型');this.styles.set([]);this.width.set(0);this.page.set(0);}
 turn(delta:number){this.page.update(p=>Math.min(this.pageCount()-1,Math.max(0,p+delta)));document.querySelector('.catalog-grid')?.scrollIntoView({block:'start',behavior:'instant'});}
 drag(event:DragEvent,item:CatalogItem){if(!this.enabled()){event.preventDefault();return;}event.dataTransfer?.setData('application/x-home-furniture',item.id);if(event.dataTransfer)event.dataTransfer.effectAllowed='copy';}
 detail(item:CatalogItem){this.preview.set(false);this.selected.set(item);this.variant.set(0);this.details.nativeElement.showModal();}
 close(){this.preview.set(false);this.details.nativeElement.close();this.selected.set(null);}
 addDetail(){const item=this.selected();if(!item||!this.enabled())return;this.add.emit({id:item.id,color:item.variants?.[this.variant()]?.color});this.close();}
 imageError(event:Event){(event.target as HTMLImageElement).style.visibility='hidden';}
 ngOnDestroy(){clearTimeout(this.timer);}
}
