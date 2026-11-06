import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jacketMesh,jacketTargets,partPoint,profiles} from '../storefront/live-ar/garment-mesh';
import {hipFrame,PoseSmoother,type Torso} from '../storefront/live-ar/pose';
import {GarmentRenderer} from '../storefront/live-ar/engine';

const pose=():Torso=>({x:320,y:300,width:256,height:354,angle:0,body:{chest:210,waist:170,hips:230},rig:{
  leftShoulder:{x:220,y:120},rightShoulder:{x:420,y:120},leftHip:{x:240,y:420},rightHip:{x:400,y:420},
  leftElbow:{x:180,y:260},rightElbow:{x:460,y:260},leftWrist:{x:160,y:410},rightWrist:{x:480,y:410},
}});
const near=(a:{x:number;y:number},b:{x:number;y:number})=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-6,`${JSON.stringify(a)} != ${JSON.stringify(b)}`);

test('straight default has equal shoulder-to-hem width with no waist pinch or lower flare',()=>{
  for(const profile of ['open','open_brown'])for(const hipY of [320,420,560])for(const measuredWidth of [130,230,290]){
    const t=pose();t.rig!.leftHip.y=t.rig!.rightHip.y=hipY;t.body={chest:measuredWidth,waist:measuredWidth,hips:measuredWidth};
    t.rig!.leftHip.x+=35;t.rig!.rightHip.x+=35;
    const target=jacketTargets(t,profile)!.points,source=profiles[profile],mesh=jacketMesh(profile).find(p=>p.part==='body')!;
    const dx=target[1].x-target[0].x,dy=target[1].y-target[0].y;
    const top={x:(target[0].x+target[1].x)/2,y:(target[0].y+target[1].y)/2},hips=hipFrame(t)!.center;
    for(let i=0;i<mesh.vertices.length;i+=11){
      const l=mesh.vertices[i],r=mesh.vertices[i+10];if(l.y<source[0].y||l.y>source[2].y)continue;
      const left=partPoint(l,profile,target,'body'),right=partPoint(r,profile,target,'body');
      near({x:right.x-left.x,y:right.y-left.y},{x:dx,y:dy});
      const f=(l.y-source[0].y)/(source[2].y-source[0].y);
      near({x:(left.x+right.x)/2,y:(left.y+right.y)/2},{x:top.x+(hips.x-top.x)*f,y:top.y+(hips.y-top.y)*f});
    }
  }
});

test('dynamic torso length places the artwork hem at the hips on shorter and taller bodies',()=>{
  for(const profile of ['open','open_brown'])for(const y of [320,420,560]){
    const t=pose();t.rig!.leftHip.y=t.rig!.rightHip.y=y;const target=jacketTargets(t,profile)!.points;
    near(partPoint({x:.5,y:profiles[profile][2].y},profile,target,'body'),hipFrame(t)!.center);
    const top=partPoint({x:.5,y:profiles[profile][0].y},profile,target,'body');
    assert.ok(y>top.y);
  }
});

test('production renderer holds front panels during arm movement and recalibrates steady body width without taper',async()=>{
  const previous=globalThis.Image;
  globalThis.Image=class {naturalWidth=1280;naturalHeight=1280;async decode(){}} as unknown as typeof Image;
  try{for(const profile of ['open','open_brown']){
    let transforms:number[][]=[];
    const context={clearRect(){},save(){},restore(){},beginPath(){},closePath(){},clip(){},moveTo(){},lineTo(){},drawImage(){},transform(...m:number[]){transforms.push(m);}};
    const canvas={width:640,height:480,dataset:{},getContext:()=>context} as unknown as HTMLCanvasElement;
    const renderer=new GarmentRenderer(canvas);await renderer.load('/fixture.png',profile);
    const bodyCount=jacketMesh(profile).find(p=>p.part==='body')!.triangles.length;
    renderer.draw(pose());const original=transforms.slice(-bodyCount);
    assert.equal(original.length,bodyCount);
    for(const measured of [undefined,{hips:290,chest:290},{hips:130,chest:140}]){
      const t=pose();t.body=measured;t.rig!.leftElbow={x:100,y:200};t.rig!.leftWrist={x:50,y:120};
      transforms=[];renderer.draw(t);assert.deepEqual(transforms.slice(-bodyCount),original);
    }
    // A stable, neutral pose may adjust the entire straight body width.
    for(let frame=0;frame<50;frame++){const t=pose();t.body={hips:260,chest:260};transforms=[];renderer.draw(t,undefined,undefined,1000+frame*50);}
    assert.notDeepEqual(transforms.slice(-bodyCount),original);
    assert.ok(Number(canvas.dataset.previewWidth)>1.1);
    const adapted=transforms.slice(-bodyCount),t=pose();t.rig!.leftElbow={x:100,y:200};t.rig!.leftWrist={x:50,y:120};
    t.body={hips:150,chest:150};transforms=[];renderer.draw(t,undefined,undefined,4000);
    assert.deepEqual(transforms.slice(-bodyCount),adapted,'arm movement cannot shrink calibrated body panels');
    renderer.resetTracking();transforms=[];renderer.draw(pose(),undefined,undefined,5000);assert.deepEqual(transforms.slice(-bodyCount),original);
    renderer.dispose();
  }}finally{globalThis.Image=previous;}
});

