import { garmentInfluences } from './garment-shape';
import type { Point, Torso } from './pose';
import { jacketTargets, profiles } from './garment-mesh';

export interface PreviewAdjustment { width: number; length: number }
export const neutralAdjustment = (): PreviewAdjustment => ({ width: 1, length: 1 });
export function boundedAdjustment(value: PreviewAdjustment): PreviewAdjustment {
  const clamp = (n: number) => Number.isFinite(n) ? Math.max(.85, Math.min(1.15, n)) : 1;
  return { width: clamp(value.width), length: clamp(value.length) };
}

// Sample-specific, approximate anchors. An artist-authored rig should replace these.
export const modelAnchors = profiles.cafe;

/** Isolate the supplied stand collar from the shoulder/chest panel. */
export function collarWeight(v: Point): number {
  const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};
  return smooth((.10-v.y)/.10)*smooth((.19-Math.abs(v.x-.5))/.05);
}

export function prominentCollarPoint(v: Point): Point {
  // Expand vertically around its base rather than enlarging the neck opening.
  // The smooth falloff avoids a seam or a hard crease at the chest transition.
  return {x:v.x,y:v.y-.15*collarWeight(v)};
}

export function roundedShoulderPoint(v: Point): Point {
  const t=Math.max(0,Math.min(1,(Math.abs(v.x-.5)-.10)/.25));
  const cap=t*t*(3-2*t),fade=Math.max(0,1-v.y/.35);
  return {x:v.x,y:v.y+.10*cap*fade*fade};
}

export function influences(v: Point, source: Point[] = modelAnchors): number[] {
  return garmentInfluences(v,source);
}

/** Front-facing ellipsoidal chest, blended into the supplied mesh at neck/waist.
 * This is a visual shape prior for this sample, not an inferred body measurement.
 */
export function roundedChestDepth(x: number, y: number, originalDepth: number, span: number): number {
  const across=(x-.5)/.32;
  const fade=Math.max(0,1-((y-.38)/.30)**2)*Math.max(0,1-across**2);
  const volume=span*.16*Math.sqrt(Math.max(0,1-across**2));
  // Preserve which side of the jacket the vertex belongs to, plus surface detail.
  const side=originalDepth<0?-1:1;
  return originalDepth+side*volume*fade;
}

export function adaptiveTargets(torso: Torso, adjustment = neutralAdjustment()) {
  const target=jacketTargets(torso);
  if(!target || Math.abs(torso.yaw??0)>.35)return null;
  const r=torso.rig!;
  // Hide unsupported crossed-arm poses instead of folding the mesh through itself.
  if((r.leftWrist && r.leftWrist.x>r.rightShoulder.x) || (r.rightWrist && r.rightWrist.x<r.leftShoulder.x))return null;
  const a=boundedAdjustment(adjustment), cx=(r.leftShoulder.x+r.rightShoulder.x)/2, cy=(r.leftShoulder.y+r.rightShoulder.y)/2;
  const cos=Math.cos(torso.angle),sin=Math.sin(torso.angle);
  const points=target.points.map(p=>{
    const x=(p.x-cx)*cos+(p.y-cy)*sin,y=-(p.x-cx)*sin+(p.y-cy)*cos;
    return {x:cx+x*a.width*cos-y*a.length*sin,y:cy+x*a.width*sin+y*a.length*cos};
  });
  return {...target,points};
}
