import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {demoSizeChart,productSizeChart,SizeSelection,sizeLabels,neutralGrading} from '../storefront/live-ar/size-profiles';
import {jacketTargets,jacketMesh,partPoint,profiles} from '../storefront/live-ar/garment-mesh';
import {GarmentRenderer} from '../storefront/live-ar/engine';
import {StableScan} from '../storefront/live-ar/sizing';
import type {Torso,Landmark} from '../storefront/live-ar/pose';
import type {TrackingFrame} from '../storefront/live-ar/tracking';
import type {ARProduct} from '../storefront/live-ar/catalog';

const bodyM={chest:98,waist:84,hips:100},bodyL={chest:105,waist:94,hips:110};
test('demo starts at M, shared boundaries favour larger sizes, and conflicting dimensions have no suggestion',()=>{
  const s=new SizeSelection(demoSizeChart);assert.equal(s.selected,'M');assert.deepEqual(s.grading(),neutralGrading);
  assert.equal(s.suggest({chest:92,waist:80,hips:96}),'M');
  assert.equal(s.suggest(bodyL),'L');assert.equal(s.selected,'L');assert.equal(s.reference,'L');
  assert.equal(s.suggest({chest:90,waist:100,hips:120}),undefined);assert.equal(s.selected,'L');assert.equal(s.suggested,undefined);
  assert.equal(s.suggest({chest:140,waist:135,hips:140}),undefined);
  assert.equal(s.suggest({chest:NaN,waist:90,hips:100}),undefined);
});
test('manual size overrides survive a successful scan; use suggested restores automatic selection',()=>{
  const s=new SizeSelection(demoSizeChart);s.choose('XXL');s.suggest(bodyM);
  assert.equal(s.selected,'XXL');assert.equal(s.reference,'M');assert.ok(s.grading().width>1.15);assert.ok(s.manual);
  s.useSuggested();assert.equal(s.selected,'M');assert.equal(s.manual,false);
  s.suggest(bodyL);assert.equal(s.selected,'L');assert.equal(s.reference,'L');
  s.choose('4XL');assert.equal(s.selected,'L');
  s.suggest(bodyM,()=>false);assert.equal(s.selected,'L');assert.equal(s.suggested,'M');
});
test('real products never receive demo dimensions, and approved charts require matching IDs and valid garment dimensions',()=>{
  assert.equal(productSizeChart(false,'101',''),undefined);
  assert.equal(productSizeChart(false,'101',JSON.stringify(demoSizeChart)),undefined);
  const chart={...demoSizeChart,productId:'101'};
  assert.deepEqual(productSizeChart(false,'101',JSON.stringify(chart)),chart);
  assert.equal(productSizeChart(false,'102',JSON.stringify(chart)),undefined);
  for(const garment of [undefined,{chest:100,shoulder:45,length:66,sleeve:0},{chest:'100',shoulder:45,length:66,sleeve:64}]){
    assert.equal(productSizeChart(false,'101',JSON.stringify({...chart,sizes:[{...chart.sizes[0],garment}]})),undefined);
  }
  assert.equal(productSizeChart(true,'sample',''),demoSizeChart);
  const unavailable=new SizeSelection(undefined);unavailable.choose('3XL');assert.deepEqual(unavailable.grading(),neutralGrading);
});

