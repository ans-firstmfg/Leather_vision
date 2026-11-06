import type { Point, Torso } from "./pose";
import {hipFrame} from './pose';
import { garmentInfluences, torsoInfluences } from './garment-shape';
import {neutralGrading,type SizeGrading} from './size-profiles';

// Normalized joints measured on the prepared sample textures, rather than the PNG bounds.
export const profiles: Record<string, Point[]> = {
  open: [{x:.23,y:.17},{x:.77,y:.17},{x:.32,y:.85},{x:.68,y:.85},{x:.15,y:.55},{x:.85,y:.55},{x:.14,y:.95},{x:.86,y:.95}],
  open_brown: [{x:.24,y:.17},{x:.76,y:.17},{x:.33,y:.88},{x:.67,y:.88},{x:.17,y:.55},{x:.83,y:.55},{x:.16,y:.96},{x:.84,y:.96}],
  flame: [{x:.25,y:.16},{x:.75,y:.16},{x:.30,y:.84},{x:.70,y:.84},{x:.17,y:.50},{x:.83,y:.50},{x:.15,y:.88},{x:.85,y:.88}],
  raider: [{x:.25,y:.16},{x:.73,y:.16},{x:.30,y:.84},{x:.73,y:.84},{x:.17,y:.50},{x:.85,y:.50},{x:.24,y:.90},{x:.86,y:.86}],
  cafe: [{x:.25,y:.20},{x:.75,y:.20},{x:.29,y:.90},{x:.71,y:.90},{x:.13,y:.55},{x:.87,y:.55},{x:.12,y:.95},{x:.88,y:.95}],
  brown: [{x:.25,y:.21},{x:.75,y:.21},{x:.29,y:.88},{x:.71,y:.88},{x:.14,y:.55},{x:.86,y:.55},{x:.10,y:.96},{x:.90,y:.96}],
  trucker: [{x:.25,y:.20},{x:.75,y:.20},{x:.29,y:.91},{x:.71,y:.91},{x:.13,y:.55},{x:.87,y:.55},{x:.12,y:.96},{x:.88,y:.96}],
};
for (const profile of Object.values(profiles)) profile.push({x:.42,y:.04},{x:.58,y:.04});
for(const profile of Object.values(profiles))for(const t of [.30,.85])profile.push(
  {x:profile[0].x+(profile[2].x-profile[0].x)*t,y:profile[0].y+(profile[2].y-profile[0].y)*t},
  {x:profile[1].x+(profile[3].x-profile[1].x)*t,y:profile[1].y+(profile[3].y-profile[1].y)*t});

/** Reuse upper-panel stabilization for every image-based jacket. Preserve its collar style. */
export function jacketShapePoint(v: Point, profile: string): Point {
  const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
  const shoulder=smooth((Math.abs(v.x-.5)-.10)/.25)*Math.max(0,1-v.y/.35)**2;
  const collar=(profile==='cafe'||profile==='brown'||profile==='flame'||profile==='raider') ? smooth((.10-v.y)/.10)*smooth((.19-Math.abs(v.x-.5))/.05) : 0;
  return {x:v.x,y:v.y+.035*shoulder-.06*collar};
}

export type JacketPart = 'body'|'left'|'right';
const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
/** Rest-image armholes and transparent underarm gaps, calibrated separately for
 * the two supplied PNGs. No triangle may span a torso/sleeve boundary. */
