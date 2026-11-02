import { OneEuro } from './one-euro';
import type { BodyWidths } from './body-mask';
export interface Landmark { x: number; y: number; z?: number; visibility?: number }
export interface Point { x: number; y: number }
export interface Rig { leftShoulder: Point; rightShoulder: Point; leftHip: Point; rightHip: Point; leftElbow?: Point; rightElbow?: Point; leftWrist?: Point; rightWrist?: Point }
export interface Torso { x: number; y: number; width: number; height: number; angle: number; yaw?: number; pitch?: number; body?: Partial<BodyWidths>; rig?: Rig }

export function torsoFromPose(points: Landmark[], width: number, height: number, world?: Landmark[]): Torso | null {
  const anchors = [11, 12, 23, 24].map(index => points[index]);
  if (width <= 0 || height <= 0 || anchors.some(p => !p || !Number.isFinite(p.x) ||
    !Number.isFinite(p.y) || (p.visibility ?? 0) < 0.65 || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return null;
  const [a, b, c, d] = anchors;
  const [left, right] = a.x < b.x ? [a, b] : [b, a];
  const shoulderWidth = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height);
  const topX = (a.x + b.x) * width / 2, topY = (a.y + b.y) * height / 2;
  const hipX = (c.x + d.x) * width / 2, hipY = (c.y + d.y) * height / 2;
  const torsoHeight = Math.hypot(hipX - topX, hipY - topY);
  const angle = Math.atan2((right.y - left.y) * height, (right.x - left.x) * width);
  // Reject profile views, inverted or severely cropped bodies instead of inventing alignment.
  if (shoulderWidth < width * 0.08 || torsoHeight < height * 0.12 || hipY <= topY ||
      shoulderWidth / torsoHeight < 0.45 || Math.abs(angle) > Math.PI / 4) return null;
  const point = (index: number): Point | undefined => {
    const p = points[index];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= 0.65 && p.x >= -0.15 && p.x <= 1.15 && p.y >= -0.15 && p.y <= 1.15 ? { x: p.x * width, y: p.y * height } : undefined;
  };
  const first = a.x < b.x ? 11 : 12, second = first === 11 ? 12 : 11;
  const orientation = worldOrientation(world, first, second);
  return { x: topX + (hipX - topX) * 0.48, y: topY + (hipY - topY) * 0.48,
    width: shoulderWidth * 1.28, height: torsoHeight * 1.18, angle,
    yaw: Math.max(-.6,Math.min(.6,-Math.atan2(((Number.isFinite(points[first].z)?points[first].z!:0)-(Number.isFinite(points[second].z)?points[second].z!:0))*width,shoulderWidth))),
    ...orientation,
    rig: { leftShoulder: point(first)!, rightShoulder: point(second)!, leftHip: point(first + 12)!, rightHip: point(second + 12)!,
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
    if(value.rig){result.rig={...value.rig};for(const key of Object.keys(value.rig) as (keyof Rig)[]){const p=value.rig[key];if(p)result.rig[key]={x:sample(key+'.x',p.x,beta),y:sample(key+'.y',p.y,beta)};}}
    if(value.body){result.body={};for(const key of ['chest','waist','hips'] as const){const n=value.body[key];if(n!==undefined)result.body[key]=sample('body.'+key,n,beta*.4);}}
    for(const key of this.filters.keys())if(!seen.has(key))this.filters.delete(key);
    return result;
  }
}