const torso=():Torso=>({x:320,y:300,width:256,height:354,angle:0,body:{chest:210,hips:230},rig:{
  leftShoulder:{x:220,y:120},rightShoulder:{x:420,y:120},leftHip:{x:240,y:420},rightHip:{x:400,y:420},
  leftElbow:{x:180,y:260},rightElbow:{x:460,y:260},leftWrist:{x:160,y:410},rightWrist:{x:480,y:410},
}});
test('all six sizes have progressively larger width, hem length and cuffs while collars and body panels remain arm-independent',()=>{
  for(const profile of ['open','open_brown']){
    const state=new SizeSelection(demoSizeChart),base=jacketTargets(torso(),profile)!.points;
    let previous=[0,0,0];
    for(const label of sizeLabels){
      state.choose(label);const t=torso(),target=jacketTargets(t,profile,state.grading())!.points;
      const width=target[1].x-target[0].x,hem=(target[12].y+target[13].y)/2,cuff=Math.hypot(target[6].x-target[4].x,target[6].y-target[4].y);
      [width,hem,cuff].forEach((v,i)=>assert.ok(v>previous[i],`${profile} ${label} dimension ${i}`));previous=[width,hem,cuff];
      assert.deepEqual(target.slice(8,10),base.slice(8,10),'collar anchored to neck at every size');
      const moved=structuredClone(t);moved.rig!.leftElbow={x:100,y:180};moved.rig!.leftWrist={x:70,y:60};
      const after=jacketTargets(moved,profile,state.grading())!.points;
      for(const patch of jacketMesh(profile))if(patch.part!=='left')for(const v of patch.vertices)assert.deepEqual(partPoint(v,profile,after,patch.part),partPoint(v,profile,target,patch.part));
      const body=jacketMesh(profile).find(p=>p.part==='body')!;
      for(let i=0;i<body.vertices.length;i+=11){
        const a=body.vertices[i],b=body.vertices[i+10];if(a.y<profiles[profile][0].y||a.y>profiles[profile][2].y)continue;
        assert.ok(Math.abs(partPoint(b,profile,target,'body').x-partPoint(a,profile,target,'body').x-width)<1e-6);
      }
    }
  }
});
test('size changes reuse image decoding and preserve accepted silhouette calibration',async()=>{
  const previous=globalThis.Image;let decodes=0;
  globalThis.Image=class {naturalWidth=1280;naturalHeight=1280;async decode(){decodes++;}} as unknown as typeof Image;
  try{
    const context={clearRect(){},save(){},restore(){},beginPath(){},closePath(){},clip(){},moveTo(){},lineTo(){},drawImage(){},transform(){}};
    const canvas={width:640,height:480,dataset:{},getContext:()=>context} as unknown as HTMLCanvasElement;
    const renderer=new GarmentRenderer(canvas),s=new SizeSelection(demoSizeChart);await renderer.load('/fixture.png','open');
    for(let n=0;n<60;n++){const t=torso();t.body={chest:260,hips:260};renderer.draw(t,undefined,undefined,n*50);}
    const scale=Number(canvas.dataset.previewWidth);assert.ok(scale>1.2);
    for(const label of sizeLabels){
      s.choose(label);await renderer.load('/fixture.png','open');const t=torso();delete t.body;
      renderer.draw(t,undefined,undefined,4000,s.grading());assert.equal(Number(canvas.dataset.previewWidth),scale);
    }
    assert.equal(decodes,1);renderer.dispose();
  }finally{globalThis.Image=previous;}
});
test('pending and out-of-order artwork loads retain the latest asset',async()=>{
  const previous=globalThis.Image,finish=new Map<string,()=>void>();let decodes=0;
  globalThis.Image=class {src='';naturalWidth=1280;naturalHeight=1280;decode(){decodes++;return new Promise<void>(resolve=>finish.set(this.src,resolve));}} as unknown as typeof Image;
  try{
    const canvas={width:640,height:480,dataset:{},getContext:()=>({clearRect(){}})} as unknown as HTMLCanvasElement;
    const renderer=new GarmentRenderer(canvas),a=renderer.load('/a.png','open'),a2=renderer.load('/a.png','open');assert.equal(a,a2);
    const b=renderer.load('/b.png','open_brown');finish.get('/b.png')!();await b;finish.get('/a.png')!();await a;
    assert.ok(renderer.readyFor('/b.png','open_brown'));assert.equal(renderer.readyFor('/a.png','open'),false);assert.equal(decodes,2);
    renderer.dispose();assert.equal(renderer.readyFor('/b.png','open_brown'),false);
  }finally{globalThis.Image=previous;}
});
test('stable capture also completes at the slowest supported inference cadence',()=>{
  const scan=new StableScan(),view={widths:{chest:40,waist:34,hips:40},shoulderRatio:.22};
  for(let n=0;n<14;n++)assert.equal(scan.update(view,n*200),undefined);
  assert.deepEqual(scan.update(view,2800),view);
});

