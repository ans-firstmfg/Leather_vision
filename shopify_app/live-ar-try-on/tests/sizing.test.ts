import {test} from 'node:test';
import assert from 'node:assert/strict';


import {parseChart,recommendSize,scanView,combineViews,StableScan,type SizeChart,type ScanView} from '../storefront/live-ar/sizing';
import {VisualSizer} from '../storefront/live-ar/visual-size';
import {jacketTargets,jacketMesh,partPoint,profiles} from '../storefront/live-ar/garment-mesh';
import type {Landmark,Torso} from '../storefront/live-ar/pose';
import type {TrackingFrame} from '../storefront/live-ar/tracking';

const chart:SizeChart={kind:'body_cm',sizes:[
  {label:'M',chest:[94,104],waist:[80,90],hips:[94,104]},
  {label:'L',chest:[102,114],waist:[88,100],hips:[102,114]},
]};
test('chart validation refuses labels alone, garment/inch charts, duplicates and invalid ranges',()=>{
  assert.deepEqual(parseChart(JSON.stringify(chart)),chart);
  for(const value of ['S/M/L/XL/XXL','{}','null',JSON.stringify({...chart,kind:'garment_cm'}),JSON.stringify({...chart,kind:'body_in'}),JSON.stringify({...chart,sizes:[chart.sizes[0],chart.sizes[0]]}),JSON.stringify({...chart,sizes:[{...chart.sizes[0],waist:[90,80]}]})])assert.equal(parseChart(value),undefined);
});
test('recommendation matches every circumference; never forces a nearest size or double-adds ease',()=>{
  assert.deepEqual(recommendSize(chart,{chest:98,waist:84,hips:98}),{labels:['M'],between:false});
  assert.deepEqual(recommendSize(chart,{chest:103,waist:89,hips:103},true),{labels:['L'],between:false});
  assert.deepEqual(recommendSize(chart,{chest:103,waist:89,hips:103},false),{labels:['M'],between:false});
  assert.equal(recommendSize(chart,{chest:98,waist:98,hips:98}),undefined);
  assert.equal(recommendSize(chart,{chest:140,waist:120,hips:130}),undefined);
  assert.equal(recommendSize(chart,{chest:NaN,waist:84,hips:98}),undefined);
  assert.deepEqual(recommendSize(chart,{chest:101,waist:87,hips:101},false,4),{labels:['M','L'],between:true});
});

