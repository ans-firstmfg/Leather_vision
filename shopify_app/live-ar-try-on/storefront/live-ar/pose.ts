import { OneEuro } from './one-euro';
import type { BodyWidths } from './body-mask';
export interface Landmark { x: number; y: number; z?: number; visibility?: number }
export interface Point { x: number; y: number }
export interface Rig { leftShoulder: Point; rightShoulder: Point; leftHip: Point; rightHip: Point; leftElbow?: Point; rightElbow?: Point; leftWrist?: Point; rightWrist?: Point }
export interface Torso { x: number; y: number; width: number; height: number; angle: number; yaw?: number; pitch?: number; neckClearance?: number; body?: Partial<BodyWidths>; rig?: Rig; previewWidth?:number; inferredHips?:boolean }

// Pose has no waist joint. Keep hips as confidence-checked references, and
// estimate the waist at the same row sampled by the silhouette width reader.
export const waistFraction = .65;
export function hipFrame(torso:Torso):{center:Point;width:number}|null {
  const r=torso.rig;if(!r)return null;
  return {center:{x:(r.leftHip.x+r.rightHip.x)/2,y:(r.leftHip.y+r.rightHip.y)/2},width:torso.body?.hips??Math.hypot(r.rightHip.x-r.leftHip.x,r.rightHip.y-r.leftHip.y)};
}
export function waistFrame(torso: Torso): {center: Point; width: number} | null {
  const r=torso.rig;if(!r)return null;
  const left={x:r.leftShoulder.x+(r.leftHip.x-r.leftShoulder.x)*waistFraction,y:r.leftShoulder.y+(r.leftHip.y-r.leftShoulder.y)*waistFraction};
  const right={x:r.rightShoulder.x+(r.rightHip.x-r.rightShoulder.x)*waistFraction,y:r.rightShoulder.y+(r.rightHip.y-r.rightShoulder.y)*waistFraction};
  return {center:{x:(left.x+right.x)/2,y:(left.y+right.y)/2},width:torso.body?.waist??Math.hypot(right.x-left.x,right.y-left.y)};
}

export function torsoFromPose(points: Landmark[], width: number, height: number, world?: Landmark[],previous?:Torso): Torso | null {
  const visible=(p:Landmark|undefined)=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??0)>=.65&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
  const a=points[11],b=points[12];
  if(width<=0||height<=0||!visible(a)||!visible(b))return null;
  const [left, right] = a.x < b.x ? [a, b] : [b, a];
  const shoulderWidth = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height);
  const topX = (a.x + b.x) * width / 2, topY = (a.y + b.y) * height / 2;
  const angle = Math.atan2((right.y - left.y) * height, (right.x - left.x) * width);
  const cos=Math.cos(angle),sin=Math.sin(angle),old=previous?.rig;
  // Reproject the last torso proportions from the current shoulders. On first
  // use, supply conservative upper-body proportions instead of requiring hips.
  const inferredHip=(side:'left'|'right'):Point=>{
    let across=side==='left'?-.35:.35,down=1.35;
    if(old){
      const ox=(old.leftShoulder.x+old.rightShoulder.x)/2,oy=(old.leftShoulder.y+old.rightShoulder.y)/2;
      const span=Math.hypot(old.rightShoulder.x-old.leftShoulder.x,old.rightShoulder.y-old.leftShoulder.y),p=side==='left'?old.leftHip:old.rightHip;
      if(span>1){const c=Math.cos(previous!.angle),s=Math.sin(previous!.angle);across=Math.max(-.75,Math.min(.75,((p.x-ox)*c+(p.y-oy)*s)/span));down=Math.max(.65,Math.min(2.1,(-(p.x-ox)*s+(p.y-oy)*c)/span));}
    }
    return {x:topX+shoulderWidth*(across*cos-down*sin),y:topY+shoulderWidth*(across*sin+down*cos)};
  };
  const first = a.x < b.x ? 11 : 12, second = first === 11 ? 12 : 11;
  const inferredHips=!visible(points[23])||!visible(points[24]);
  const leftHip=inferredHips?inferredHip('left'):{x:points[first+12].x*width,y:points[first+12].y*height};
  const rightHip=inferredHips?inferredHip('right'):{x:points[second+12].x*width,y:points[second+12].y*height};
  const hipX=(leftHip.x+rightHip.x)/2,hipY=(leftHip.y+rightHip.y)/2;
  const torsoHeight = Math.hypot(hipX - topX, hipY - topY);
  // Reject profile views, inverted or severely cropped bodies instead of inventing alignment.
  if (shoulderWidth < width * 0.08 || torsoHeight < height * 0.12 || hipY <= topY ||
      shoulderWidth / torsoHeight < 0.45 || Math.abs(angle) > Math.PI / 4) return null;
  const point = (index: number): Point | undefined => {
    const p = points[index];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= 0.65 && p.x >= -0.15 && p.x <= 1.15 && p.y >= -0.15 && p.y <= 1.15 ? { x: p.x * width, y: p.y * height } : undefined;
  };
  const orientation = inferredHips?undefined:worldOrientation(world, first, second);
  // Existing pose mouth points provide only a conservative clearance hint. The
  // collar remains torso-anchored; turning the head must not rotate the jacket.
  const mouths=[points[9],points[10]];
  let neckClearance: number | undefined;
  if(mouths.every(p=>p&&[p.x,p.y].every(Number.isFinite)&&(p.visibility??0)>=.8&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)){
    const mx=(mouths[0].x+mouths[1].x)*width/2-topX,my=(mouths[0].y+mouths[1].y)*height/2-topY;
    const across=mx*cos+my*sin,above=mx*sin-my*cos;
    if(Math.abs(across)<shoulderWidth*.30&&above>shoulderWidth*.20&&above<shoulderWidth*.80)
      neckClearance=Math.max(.25,Math.min(.38,above/shoulderWidth-.10));
  }
  return { x: topX + (hipX - topX) * 0.48, y: topY + (hipY - topY) * 0.48,
    width: shoulderWidth * 1.28, height: torsoHeight * 1.18, angle,
    neckClearance,inferredHips,
    yaw: Math.max(-.6,Math.min(.6,-Math.atan2(((Number.isFinite(points[first].z)?points[first].z!:0)-(Number.isFinite(points[second].z)?points[second].z!:0))*width,shoulderWidth))),
    ...orientation,
    rig: { leftShoulder: point(first)!, rightShoulder: point(second)!, leftHip, rightHip,
      leftElbow: point(first + 2), rightElbow: point(second + 2), leftWrist: point(first + 4), rightWrist: point(second + 4) } };
}