function sleeveSeam(y:number,profile:string):number {
  const brown=profile==='open_brown',s=profiles[profile],underarm=brown?.38:.32;
  if(y<=s[0].y)return s[0].x;
  if(y<underarm)return s[0].x+((brown?.245:.235)-s[0].x)*(y-s[0].y)/(underarm-s[0].y);
  return (brown?.245:.235)+((brown?.23:.195)-(brown?.245:.235))*Math.max(0,Math.min(1,(y-underarm)/(s[2].y-underarm)));
}
export function jacketPart(v:Point,profile:string):JacketPart {
  const seam=sleeveSeam(v.y,profile);return v.x<seam?'left':v.x>1-seam?'right':'body';
}
function bodyPoint(v:Point,source:Point[],target:Point[],profile:string):Point {
  if(v.y>=source[0].y){
    // Straight default: one shoulder-derived width all the way to the hem.
    // Normalize the artwork's changing outer bounds instead of tapering it
    // toward chest/waist/hip mask widths. Body center still follows posture.
    const top={x:(target[0].x+target[1].x)/2,y:(target[0].y+target[1].y)/2};
    const hips={x:(target[12].x+target[13].x)/2,y:(target[12].y+target[13].y)/2};
    const dx=target[1].x-target[0].x,dy=target[1].y-target[0].y;
    const t=(v.y-source[0].y)/(source[2].y-source[0].y);
    const across=(v.x-.5)/(1-2*sleeveSeam(v.y,profile));
    return {x:top.x+(hips.x-top.x)*t+dx*across,y:top.y+(hips.y-top.y)*t+dy*across};
  }
  const w=torsoInfluences(v,source);
  return {x:w.reduce((n,a,i)=>n+a*target[i].x,0),y:w.reduce((n,a,i)=>n+a*target[i].y,0)};
}
function limbPoint(v:Point,a:Point,b:Point,A:Point,B:Point,widthScale:number):Point {
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),t=((v.x-a.x)*dx+(v.y-a.y)*dy)/(len*len);
  const side=((v.y-a.y)*dx-(v.x-a.x)*dy)/len,tx=B.x-A.x,ty=B.y-A.y,L=Math.hypot(tx,ty);
  // Degenerate tracked segments use the source direction rather than exploding.
  const ux=L>1?tx/L:dx/len,uy=L>1?ty/L:dy/len;
  return {x:A.x+t*tx-side*widthScale*uy,y:A.y+t*ty+side*widthScale*ux};
}
export function partPoint(v:Point,profile:string,target:Point[],part:JacketPart):Point {
  const source=profiles[profile];
  if(part==='body')return bodyPoint(v.y<source[0].y?jacketShapePoint(v,profile):v,source,target,profile);
  const shoulder=part==='left'?0:1,elbow=part==='left'?4:5,wrist=part==='left'?6:7;
  const scale=Math.hypot(target[1].x-target[0].x,target[1].y-target[0].y)/(source[1].x-source[0].x);
  // Body anchors mark the inner shoulder seam. Sleeve axes run through the
  // fabric center instead, so a bent sleeve does not slide off the upper arm.
  const axisX=profile==='open_brown'?.205:.185;
  const sleeveShoulder={x:part==='left'?axisX:1-axisX,y:.20};
  const upper=limbPoint(v,sleeveShoulder,source[elbow],target[shoulder],target[elbow],scale*1.10);
  const lower=limbPoint(v,source[elbow],source[wrist],target[elbow],target[wrist],scale);
  const bend=smooth((v.y-source[elbow].y+.035)/.07);
  const arm={x:upper.x+(lower.x-upper.x)*bend,y:upper.y+(lower.y-upper.y)*bend};
  // Pin the shoulder cap to the body and release the sleeve below it. This
  // avoids opening a hole at the shoulder without letting arms pull the torso.
  const attach=smooth((v.y-source[shoulder].y)/.07);
  if(attach===1)return arm;
  const body=bodyPoint(jacketShapePoint(v,profile),source,target,profile);
  return {x:body.x+(arm.x-body.x)*attach,y:body.y+(arm.y-body.y)*attach};
}

export interface JacketPatch {part:JacketPart; vertices:Point[]; triangles:number[][]}
const meshes=new Map<string,JacketPatch[]>();
export function jacketMesh(profile:string):JacketPatch[] {
  let mesh=meshes.get(profile);if(mesh)return mesh;
  const ys=[...new Set([0,1,...Array.from({length:19},(_,i)=>i/18),profiles[profile][0].y,.32,.38,.40,.515,.55,.585,profiles[profile][2].y])].sort((a,b)=>a-b);
  mesh=(['left','right','body'] as JacketPart[]).map(part=>{
    const cols=part==='body'?10:4,vertices:Point[]=[],triangles:number[][]=[];
    for(const y of ys){const seam=sleeveSeam(y,profile),left=part==='left'?0:part==='right'?1-seam:seam,right=part==='left'?seam:part==='right'?1:1-seam;
      for(let x=0;x<=cols;x++)vertices.push({x:left+(right-left)*x/cols,y});}
    for(let y=0;y<ys.length-1;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;triangles.push([a,b,d],[a,d,c]);}
    return {part,vertices,triangles};
  });
  meshes.set(profile,mesh);return mesh;
}

export function jacketPoint(v: Point, profile: string, target: Point[]): Point {
  if(profile==='open'||profile==='open_brown')return partPoint(v,profile,target,jacketPart(v,profile));
  const w=garmentInfluences(jacketShapePoint(v,profile),profiles[profile]??profiles.cafe);
  return {x:w.reduce((sum,n,i)=>sum+n*target[i].x,0),y:w.reduce((sum,n,i)=>sum+n*target[i].y,0)};
}

