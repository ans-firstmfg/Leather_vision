import type { Point } from './pose';
export interface TorsoBand { left: number; right: number; seam: number }

/** Torso-only coefficients: never include elbow or wrist anchors, including at
 * the side panels. Affine extrapolation preserves rest geometry at the edges. */
export function torsoInfluences(v: Point, source: Point[]): number[] {
  const f=(v.y-source[0].y)/(source[2].y-source[0].y);
  const left=source[0].x*(1-f)+source[2].x*f,right=source[1].x*(1-f)+source[3].x*f,u=(v.x-left)/(right-left);
  let body=Array(source.length).fill(0);
  [body[0],body[1],body[2],body[3]]=[(1-f)*(1-u),(1-f)*u,f*(1-u),f*u];
  if(source.length>=14&&v.y>=source[0].y){
    const rows=[[0,1],[10,11],[12,13],[2,3]];
    let row=0;while(row<2&&v.y>source[rows[row+1][0]].y)row++;
    const [a,b]=rows[row],[c,d]=rows[row+1],t=(v.y-source[a].y)/(source[c].y-source[a].y);
    const lx=source[a].x*(1-t)+source[c].x*t,rx=source[b].x*(1-t)+source[d].x*t,across=(v.x-lx)/(rx-lx);
    body.fill(0);body[a]=(1-t)*(1-across);body[b]=(1-t)*across;body[c]=t*(1-across);body[d]=t*across;
  }
  if(v.y<source[0].y){
    const neck=(source[0].y-v.y)/(source[0].y-source[8].y),across=(v.x-.5)/(source[1].x-source[0].x);
    body.fill(0);body[0]=.5-across-neck*.5;body[1]=.5+across-neck*.5;body[8]=neck*.5;body[9]=neck*.5;
  }
  return body;
}

/** Precompute local affine influence coefficients once, outside the frame loop. */
export function garmentInfluences(v: Point, source: Point[], torsoBand?: TorsoBand): number[] {
  const exact = source.findIndex(p => Math.hypot(p.x-v.x,p.y-v.y)<1e-7);
  if (exact >= 0) return source.map((_,i) => Number(i===exact));
  const w=source.map(p=>1/Math.max(1e-10,((p.x-v.x)**2+(p.y-v.y)**2)**2));
  const sum=w.reduce((a,b)=>a+b,0);
  const px=source.reduce((n,p,i)=>n+w[i]*p.x,0)/sum, py=source.reduce((n,p,i)=>n+w[i]*p.y,0)/sum;
  let xx=0,xy=0,yy=0;
  source.forEach((p,i)=>{const x=p.x-px,y=p.y-py;xx+=w[i]*x*x;xy+=w[i]*x*y;yy+=w[i]*y*y;});
  const det=xx*yy-xy*xy;
  if(Math.abs(det)<1e-15)return w.map(n=>n/sum);
  const a=((v.x-px)*yy-(v.y-py)*xy)/det,b=((v.y-py)*xx-(v.x-px)*xy)/det;
  const result=source.map((p,i)=>w[i]*(1/sum+a*(p.x-px)+b*(p.y-py)));
  // Keep the torso tied to shoulders/hips, independent of moving sleeve anchors.
  // Blend only in the underarm seam band to keep the surface continuous.
  {
    let central=Math.max(0,Math.min(1,(Math.min(v.x,1-v.x)-.22)/.10));
    if(torsoBand){
      // Authored sample bounds cover the entire side panels, not just the center
      // chest. Fade outside the torso into the underarm gap, never across the hem.
      const t=Math.max(0,Math.min(1,1+Math.min(v.x-torsoBand.left,torsoBand.right-v.x)/torsoBand.seam));
      central=t*t*(3-2*t);
    }
    const upper=Math.max(0,Math.min(1,(.40-v.y)/.20));
    const blend=central+(1-central)*upper;
    const body=torsoInfluences(v,source);
    return result.map((n,i)=>n*(1-blend)+(body[i]??0)*blend);
  }
  return result;
}