export function worldOrientation(world:Landmark[]|undefined,left=11,right=12):{yaw:number;pitch:number}|undefined {
  if(!world)return;
  const a=world[left],b=world[right],c=world[23],d=world[24];
  if([a,b,c,d].some(p=>!p||![p.x,p.y,p.z].every(Number.isFinite)||(p.visibility??1)<.65))return;
  const sx=b.x-a.x,sy=b.y-a.y,sz=b.z!-a.z!;
  const tx=(c.x+d.x-a.x-b.x)/2,ty=(c.y+d.y-a.y-b.y)/2,tz=(c.z!+d.z!-a.z!-b.z!)/2;
  let nx=sy*tz-sz*ty,ny=sz*tx-sx*tz,nz=sx*ty-sy*tx;
  if(Math.hypot(nx,ny,nz)<1e-5)return;
  if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
  return {yaw:-Math.atan2(nx,nz),pitch:Math.atan2(ny,Math.hypot(nx,nz))};
}

export class PoseSmoother {
  private filters=new Map<string,OneEuro>();
  reset(){this.filters.clear();}
  update(value:Torso,now:number):Torso {
    const seen=new Set<string>();
    const sample=(key:string,n:number,beta=.01)=>{seen.add(key);let f=this.filters.get(key);if(!f){f=new OneEuro();this.filters.set(key,f);}return f.update(n,now,beta);};
    const result={...value};
    const beta=.01*256/Math.max(32,value.width/1.28);
    for(const key of ['x','y','width','height','angle'] as const)result[key]=sample(key,value[key],key==='angle'?.8:beta);
    if(value.yaw!==undefined)result.yaw=sample('yaw',value.yaw,.8);
    if(value.pitch!==undefined)result.pitch=sample('pitch',value.pitch,.8);
    if(value.neckClearance!==undefined)result.neckClearance=sample('neckClearance',value.neckClearance,.4);
    if(value.rig){result.rig={...value.rig};for(const key of Object.keys(value.rig) as (keyof Rig)[]){const p=value.rig[key];if(p)result.rig[key]={x:sample(key+'.x',p.x,beta),y:sample(key+'.y',p.y,beta)};}}
    if(value.body){result.body={};for(const key of ['chest','waist','hips'] as const){const n=value.body[key];if(n!==undefined)result.body[key]=sample('body.'+key,n,beta*.4);}}
    for(const key of this.filters.keys())if(!seen.has(key))this.filters.delete(key);
    return result;
  }
}