const {JSDOM}=createRequire(import.meta.url)('jsdom');
function scanFixture(side=false):TrackingFrame {
  const p:Landmark[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  for(const [i,x,y] of [[0,.5,.14],[11,side?.48:.3,.25],[12,side?.52:.7,.25],[23,.46,.62],[24,.54,.62],[25,.46,.78],[26,.54,.78],[27,.46,.91],[28,.54,.91],[29,.46,.94],[30,.54,.94],[13,side?.8:.15,side?.34:.43],[14,side?.82:.85,side?.34:.43],[15,side?.9:.1,side?.39:.6],[16,side?.92:.9,side?.39:.6]])p[i]={x,y,visibility:1};
  const width=400,height=800,data=new Float32Array(width*height);
  const rect=(lo:number,hi:number,top:number,bottom:number)=>{for(let y=Math.round(top*height);y<Math.round(bottom*height);y++)for(let x=Math.round(lo*width);x<Math.round(hi*width);x++)data[y*width+x]=1;};
  rect(.45,.55,.06,.25);rect(side?.39:.305,side?.61:.695,.25,.66);rect(.4,.6,.66,.95);
  // A narrower waist makes this fixture fit the explicitly synthetic M chart.
  for(let y=365;y<420;y++){for(let x=0;x<width;x++)data[y*width+x]=0;}
  rect(side?.4:.33,side?.6:.67,365/height,420/height);
  return {landmarks:[p],mask:{width,height,data}};
}
async function assistant(product?:ARProduct,chart=''){
  const copy=JSON.parse(await readFile('extensions/live-ar/locales/en.default.json','utf8')).live_ar;
  const source=await readFile('extensions/live-ar/assets/live-ar-sizing.js','utf8');
  const dom=new JSDOM(`<main><dialog></dialog><select><option value="8">Black</option><option value="9">Brown</option></select>${sizeLabels.map(size=>`<input type="radio" name="size" value="${size}" data-ar-size>`).join('')}<div data-size-capture><input type="number" min="120" max="220" step="1" required data-size-height><button data-size-suggest></button></div><p data-size-note></p><p data-size-result></p><p data-size-guide hidden></p><button data-size-use hidden></button></main>`,{runScripts:'outside-only'});
  const {window}=dom,root=window.document.querySelector('main');root.dataset.sizeCopy=JSON.stringify(copy);root.dataset.sizeChart=chart;
  window.eval(source.replace(/export\s*\{([^}]+)\};?\s*$/,(_,exports:string)=>exports.split(',').map(e=>{const [name,alias]=e.trim().split(/\s+as\s+/);return `window.${alias||name}=${name};`;}).join('')));
  let active=false;
  const helper=new window.SizeAssistant(root,product??{id:'sample',title:'Samples',url:'',demo:true,variants:[{id:'8',title:'Black',asset:'/black.png',available:true,price:''},{id:'9',title:'Brown',asset:'/brown.png',available:true,price:''}]},()=>active);
  return {root,window,helper,setActive:()=>{active=true;},choose:(label:string)=>root.querySelector(`[data-ar-size][value="${label}"]`).click(),click:(name:string)=>root.querySelector(`[data-size-${name}]`).click(),text:()=>root.querySelector('[data-size-result]').textContent as string,close:()=>{helper.dispose();window.close();}};
}
test('built size UI changes preview without switching sample artwork; a completed scan respects manual choice',async()=>{
  const ui=await assistant(),{root,helper}=ui;assert.equal(root.dataset.selectedSize,'M');assert.match(root.querySelector('[data-size-note]').textContent,/Demo sizing only/);
  ui.choose('3XL');assert.equal(root.dataset.selectedSize,'3XL');assert.ok(helper.grading().width>1.2);assert.equal(root.querySelector('select').value,'8');
  const height=root.querySelector('[data-size-height]');height.value='176';ui.click('suggest');assert.match(ui.text(),/Start the camera first/);
  ui.setActive();height.value='119';ui.click('suggest');assert.equal(root.querySelector('[data-size-guide]').hidden,true);
  height.value='176';ui.click('suggest');const start=ui.window.performance.now();
  for(let i=0;i<16;i++)helper.update(scanFixture(),400,800,start+i*100);
  assert.match(ui.text(),/Turn fully sideways/);
  for(let i=0;i<16;i++)helper.update(scanFixture(true),400,800,start+1700+i*100);
  assert.match(ui.text(),/suggested size: M/);assert.equal(root.dataset.selectedSize,'3XL');assert.equal(root.dataset.referenceSize,'M');assert.match(ui.text(),/3XL remains active/);
  ui.click('use');assert.equal(root.dataset.selectedSize,'M');assert.deepEqual(JSON.parse(JSON.stringify(helper.grading())),neutralGrading);
  ui.choose('XL');helper.cancelScan();assert.equal(root.dataset.selectedSize,'XL');
  root.querySelector('select').value='9';root.querySelector('select').dispatchEvent(new ui.window.Event('change'));assert.equal(root.dataset.selectedSize,'XL');
  helper.clearCapture();assert.equal(height.value,'');assert.equal(root.dataset.selectedSize,'XL');ui.close();
});
test('real-product UI disables scan without a valid chart and maps only available variants',async()=>{
  const product:ARProduct={id:'101',title:'Jacket',url:'/products/jacket',variants:[{id:'8',title:'M',size:'M',asset:'/black.png',price:'',available:true},{id:'9',title:'3XL',size:'3XL',asset:'/black.png',price:'',available:false}]};
  const ui=await assistant(product);assert.equal(ui.root.querySelector('[data-size-capture]').hidden,true);assert.match(ui.text(),/approved measurement chart/);
  assert.equal(ui.root.querySelector('[value="3XL"][data-ar-size]').disabled,true);assert.doesNotMatch(ui.root.querySelector('[data-size-note]').textContent,/Demo sizing/);
  ui.choose('M');assert.equal(ui.root.querySelector('select').value,'8');assert.deepEqual(JSON.parse(JSON.stringify(ui.helper.grading())),neutralGrading);ui.close();
});
test('size scan timeout and tracking interruption preserve the chosen size',async()=>{
  const ui=await assistant();ui.setActive();ui.choose('L');ui.root.querySelector('[data-size-height]').value='176';ui.click('suggest');
  ui.helper.update({landmarks:[]},400,800,ui.window.performance.now()+46000);assert.match(ui.text(),/could not be captured/);assert.equal(ui.root.dataset.selectedSize,'L');
  ui.click('suggest');ui.helper.cancelScan();assert.equal(ui.root.querySelector('[data-size-guide]').hidden,true);assert.equal(ui.root.dataset.selectedSize,'L');ui.close();
});