export function jacketTargets(torso: Torso, profile = '',grading:SizeGrading=neutralGrading): { points: Point[]; complete: boolean } | null {
  const r = torso.rig;
  if (!r) return null;
  const dx = r.rightShoulder.x - r.leftShoulder.x, dy = r.rightShoulder.y - r.leftShoulder.y;
  const span = Math.hypot(dx, dy), ux = dx / span, uy = dy / span;
  if (!span) return null;
  const offset = (p: Point, across: number, down = 0) => ({ x: p.x + ux * across - uy * down, y: p.y + uy * across + ux * down });
  // Pose shoulder joints sit inside the upper arm, below the garment's shoulder
  // seam. Lift along the body axis so the jacket covers the actual shoulder cap.
  const visual=Number.isFinite(torso.previewWidth)?Math.max(.95,Math.min(1.35,torso.previewWidth!)):1;
  const coverage=span*(visual*grading.width*1.11-1)/2;
  const shoulderLeft = offset(r.leftShoulder, -coverage, -span * .10), shoulderRight = offset(r.rightShoulder, coverage, -span * .10);
  const hips=hipFrame(torso)!;
  // The open brown sample needs slightly more neck and hem coverage. Lengthen
  // only its body panel; shoulder seams, elbows and cuffs stay pose-anchored.
  const hemDrop=span*(profile==='open_brown'?.16:.10);
  const leftHem = offset(hips.center,-hips.width*.54,hemDrop), rightHem = offset(hips.center,hips.width*.54,hemDrop);
  const between=(a:Point,b:Point,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const elbowLeft = r.leftElbow ?? (r.leftWrist?between(shoulderLeft,r.leftWrist,.52):offset(shoulderLeft,-span*.10,torso.height*.48));
  const elbowRight = r.rightElbow ?? (r.rightWrist?between(shoulderRight,r.rightWrist,.52):offset(shoulderRight,span*.10,torso.height*.48));
  const wristLeft = r.leftWrist ?? between(shoulderLeft,elbowLeft,1.85);
  const wristRight = r.rightWrist ?? between(shoulderRight,elbowRight,1.85);
  // Collar height follows shoulder span, not torso length, to avoid stretching onto the face.
  const neck = {x:(r.leftShoulder.x+r.rightShoulder.x)/2,y:(r.leftShoulder.y+r.rightShoulder.y)/2};
  const collarRise=span*(profile==='open_brown'?.335:.30);
  const points=[shoulderLeft,shoulderRight,leftHem,rightHem,elbowLeft,elbowRight,wristLeft,wristRight,offset(neck,-span*.17,-collarRise),offset(neck,span*.17,-collarRise)];
  for(const [key,t] of [['chest',.30],['hips',1]] as const){
    const left={x:r.leftShoulder.x+(r.leftHip.x-r.leftShoulder.x)*t,y:r.leftShoulder.y+(r.leftHip.y-r.leftShoulder.y)*t};
    const right={x:r.rightShoulder.x+(r.rightHip.x-r.rightShoulder.x)*t,y:r.rightShoulder.y+(r.rightHip.y-r.rightShoulder.y)*t};
    const measured=torso.body?.[key];
    if(measured!==undefined){const center={x:(left.x+right.x)/2,y:(left.y+right.y)/2};points.push(offset(center,-measured*.54),offset(center,measured*.54));}
    else points.push(left,right);
  }
  const top={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
  for(const [a,b] of [[2,3],[10,11],[12,13]]){
    const cx=(points[a].x+points[b].x)/2,cy=(points[a].y+points[b].y)/2;
    for(const i of [a,b])points[i]={x:points[i].x+(cx-top.x)*(grading.length-1),y:points[i].y+(cy-top.y)*(grading.length-1)};
  }
  for(const [shoulder,elbow,wrist] of [[0,4,6],[1,5,7]]){
    if(grading.sleeve===1)continue;
    const a=points[shoulder],b=points[elbow],c=points[wrist],upper=Math.hypot(b.x-a.x,b.y-a.y),lower=Math.hypot(c.x-b.x,c.y-b.y);
    const scale=lower>1?Math.max(.4,Math.min(1.8,((upper+lower)*grading.sleeve-upper)/lower)):1;
    points[wrist]={x:b.x+(c.x-b.x)*scale,y:b.y+(c.y-b.y)*scale};
  }
  return { points,
    complete: !!(r.leftElbow && r.rightElbow && r.leftWrist && r.rightWrist) };
}

/** Weighted local affine warp: each garment joint lands exactly on its body joint. */
export function warpPoint(v: Point, source: Point[], target: Point[]): Point {
  const weights = source.map(p => 1 / Math.max(1e-10, ((p.x-v.x)**2+(p.y-v.y)**2)**2));
  let sum=0,px=0,py=0,qx=0,qy=0;
  for(let i=0;i<source.length;i++) {
    const w=weights[i]; sum+=w; px+=w*source[i].x; py+=w*source[i].y; qx+=w*target[i].x; qy+=w*target[i].y;
  }
  px/=sum;py/=sum;qx/=sum;qy/=sum;
  let xx=0,xy=0,yy=0,ax=0,ay=0,bx=0,by=0;
  for(let i=0;i<source.length;i++) {
    const w=weights[i], x=source[i].x-px,y=source[i].y-py,dx=target[i].x-qx,dy=target[i].y-qy;
    xx+=w*x*x;xy+=w*x*y;yy+=w*y*y;ax+=w*dx*x;ay+=w*dx*y;bx+=w*dy*x;by+=w*dy*y;
  }
  const determinant=xx*yy-xy*xy;
  if(Math.abs(determinant)<1e-15)return {x:qx,y:qy};
  const x=v.x-px,y=v.y-py;
  return {x:qx+((ax*yy-ay*xy)*x+(ay*xx-ax*xy)*y)/determinant,
    y:qy+((bx*yy-by*xy)*x+(by*xx-bx*xy)*y)/determinant};
}

// Reuse topology across frames; 240 clipped triangles instead of a full 3D renderer.
const columns=10,rows=12;
const vertices=Array.from({length:(columns+1)*(rows+1)},(_,i)=>({x:(i%(columns+1))/columns,y:Math.floor(i/(columns+1))/rows}));
const triangles: number[][]=[];
for(let y=0;y<rows;y++)for(let x=0;x<columns;x++) {
  const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;triangles.push([a,b,d],[a,d,c]);
}

export function drawJacket(context: CanvasRenderingContext2D, image: HTMLImageElement, torso: Torso, profile: string,grading:SizeGrading=neutralGrading): boolean {
  const target=jacketTargets(torso,profile,grading);
  if(!target)return false;
  const span=torso.width/1.28;
  const patches=profile==='open'||profile==='open_brown'?jacketMesh(profile):[{part:'body' as const,vertices,triangles}];
  for(const patch of patches){
  const destination=patch.vertices.map(v=>{
    const p=profile==='open'||profile==='open_brown'?partPoint(v,profile,target.points,patch.part):jacketPoint(v,profile,target.points);
    const depth=patch.part==='body'&&profile!=='open'&&profile!=='open_brown'?span*.10*Math.max(0,1-((v.x-.5)/.35)**2)*Math.max(0,1-((v.y-.4)/.5)**2):0;
    return {x:p.x+depth*Math.sin(torso.yaw??0),y:p.y+depth*Math.sin(torso.pitch??0)};
  });
  const iw=image.naturalWidth,ih=image.naturalHeight;
  for(const indices of patch.triangles) {
    const p=indices.map(i=>({x:patch.vertices[i].x*iw,y:patch.vertices[i].y*ih})),q=indices.map(i=>destination[i]);
    const sx=p[1].x-p[0].x,sy=p[1].y-p[0].y,tx=p[2].x-p[0].x,ty=p[2].y-p[0].y,det=sx*ty-sy*tx;
    const dx=q[1].x-q[0].x,dy=q[1].y-q[0].y,ex=q[2].x-q[0].x,ey=q[2].y-q[0].y;
    // Suppress folded/inverted patches in unsupported crossed-arm/profile poses.
    if(dx*ey-dy*ex<=.01)continue;
    const a=(dx*ty-ex*sy)/det,b=(dy*ty-ey*sy)/det,c=(ex*sx-dx*tx)/det,d=(ey*sx-dy*tx)/det;
    context.save();context.beginPath();
    const center={x:(q[0].x+q[1].x+q[2].x)/3,y:(q[0].y+q[1].y+q[2].y)/3};
    q.forEach((v,i)=>{const length=Math.hypot(v.x-center.x,v.y-center.y)||1;const x=v.x+(v.x-center.x)/length*.4,y=v.y+(v.y-center.y)/length*.4;i?context.lineTo(x,y):context.moveTo(x,y);});
    context.closePath();context.clip();context.transform(a,b,c,d,q[0].x-a*p[0].x-c*p[0].y,q[0].y-b*p[0].x-d*p[0].y);
    context.drawImage(image,0,0);context.restore();
  }
  }
  return target.complete;
}
