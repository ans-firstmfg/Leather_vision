import type { Point, Torso } from "./pose";
import { garmentInfluences } from './garment-shape';

// Normalized joints measured on the prepared sample textures, rather than the PNG bounds.
export const profiles: Record<string, Point[]> = {
  flame: [{x:.25,y:.16},{x:.75,y:.16},{x:.30,y:.84},{x:.70,y:.84},{x:.17,y:.50},{x:.83,y:.50},{x:.15,y:.88},{x:.85,y:.88}],
  raider: [{x:.25,y:.16},{x:.73,y:.16},{x:.30,y:.84},{x:.73,y:.84},{x:.17,y:.50},{x:.85,y:.50},{x:.24,y:.90},{x:.86,y:.86}],
  cafe: [{x:.25,y:.20},{x:.75,y:.20},{x:.29,y:.90},{x:.71,y:.90},{x:.13,y:.55},{x:.87,y:.55},{x:.12,y:.95},{x:.88,y:.95}],
  brown: [{x:.25,y:.21},{x:.75,y:.21},{x:.29,y:.88},{x:.71,y:.88},{x:.14,y:.55},{x:.86,y:.55},{x:.10,y:.96},{x:.90,y:.96}],
  trucker: [{x:.25,y:.20},{x:.75,y:.20},{x:.29,y:.91},{x:.71,y:.91},{x:.13,y:.55},{x:.87,y:.55},{x:.12,y:.96},{x:.88,y:.96}],
};
for (const profile of Object.values(profiles)) profile.push({x:.42,y:.04},{x:.58,y:.04});
for(const profile of Object.values(profiles))for(const t of [.30,.65])profile.push(
  {x:profile[0].x+(profile[2].x-profile[0].x)*t,y:profile[0].y+(profile[2].y-profile[0].y)*t},
  {x:profile[1].x+(profile[3].x-profile[1].x)*t,y:profile[1].y+(profile[3].y-profile[1].y)*t});

/** Reuse upper-panel stabilization for every image-based jacket. Preserve its collar style. */
export function jacketShapePoint(v: Point, profile: string): Point {
  const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
  const shoulder=smooth((Math.abs(v.x-.5)-.10)/.25)*Math.max(0,1-v.y/.35)**2;
  const collar=(profile==='cafe'||profile==='brown'||profile==='flame'||profile==='raider') ? smooth((.10-v.y)/.10)*smooth((.19-Math.abs(v.x-.5))/.05) : 0;
  return {x:v.x,y:v.y+.035*shoulder-.06*collar};
}

export function jacketPoint(v: Point, profile: string, target: Point[]): Point {
  const w=garmentInfluences(jacketShapePoint(v,profile),profiles[profile]??profiles.cafe);
  return {x:w.reduce((sum,n,i)=>sum+n*target[i].x,0),y:w.reduce((sum,n,i)=>sum+n*target[i].y,0)};
}

export function jacketTargets(torso: Torso): { points: Point[]; complete: boolean } | null {
  const r = torso.rig;
  if (!r) return null;
  const dx = r.rightShoulder.x - r.leftShoulder.x, dy = r.rightShoulder.y - r.leftShoulder.y;
  const span = Math.hypot(dx, dy), ux = dx / span, uy = dy / span;
  if (!span) return null;
  const offset = (p: Point, across: number, down = 0) => ({ x: p.x + ux * across - uy * down, y: p.y + uy * across + ux * down });
  // Pose shoulder joints sit inside the upper arm, below the garment's shoulder
  // seam. Lift along the body axis so the jacket covers the actual shoulder cap.
  const shoulderLeft = offset(r.leftShoulder, -span * .055, -span * .10), shoulderRight = offset(r.rightShoulder, span * .055, -span * .10);
  const hipCenter = {x:(r.leftHip.x+r.rightHip.x)/2,y:(r.leftHip.y+r.rightHip.y)/2};
  const hipSpan = torso.body?.hips ?? Math.max(Math.hypot(r.rightHip.x-r.leftHip.x,r.rightHip.y-r.leftHip.y),span*.82);
  const leftHip = offset(hipCenter,-hipSpan*.54,torso.height*.025-span*.035), rightHip = offset(hipCenter,hipSpan*.54,torso.height*.025-span*.035);
  const elbowLeft = r.leftElbow ?? offset(shoulderLeft,-span*.10,torso.height*.48);
  const elbowRight = r.rightElbow ?? offset(shoulderRight,span*.10,torso.height*.48);
  const wristLeft = r.leftWrist ?? offset(elbowLeft,0,torso.height*.42);
  const wristRight = r.rightWrist ?? offset(elbowRight,0,torso.height*.42);
  // Collar height follows shoulder span, not torso length, to avoid stretching onto the face.
  const neck = {x:(r.leftShoulder.x+r.rightShoulder.x)/2,y:(r.leftShoulder.y+r.rightShoulder.y)/2};
  const points=[shoulderLeft,shoulderRight,leftHip,rightHip,elbowLeft,elbowRight,wristLeft,wristRight,offset(neck,-span*.17,-span*.30),offset(neck,span*.17,-span*.30)];
  for(const [key,t] of [['chest',.30],['waist',.65]] as const){
    const left={x:shoulderLeft.x+(leftHip.x-shoulderLeft.x)*t,y:shoulderLeft.y+(leftHip.y-shoulderLeft.y)*t};
    const right={x:shoulderRight.x+(rightHip.x-shoulderRight.x)*t,y:shoulderRight.y+(rightHip.y-shoulderRight.y)*t};
    const measured=torso.body?.[key];
    if(measured!==undefined){const center={x:(left.x+right.x)/2,y:(left.y+right.y)/2};points.push(offset(center,-measured*.54),offset(center,measured*.54));}
    else points.push(left,right);
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

export function drawJacket(context: CanvasRenderingContext2D, image: HTMLImageElement, torso: Torso, profile: string): boolean {
  const target=jacketTargets(torso);
  if(!target)return false;
  const span=torso.width/1.28;
  const destination=vertices.map(v=>{
    const p=jacketPoint(v,profile,target.points);
    const depth=span*.10*Math.max(0,1-((v.x-.5)/.35)**2)*Math.max(0,1-((v.y-.4)/.5)**2);
    return {x:p.x+depth*Math.sin(torso.yaw??0),y:p.y+depth*Math.sin(torso.pitch??0)};
  });
  const iw=image.naturalWidth,ih=image.naturalHeight;
  for(const indices of triangles) {
    const p=indices.map(i=>({x:vertices[i].x*iw,y:vertices[i].y*ih})),q=indices.map(i=>destination[i]);
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
  return target.complete;
}
