import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OneEuro} from '../storefront/live-ar/one-euro';
import {worldOrientation,PoseSmoother,type Torso,type Landmark} from '../storefront/live-ar/pose';
import {silhouetteWidths,type BodyMask} from '../storefront/live-ar/body-mask';
import {prepareTorso,releaseFrame,combineTrackers,type TrackingFrame} from '../storefront/live-ar/tracking';
import {jacketTargets} from '../storefront/live-ar/garment-mesh';
import {foregroundHands} from '../storefront/live-ar/frame-effects';

const torso=():Torso=>({x:64,y:64,width:64*1.28,height:64*1.18,angle:0,rig:{
  leftShoulder:{x:32,y:32},rightShoulder:{x:96,y:32},leftHip:{x:40,y:96},rightHip:{x:88,y:96},
  leftElbow:{x:5,y:60},rightElbow:{x:123,y:60},leftWrist:{x:1,y:110},rightWrist:{x:127,y:110},
}});
function mask(bodyWidth:number):BodyMask{
  const data=new Float32Array(128*128);
  for(let y=28;y<116;y++)for(let x=Math.round(64-bodyWidth/2);x<64+bodyWidth/2;x++)data[y*128+x]=1;
  return {width:128,height:128,data};
}
function landmarks():Landmark[]{
  const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
  for(const [i,point] of [[11,torso().rig!.leftShoulder],[12,torso().rig!.rightShoulder],[23,torso().rig!.leftHip],[24,torso().rig!.rightHip]] as const)p[i]={x:point.x/128,y:point.y/128,z:0,visibility:1};
  return p;
}

test('silhouette distinguishes bodies with identical shoulders, rejecting arm joins and bad masks',()=>{
  const slim=silhouetteWidths(mask(44),torso(),128,128)!,broad=silhouetteWidths(mask(72),torso(),128,128)!;
  for(const key of ['chest','waist','hips'] as const)assert.ok(broad[key]!>slim[key]!);
  assert.equal(silhouetteWidths(mask(128),torso(),128,128),undefined);
  assert.equal(silhouetteWidths({...mask(44),data:new Float32Array(4)},torso(),128,128),undefined);
  const crossed=torso();crossed.rig!.leftElbow={x:64,y:48};crossed.rig!.leftWrist={x:64,y:110};
  assert.equal(silhouetteWidths(mask(72),crossed,128,128),undefined);
  const cropped=torso();delete cropped.rig!.leftWrist;
  assert.equal(silhouetteWidths(mask(72),cropped,128,128),undefined);
});

test('chest and waist measurements drive distinct anchors while shoulders and cuffs remain fixed',()=>{
  const a=jacketTargets({...torso(),body:{chest:46,waist:42,hips:44}})!.points;
  const b=jacketTargets({...torso(),body:{chest:74,waist:66,hips:68}})!.points;
  assert.deepEqual(a.slice(0,2),b.slice(0,2));assert.deepEqual(a.slice(4,10),b.slice(4,10));
  assert.ok(b[11].x-b[10].x>a[11].x-a[10].x);assert.ok(b[13].x-b[12].x>a[13].x-a[12].x);
});

test('One-Euro filters suppress jitter, accelerate on motion and reset after a gap',()=>{
  const adaptive=new OneEuro(),fixed=new OneEuro();adaptive.update(0,1);fixed.update(0,1);
  const a=adaptive.update(100,34,.01),b=fixed.update(100,34,0);assert.ok(a>b&&a<100);
  const jitter=new OneEuro();jitter.update(100,1);
  assert.ok(Math.abs(jitter.update(100.5,34)-100)<.5);
  assert.equal(jitter.update(200,600),200);
  const smoother=new PoseSmoother();smoother.update({...torso(),body:{chest:60}},1);
  const missing=torso();delete missing.rig!.leftWrist;
  const result=smoother.update(missing,34);assert.equal(result.rig!.leftWrist,undefined);assert.equal(result.body,undefined);
});

test('world plane normal handles modest yaw/pitch and rejects degenerate or uncertain data',()=>{
  const world=landmarks();world[11]={x:-.2,y:0,z:0};world[12]={x:.2,y:0,z:0};world[23]={x:-.15,y:.5,z:0};world[24]={x:.15,y:.5,z:0};
  const flat=worldOrientation(world)!;assert.ok(Math.abs(flat.yaw)<1e-9&&Math.abs(flat.pitch)<1e-9);
  world[12].z=.1;assert.ok(Math.abs(worldOrientation(world)!.yaw)>.1);
  world[23].z=.15;world[24].z=.15;assert.ok(Math.abs(worldOrientation(world)!.pitch)>.1);
  world[11].visibility=.1;assert.equal(worldOrientation(world),undefined);
  assert.equal(worldOrientation(Array(33).fill({x:0,y:0,z:0})),undefined);
});

test('frame masks fall back on read failure and are released once, including tracking loss',()=>{
  let closed=0;
  const frame:TrackingFrame={landmarks:[landmarks()],segmentationMasks:[{width:128,height:128,getAsFloat32Array(){throw Error('unavailable');},close(){closed++;}}]};
  assert.ok(prepareTorso(frame,128,128));assert.equal(frame.mask,undefined);releaseFrame(frame);releaseFrame(frame);assert.equal(closed,1);
  const lost:TrackingFrame={landmarks:[],segmentationMasks:[{width:128,height:128,getAsFloat32Array(){throw Error('must not read');},close(){closed++;}}]};
  assert.equal(prepareTorso(lost,128,128),null);releaseFrame(lost);assert.equal(closed,2);
});

test('occlusion accepts only matched forward hands and requires a current body mask',()=>{
  const p=landmarks();p[15]={x:.5,y:.6,z:-.12,visibility:1};
  const hand=Array.from({length:21},(_,i)=>({x:.5+(i%5)*.012,y:.6-Math.floor(i/5)*.012,z:0}));
  const frame:TrackingFrame={landmarks:[p],hands:[hand],mask:mask(72)};
  assert.equal(foregroundHands(frame,torso(),128,128).length,1);
  p[15].z=.2;assert.equal(foregroundHands(frame,torso(),128,128).length,0);
  p[15].z=-.12;p[15].visibility=.1;assert.equal(foregroundHands(frame,torso(),128,128).length,0);
  p[15].visibility=1;frame.mask=undefined;assert.equal(foregroundHands(frame,torso(),128,128).length,0);
});

test('hand startup is optional and late hand models close after camera shutdown',async()=>{
  let complete!:(value:{detectForVideo:()=>{landmarks:Landmark[][]};close:()=>void})=>void,poses=0,hands=0;
  const pose={detectForVideo:()=>({landmarks:[landmarks()]}),close:()=>poses++};
  const tracker=combineTrackers(pose,()=>new Promise(resolve=>{complete=resolve;}));
  await Promise.resolve();assert.equal(tracker.detectForVideo({} as HTMLVideoElement,1).landmarks.length,1);
  tracker.close();tracker.close();complete({detectForVideo:()=>({landmarks:[]}),close:()=>hands++});
  assert.equal(await tracker.handReady,false);assert.equal(poses,1);assert.equal(hands,1);
  const failed=combineTrackers(pose,async()=>{throw Error('model unavailable');});
  assert.equal(await failed.handReady,false);assert.equal(failed.detectForVideo({} as HTMLVideoElement,2).landmarks.length,1);failed.close();
});
