import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnDestroy, ViewChild, inject } from '@angular/core';
import { HomeEditor } from './editor';
import { wallLength, type WallOpening, type WallRecord } from './architecture';

type Rect={id:string;kind:'door'|'window';x:number;y:number;w:number;h:number};
type Handle={hx:number;hy:number;x:number;y:number};
@Component({selector:'home-opening-editor',standalone:true,templateUrl:'./opening-editor.html',styleUrl:'./opening-editor.css'})
export class OpeningEditor implements AfterViewInit,OnDestroy {
 private cdr=inject(ChangeDetectorRef);
 @Input({required:true}) editor!:HomeEditor;
 @Input({required:true}) wall!:WallRecord;
 @Input() selectedId:string|null=null;
 @Input() undoCount=0;
 @Input() redoCount=0;
 @ViewChild('dialog',{static:true}) dialog!:ElementRef<HTMLDialogElement>;
 @ViewChild('canvas',{static:true}) canvas!:ElementRef<SVGSVGElement>;
 @ViewChild('wrap',{static:true}) wrap!:ElementRef<HTMLElement>;
 @ViewChild('selectTool',{static:true}) selectTool!:ElementRef<HTMLButtonElement>;
 private observer?:ResizeObserver;
 private returnFocus?:HTMLElement;
 private drag?:{pointer:number;start:{x:number;y:number};rect:Rect;kind:'move'|'resize'|'draw';handle?:Handle};
 mode:'select'|'window'|'door'='select';
 reverse=false;snapEnabled=true;
 width=600;height=420;scale=100;left=55;top=44;
 ghost:Rect|null=null;message='拖动洞口移动，拖边角调整尺寸。';invalid=false;
 get length(){return wallLength(this.wall);}
 get locked(){return !!this.wall.lock||this.editor.readOnly;}
 get rects(){return this.wall.openings.map(o=>this.rect(o));}
 get selected(){return this.rects.find(o=>o.id===this.selectedId);}
 get handles():Handle[]{const o=this.selected;if(!o||this.locked)return [];return [-1,0,1].flatMap(hx=>[-1,0,1].filter(hy=>(hx||hy)&&(o.kind!=='door'||hy>=0)).map(hy=>({hx,hy,x:o.x+o.w*(hx+1)/2,y:o.y+o.h*(hy+1)/2})));}
 get gridX(){return Array.from({length:Math.max(0,Math.ceil(this.length*10)-1)},(_,i)=>(i+1)/10);}
 get gridY(){return Array.from({length:Math.max(0,Math.ceil(this.wall.height*10)-1)},(_,i)=>(i+1)/10);}
 ngAfterViewInit(){this.returnFocus=document.activeElement as HTMLElement;this.dialog.nativeElement.showModal();this.fit();this.observer=new ResizeObserver(()=>this.fit());this.observer.observe(this.wrap.nativeElement);}
 ngOnDestroy(){this.observer?.disconnect();this.editor.finishOpeningEdit(false);this.dialog.nativeElement.close();if(this.returnFocus?.isConnected)this.returnFocus.focus({preventScroll:true});}
 @HostListener('window:resize') fit(){if(!this.wrap)return;this.width=Math.max(220,this.wrap.nativeElement.clientWidth);this.scale=Math.max(1,Math.min((this.width-110)/this.length,(Math.max(270,Math.min(580,window.innerHeight*.62))-100)/this.wall.height));this.height=this.wall.height*this.scale+104;this.left=(this.width-this.length*this.scale)/2;this.cdr.markForCheck();}
 @HostListener('window:blur') blur(){this.finish(false);}
 rect(o:WallOpening):Rect{return {id:o.id!,kind:o.kind,x:this.reverse?this.length-o.end:o.start,y:o.bottom,w:o.end-o.start,h:o.top-o.bottom};}
 opening(r:Rect):WallOpening{return {id:r.id,kind:r.kind,start:this.reverse?this.length-r.x-r.w:r.x,end:this.reverse?this.length-r.x:r.x+r.w,bottom:r.kind==='door'?0:r.y,top:(r.kind==='door'?0:r.y)+r.h};}
 px(x:number){return this.left+x*this.scale;}
 py(y:number){return this.top+(this.wall.height-y)*this.scale;}
 cm(x:number){return Math.round(x*1000)/10;}
 label(o:Rect){return o.kind==='door'?'门洞':'窗户';}
 snap(n:number){const step=this.snapEnabled?.05:.01;return Math.round(n/step)*step;}
 setMode(mode:'select'|'window'|'door'){this.finish(false);this.mode=mode;this.message=mode==='window'?'在墙面拖出矩形，松手开窗。':mode==='door'?'从门洞一侧拖向另一侧顶部，底边自动贴地。':'拖动洞口或蓝色边角；也可输入精确尺寸。';this.invalid=false;}
 flip(){this.finish(false);this.reverse=!this.reverse;}
 close(){this.finish(false);this.editor.closeOpeningEditor();}
 cancel(event:Event){event.preventDefault();if(this.drag||this.mode!=='select'){this.finish(false);this.mode='select';}else this.close();}
 key(event:KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.cancel(event);return;}
  if((event.target as HTMLElement).matches('input,select,textarea'))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();this.history(event.shiftKey);}
  else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();event.stopPropagation();this.history(true);}
  else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();this.remove();}
 }
 history(redo=false){this.finish(false);redo?this.editor.redo():this.editor.undo();this.mode='select';this.message=redo?'已重做。':'已撤销。';this.invalid=false;}
 choose(id:string|null){this.finish(false);this.mode='select';this.editor.selectOpening(id);}
 private point(e:PointerEvent){const b=this.canvas.nativeElement.getBoundingClientRect();return {x:(e.clientX-b.left-this.left)/this.scale,y:this.wall.height-(e.clientY-b.top-this.top)/this.scale};}
 down(e:PointerEvent){
  if(e.button!==0||this.drag)return;
  const p=this.point(e);let rect:Rect|undefined,handle:Handle|undefined,kind:'move'|'resize'|'draw'='move';
  if(this.mode!=='select'){
   if(this.locked||p.x<0||p.x>this.length||p.y<0||p.y>this.wall.height)return;
   rect={id:'opening-'+crypto.randomUUID(),kind:this.mode,x:this.snap(p.x),y:this.mode==='door'?0:this.snap(p.y),w:0,h:0};kind='draw';
  }else{
   handle=this.handles.map(h=>({...h,d:Math.hypot((h.x-p.x)*this.scale,(h.y-p.y)*this.scale)})).filter(h=>h.d<(e.pointerType==='touch'?22:12)).sort((a,b)=>a.d-b.d)[0];
   rect=handle?this.selected:[...this.rects].reverse().find(o=>p.x>=o.x&&p.x<=o.x+o.w&&p.y>=o.y&&p.y<=o.y+o.h);
   this.editor.selectOpening(rect?.id??null);if(!rect||this.locked)return;kind=handle?'resize':'move';
  }
  if(!rect||!this.editor.beginOpeningEdit())return;
  this.drag={pointer:e.pointerId,start:p,rect:{...rect},kind,handle};this.selectTool.nativeElement.focus({preventScroll:true});this.canvas.nativeElement.setPointerCapture(e.pointerId);e.preventDefault();
 }
 move(e:PointerEvent){
  const d=this.drag;if(!d||e.pointerId!==d.pointer)return;e.preventDefault();const p=this.point(e),a=d.rect,dx=this.snap(p.x-d.start.x),dy=this.snap(p.y-d.start.y);let n={...a};
  if(d.kind==='move'){n.x=a.x+dx;n.y=a.kind==='door'?0:a.y+dy;}
  else if(d.kind==='draw'){n.x=Math.min(a.x,this.snap(p.x));n.w=Math.abs(this.snap(p.x)-a.x);n.y=a.kind==='door'?0:Math.min(a.y,this.snap(p.y));n.h=a.kind==='door'?this.snap(p.y):Math.abs(this.snap(p.y)-a.y);}
  else{const h=d.handle!;let left=a.x,right=a.x+a.w,bottom=a.y,top=a.y+a.h;if(h.hx<0)left+=dx;if(h.hx>0)right+=dx;if(h.hy<0)bottom+=dy;if(h.hy>0)top+=dy;
   if(e.shiftKey&&h.hx&&h.hy){const factor=Math.max((right-left)/a.w,(top-bottom)/a.h);if(h.hx<0)left=right-a.w*factor;else right=left+a.w*factor;if(h.hy<0)bottom=top-a.h*factor;else top=bottom+a.h*factor;}
   n={...a,x:left,y:bottom,w:right-left,h:top-bottom};
  }
  const error=n.w<.3-.000001||n.h<.3-.000001?'洞口宽、高至少30 cm。':this.editor.previewOpening(this.opening(n));
  this.invalid=!!error;this.ghost=error?n:null;this.message=error?error+' 松手保留最后有效位置。':'尺寸预览中 · 松手保存 · Esc取消';
 }
 up(e:PointerEvent){if(this.drag?.pointer===e.pointerId)this.finish(e.type!=='pointercancel');}
 finish(save=true){
  const d=this.drag;if(!d)return;this.drag=undefined;const invalid=!!this.ghost;this.ghost=null;
  if(this.canvas.nativeElement.hasPointerCapture(d.pointer))this.canvas.nativeElement.releasePointerCapture(d.pointer);
  this.editor.finishOpeningEdit(save);this.mode='select';this.invalid=false;this.message=!save?'已取消本次拖动。':invalid?'已保留最后有效位置。':'洞口已保存，可继续编辑。';
 }
 field(key:'x'|'y'|'w'|'h',e:Event){
  const input=e.target as HTMLInputElement,o=this.selected;if(!o||this.locked||o.kind==='door'&&key==='y')return;
  const value=Number(input.value)/100,n={...o,[key]:value};
  const error=!input.value||!Number.isFinite(value)?'请输入有效尺寸。':n.w<.3||n.h<.3?'洞口宽、高至少30 cm。':this.editor.changeOpening(this.opening(n));
  this.message=error||'精确尺寸已保存。';this.invalid=!!error;input.value=String(this.cm(error?o[key]:n[key]));
 }
 focusField(key:string){this.dialog.nativeElement.querySelector<HTMLInputElement>(`[data-field="${key}"]`)?.focus();}
 remove(){const o=this.selected;if(this.locked||!o)return;this.finish(false);this.editor.deleteOpening(o.id);this.message='已删除洞口并恢复墙面，可撤销。';this.invalid=false;}
 duplicate(){
  const o=this.selected;if(!o||this.locked)return;this.finish(false);const id='opening-'+crypto.randomUUID();
  const candidates:Rect[]=[];
  for(let y=0;y<=this.wall.height-o.h+.001;y+=.05){if(o.kind==='door'&&y>.001)break;for(let x=0;x<=this.length-o.w+.001;x+=.05)candidates.push({...o,id,x,y});}
  candidates.sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y));
  const free=candidates.find(n=>!this.rects.some(r=>n.x<r.x+r.w+.03&&n.x+n.w>r.x-.03&&n.y<r.y+r.h+.03&&n.y+n.h>r.y-.03));
  const error=free?this.editor.changeOpening(this.opening(free)):'没有足够的空白墙面放置副本。';this.invalid=!!error;this.message=error||'已复制，可拖动副本调整位置。';
 }
}