function fixture(side=false):TrackingFrame {
  const p:Landmark[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  for(const [i,x,y] of [[0,.5,.14],[11,side?.48:.30,.25],[12,side?.52:.70,.25],[23,.46,.62],[24,.54,.62],
    [25,.46,.78],[26,.54,.78],[27,.46,.91],[28,.54,.91],[29,.46,.94],[30,.54,.94],
    [13,side?.80:.15,side?.34:.43],[14,side?.82:.85,side?.34:.43],[15,side?.9:.1,side?.39:.60],[16,side?.92:.9,side?.39:.60]])p[i]={x,y,visibility:1};
  const w=400,h=800,data=new Float32Array(w*h);
  const rect=(x0:number,x1:number,y0:number,y1:number)=>{for(let y=Math.round(y0*h);y<Math.round(y1*h);y++)for(let x=Math.round(x0*w);x<Math.round(x1*w);x++)data[y*w+x]=1;};
  rect(.45,.55,.06,.25);rect(side?.39:.30,side?.61:.70,.25,.66);rect(.40,.60,.66,.95);
  return {landmarks:[p],mask:{width:w,height:h,data}};
}
test('height-calibrated front and side silhouettes produce finite circumference estimates at any resolution',()=>{
  const front=scanView(fixture(),176,400,800);assert.ok(front);
  assert.equal(Math.round(front.widths.chest),40);
  const side=scanView(fixture(true),176,400,800,front);assert.ok(side);
  const measurements=combineViews(front,side);assert.ok(measurements);assert.ok(measurements.chest>95&&measurements.chest<105);
  assert.deepEqual(scanView(fixture(),176,800,1600),front);
  assert.ok(scanView(fixture(),190,400,800)!.widths.chest>front.widths.chest);
  assert.equal(scanView(fixture(),176,400,800,front),undefined,'front view cannot be accepted as side');
  assert.equal(scanView(fixture(true),176,400,800),undefined,'side view cannot begin calibration');
});
test('scan refuses cropped bodies, low confidence, missing masks, tilt, crossing arms and invalid height',()=>{
  for(const mutate of [
    (f:TrackingFrame)=>{f.landmarks[0][29].y=.999;},
    (f:TrackingFrame)=>{f.landmarks[0][11].visibility=.1;},
    (f:TrackingFrame)=>{f.mask=undefined;},
    (f:TrackingFrame)=>{f.landmarks[0][23].x+=.3;f.landmarks[0][24].x+=.3;},
    (f:TrackingFrame)=>{f.landmarks[0][15].x=.5;},
    (f:TrackingFrame)=>{f.mask!.data.fill(1);},
  ]){const f=fixture();mutate(f);assert.equal(scanView(f,176,400,800),undefined);}
  for(const h of [0,NaN,119,221])assert.equal(scanView(fixture(),h,400,800),undefined);
  const side=scanView(fixture(true),176,400,800,scanView(fixture(),176,400,800)!);assert.ok(side);
  assert.equal(combineViews({...side,widths:{chest:NaN,waist:10,hips:10}},side),undefined);
});
test('scan requires stable consecutive observations, resets on invalid frames, and tolerates small jitter',()=>{
  const filter=new StableScan(),view:ScanView={widths:{chest:40,waist:35,hips:40},shoulderRatio:.22};
  for(let n=0;n<14;n++)assert.equal(filter.update(view,n*100),undefined);
  assert.deepEqual(filter.update(view,1400),view);
  filter.reset();for(let n=0;n<14;n++)filter.update(view,n*100);
  filter.update(undefined,1400);assert.equal(filter.update(view,1500),undefined);
  filter.update({...view,widths:{...view.widths,chest:50}},1600);assert.equal(filter.update(view,1700),undefined);
  assert.equal(filter.update(view,3000),undefined,'stalled video must not complete an old capture');
});

const torso=():Torso=>({x:320,y:300,width:256,height:354,angle:0,body:{chest:260,hips:260},rig:{leftShoulder:{x:220,y:120},rightShoulder:{x:420,y:120},leftHip:{x:240,y:420},rightHip:{x:400,y:420},leftElbow:{x:180,y:260},rightElbow:{x:460,y:260},leftWrist:{x:160,y:410},rightWrist:{x:480,y:410}}});
test('automatic visual scale adapts after stable evidence and holds during raised/crossed arms, masks missing or turns',()=>{
  const s=new VisualSizer();assert.equal(s.update(torso(),0).previewWidth,1);
  let result=torso();for(let n=1;n<60;n++)result=s.update(torso(),n*50);
  assert.ok(result.previewWidth!>1.2&&result.previewWidth!<=1.35);
  const before=result.previewWidth;
  for(const mutate of [(t:Torso)=>{delete t.body;},(t:Torso)=>{t.yaw=.5;},(t:Torso)=>{t.rig!.leftWrist!.y=0;}]){
    const t=torso();mutate(t);assert.equal(s.update(t,5000).previewWidth,before);
  }
  s.reset();assert.equal(s.update(torso(),6000).previewWidth,1);
});
test('auto-resized torso retains equal row widths, hip hem center and independent moving sleeves',()=>{
  for(const profile of ['open','open_brown']){
    const t={...torso(),previewWidth:1.3},target=jacketTargets(t,profile)!.points;
    const moved=structuredClone(t);moved.rig!.leftElbow={x:100,y:180};moved.rig!.leftWrist={x:50,y:80};
    const after=jacketTargets(moved,profile)!.points;
    const body=jacketMesh(profile).find(p=>p.part==='body')!;
    for(let i=0;i<body.vertices.length;i+=11){
      const a=body.vertices[i],b=body.vertices[i+10];if(a.y<profiles[profile][0].y||a.y>profiles[profile][2].y)continue;
      const left=partPoint(a,profile,target,'body'),right=partPoint(b,profile,target,'body');
      assert.ok(Math.abs((right.x-left.x)-(target[1].x-target[0].x))<1e-6);
      assert.deepEqual(partPoint(a,profile,after,'body'),left);
    }
    assert.equal(partPoint({x:.5,y:profiles[profile][2].y},profile,target,'body').y,420);
  }
});