test('both image jackets keep every body vertex and the opposite sleeve fixed during arm movement',()=>{
  for(const profile of ['open','open_brown'])for(const side of ['left','right','both']){
    const rest=pose(),moved=pose(),r=moved.rig!;
    if(side!=='right'){r.leftElbow={x:110,y:160};r.leftWrist={x:100,y:50};}
    if(side!=='left'){r.rightElbow={x:530,y:160};r.rightWrist={x:550,y:60};}
    const a=jacketTargets(rest,profile)!.points,b=jacketTargets(moved,profile)!.points;
    for(const patch of jacketMesh(profile)){
      let moving=0;
      for(const v of patch.vertices){
        const before=partPoint(v,profile,a,patch.part),after=partPoint(v,profile,b,patch.part);
        assert.ok(Number.isFinite(after.x)&&Number.isFinite(after.y));assert.ok(Math.abs(after.x)<2000&&Math.abs(after.y)<2000);
        if(patch.part==='body'||(side!=='both'&&patch.part!==side))near(before,after);
        else if(Math.hypot(after.x-before.x,after.y-before.y)>20)moving++;
      }
      if(patch.part!=='body'&&(side==='both'||patch.part===side))assert.ok(moving>40);
      for(const triangle of patch.triangles)assert.ok(triangle.every(i=>i>=0&&i<patch.vertices.length));
    }
  }
});

test('wrist-only movement leaves each upper sleeve fixed and the elbow/cuff land on their own joints',()=>{
  for(const profile of ['open','open_brown'])for(const side of ['left','right'] as const){
    const original=pose(),moved=pose();moved.rig![side==='left'?'leftWrist':'rightWrist']={x:side==='left'?100:540,y:170};
    const a=jacketTargets(original,profile)!.points,b=jacketTargets(moved,profile)!.points;
    const source=profiles[profile],elbow=side==='left'?4:5,wrist=side==='left'?6:7;
    for(const v of jacketMesh(profile).find(p=>p.part===side)!.vertices)if(v.y<source[elbow].y-.035)near(partPoint(v,profile,a,side),partPoint(v,profile,b,side));
    near(partPoint(source[elbow],profile,b,side),b[elbow]);near(partPoint(source[wrist],profile,b,side),b[wrist]);
    const y=source[elbow].y-.035,p={x:source[elbow].x+.03,y};
    const below=partPoint({...p,y:y+1e-7},profile,b,side),above=partPoint({...p,y:y-1e-7},profile,b,side);
    assert.ok(Math.hypot(below.x-above.x,below.y-above.y)<.001);
  }
});

test('jacket lower anchors use actual hip centers and ignore waist silhouette width',()=>{
  for(const profile of ['open','open_brown']){
    const t=pose(),waist=hipFrame(t)!,a=jacketTargets(t,profile)!.points;
    assert.equal(waist.center.y,420);assert.equal(waist.width,230);
    assert.equal((a[12].y+a[13].y)/2,waist.center.y);
    assert.ok(a[2].y>waist.center.y);
    const hipChanged=pose();hipChanged.body!.waist=400;
    assert.deepEqual(jacketTargets(hipChanged,profile)!.points,a);
    const broad=pose();broad.body!.hips=240;const b=jacketTargets(broad,profile)!.points;
    assert.ok(b[3].x-b[2].x>a[3].x-a[2].x);assert.deepEqual(a.slice(4,10),b.slice(4,10));
    delete t.body;assert.ok(Number.isFinite(jacketTargets(t,profile)!.points[2].x));
  }
});

test('hip anchor follows smoothed references and tilted bodies without arm-dependent offsets',()=>{
  const original=pose(),filter=new PoseSmoother();filter.update(original,1);
  const moved=pose();moved.rig!.leftHip.y+=10;moved.rig!.rightHip.y+=10;
  const smoothed=hipFrame(filter.update(moved,34))!,raw=hipFrame(moved)!;
  assert.ok(smoothed.center.y>hipFrame(original)!.center.y&&smoothed.center.y<raw.center.y);
  const angle=.22,scale=1.3,transform=({x,y}:{x:number;y:number})=>({x:30+scale*(x*Math.cos(angle)-y*Math.sin(angle)),y:40+scale*(x*Math.sin(angle)+y*Math.cos(angle))});
  const tilted=pose();tilted.angle=angle;tilted.width*=scale;tilted.height*=scale;
  for(const key of Object.keys(tilted.rig!) as (keyof NonNullable<Torso['rig']>)[])tilted.rig![key]=transform(tilted.rig![key]!);
  tilted.body={chest:210*scale,waist:170*scale,hips:230*scale};
  for(const profile of ['open','open_brown']){
    const a=jacketTargets(original,profile)!.points,b=jacketTargets(tilted,profile)!.points;
    a.forEach((p,i)=>near(transform(p),b[i]));
  }
});
