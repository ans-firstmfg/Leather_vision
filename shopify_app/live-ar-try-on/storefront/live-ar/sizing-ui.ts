import {combineViews,scanView,StableScan,type ScanView} from './sizing';
import {productSizeChart,SizeSelection,type SizeLabel} from './size-profiles';
import {mappedVariant,type ARProduct} from './catalog';
import type {TrackingFrame} from './tracking';

export class SizeAssistant {
  readonly selection:SizeSelection;
  private copy:Record<string,string>;
  private variant:HTMLSelectElement;
  private controller=new AbortController();
  private stable=new StableScan();
  private front?:ScanView;
  private phase?:'front'|'side';
  private started=0;
  private scanHeight=0;
  private applying=false;
  private feedback='size_ready';
  constructor(private root:HTMLElement,private product:ARProduct,private cameraActive:()=>boolean){
    this.copy=JSON.parse(root.dataset.sizeCopy||'{}');
    this.variant=root.querySelector<HTMLSelectElement>('select')!;
    const current=product.variants.find(v=>v.id===this.variant.value)?.size;
    this.selection=new SizeSelection(productSizeChart(!!product.demo,product.id,root.dataset.sizeChart||''),current);
    const {signal}=this.controller;
    root.querySelector('dialog')?.addEventListener('close',()=>this.clearCapture(),{signal});
    root.querySelectorAll<HTMLInputElement>('[data-ar-size]').forEach(input=>input.addEventListener('change',()=>{
      if(input.checked&&this.canSelect(input.value as SizeLabel)){this.selection.choose(input.value);this.applyVariant();}
      this.render();
    },{signal}));
    this.variant.addEventListener('change',()=>{
      const size=product.variants.find(v=>v.id===this.variant.value)?.size;
      if(!this.applying&&size)this.selection.choose(size);
      this.render();
    },{signal});
    this.node('[data-size-suggest]')?.addEventListener('click',()=>this.startScan(),{signal});
    this.node('[data-size-use]')?.addEventListener('click',()=>{
      if(this.selection.suggested&&this.canSelect(this.selection.suggested)){this.selection.useSuggested();this.applyVariant();this.render();}
    },{signal});
    this.node<HTMLInputElement>('[data-size-height]')?.addEventListener('input',()=>{
      this.cancelScan();this.selection.suggested=undefined;this.feedback='size_ready';this.render();
    },{signal});
    const enabled=!!this.selection.chart;
    const suggest=this.node<HTMLButtonElement>('[data-size-suggest]');if(suggest)suggest.disabled=!enabled;
    const capture=this.node<HTMLElement>('[data-size-capture]');if(capture)capture.hidden=!enabled;
    this.render();
  }
  private node<T extends HTMLElement=HTMLElement>(selector:string){return this.root.querySelector<T>(selector);}
  private text(key:string,values:Record<string,string>={}){
    let text=this.copy[key]||key;for(const [k,v] of Object.entries(values))text=text.replaceAll(`{${k}}`,v);return text;
  }
  private canSelect(label:SizeLabel){return !!this.product.demo||((!this.selection.chart||this.selection.chart.sizes.some(s=>s.label===label))&&this.product.variants.some(v=>v.size===label&&!!mappedVariant(this.product,v.id)));}
  private applyVariant(){
    if(this.product.demo)return;
    const v=this.product.variants.find(v=>v.size===this.selection.selected&&!!mappedVariant(this.product,v.id));
    if(!v||this.variant.value===v.id)return;
    this.applying=true;
    try{this.variant.value=v.id;this.variant.dispatchEvent(new Event('change'));}finally{this.applying=false;}
  }
  private startScan(){
    const height=this.node<HTMLInputElement>('[data-size-height]');
    if(!this.selection.chart){this.feedback='size_no_chart';this.render();return;}
    if(!height?.reportValidity()||!Number.isFinite(height.valueAsNumber)||height.valueAsNumber<120||height.valueAsNumber>220)return;
    if(!this.cameraActive()){this.feedback='size_start_camera';this.render();return;}
    this.cancelScan();this.selection.suggested=undefined;
    this.phase='front';this.started=performance.now();this.scanHeight=height.valueAsNumber;
    this.feedback='size_front';this.render();this.node('.fm-ar__stage')?.scrollIntoView?.({block:'center',behavior:'smooth'});
  }
  cancelScan(){this.phase=undefined;this.front=undefined;this.scanHeight=0;this.stable.reset();if(this.feedback==='size_front'||this.feedback==='size_side')this.feedback='size_interrupted';this.render();}
  clearCapture(){this.cancelScan();const height=this.node<HTMLInputElement>('[data-size-height]');if(height)height.value='';}
  dispose(){this.clearCapture();this.controller.abort();}
  grading(){return this.selection.grading();}
  update(frame:TrackingFrame,width:number,height:number,now:number){
    if(!this.phase)return;
    if(now-this.started>45000){this.cancelScan();this.feedback='size_timeout';this.render();return;}
    const capture=this.stable.update(scanView(frame,this.scanHeight,width,height,this.phase==='side'?this.front:undefined),now);
    if(!capture)return;
    this.stable.reset();
    if(this.phase==='front'){this.front=capture;this.phase='side';this.started=now;this.feedback='size_side';this.render();return;}
    const measurements=combineViews(this.front!,capture);this.phase=undefined;this.front=undefined;
    const suggestion=measurements?this.selection.suggest(measurements,label=>this.canSelect(label)):undefined;
    this.feedback=suggestion?'size_suggestion':measurements?'size_outside':'size_failed';
    if(suggestion)this.applyVariant();this.render();
  }
  private render(){
    const s=this.selection;
    this.root.dataset.selectedSize=s.selected;this.root.dataset.referenceSize=s.reference;
    this.root.querySelectorAll<HTMLInputElement>('[data-ar-size]').forEach(input=>{
      input.checked=input.value===s.selected;input.disabled=!this.canSelect(input.value as SizeLabel);
    });
    const note=this.node('[data-size-note]');if(note)note.textContent=this.text(this.product.demo?'size_demo_note':'size_real_note');
    let text=this.text(s.chart?this.feedback:'size_no_chart',{size:s.suggested||'',selected:s.selected});
    if(s.suggested&&this.feedback==='size_suggestion')text+=' '+this.text(this.canSelect(s.suggested)?(s.manual?'size_manual_active':'size_auto_active'):'size_unavailable',{size:s.suggested,selected:s.selected});
    const result=this.node('[data-size-result]');if(result&&result.textContent!==text)result.textContent=text;
    const use=this.node<HTMLButtonElement>('[data-size-use]');if(use){use.hidden=!s.suggested;use.disabled=!s.suggested||!this.canSelect(s.suggested);}
    const guide=this.node('[data-size-guide]');if(guide){guide.hidden=!this.phase;const message=this.phase?this.text(this.phase==='front'?'size_front':'size_side'):'';if(guide.textContent!==message)guide.textContent=message;}
  }
}
