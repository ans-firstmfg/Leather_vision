import type {Landmark} from './pose';
import type {BodyMask} from './body-mask';
import type {TrackingFrame} from './tracking';

export const dimensions=['chest','waist','hips'] as const;
export type Measurements=Record<typeof dimensions[number],number>;
export interface SizeRow {label:string;chest:[number,number];waist:[number,number];hips:[number,number]}
export interface SizeChart {kind:'body_cm';sizes:SizeRow[]}
export function parseChart(raw:string):SizeChart|undefined {
  try{
    const value=JSON.parse(raw);
    if(value?.kind!=='body_cm'||!Array.isArray(value.sizes)||!value.sizes.length||value.sizes.length>30)return;
    const labels=new Set<string>();
    for(const row of value.sizes){
      if(typeof row.label!=='string'||!row.label.trim()||row.label.length>40||labels.has(row.label))return;
      labels.add(row.label);
      for(const key of dimensions){const r=row[key];if(!Array.isArray(r)||r.length!==2||!r.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=30&&n<=250)||r[0]>=r[1])return;}
    }
    return value;
  }catch{return;}
}
export function validMeasurements(m:Measurements):boolean {
  return dimensions.every(k=>Number.isFinite(m[k])&&m[k]>=40&&m[k]<=220);
}
/** Charts describe BODY ranges, so no garment ease is added a second time. */
export function recommendSize(chart:SizeChart,m:Measurements,roomy=false,uncertainty=0):{labels:string[];between:boolean}|undefined {
  if(!validMeasurements(m)||!Number.isFinite(uncertainty)||uncertainty<0||uncertainty>10)return;
  const fits=chart.sizes.filter(s=>dimensions.every(k=>m[k]>=s[k][0]&&m[k]<=s[k][1]));
  if(!fits.length)return;
  // Only choose a roomier size that still contains all three measurements.
  const sorted=[...fits].sort((a,b)=>a.chest[1]-b.chest[1]||a.waist[1]-b.waist[1]);
  const best=roomy?sorted.at(-1)!:sorted[0];
  const near=uncertainty?chart.sizes.filter(s=>dimensions.every(k=>m[k]+uncertainty>=s[k][0]&&m[k]-uncertainty<=s[k][1])):[];
  const labels=[...new Set([best.label,...near.map(s=>s.label)])];
  return {labels,between:labels.length>1};
}

export interface ScanView {widths:Measurements;shoulderRatio:number}
const median=(xs:number[])=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const visible=(p:Landmark|undefined)=>!!p&&[p.x,p.y].every(Number.isFinite)&&(p.visibility??0)>=.7&&p.x>.025&&p.x<.975&&p.y>.025&&p.y<.975;

/** Experimental orthographic silhouette estimator, not a learned measurement model. */
export function scanView(frame:TrackingFrame,heightCm:number,width:number,height:number,sideOf?:ScanView):ScanView|undefined {
  if(heightCm<120||heightCm>220||!Number.isFinite(heightCm)||width<=0||height<=0||frame.landmarks.length!==1)return;
  const p=frame.landmarks[0];
  if(![0,11,12,23,24,25,26,27,28,29,30].every(i=>visible(p[i])))return;
  let mask:BodyMask|undefined=frame.mask;
  if(!mask){const m=frame.segmentationMasks?.[0];if(m)try{mask={width:m.width,height:m.height,data:m.getAsFloat32Array()};}catch{return;}}
  if(!mask||mask.width<32||mask.height<32||mask.data.length!==mask.width*mask.height)return;
  const {width:mw,height:mh,data}=mask;
  const probability=(x:number,y:number)=>data[Math.max(0,Math.min(mh-1,y))*mw+Math.max(0,Math.min(mw-1,x))]??0;
  const shoulder={x:(p[11].x+p[12].x)/2,y:(p[11].y+p[12].y)/2};
  const hip={x:(p[23].x+p[24].x)/2,y:(p[23].y+p[24].y)/2};
  const feet=(p[29].y+p[30].y)/2;
  if(hip.y<=shoulder.y||feet-hip.y<.18||Math.abs(hip.x-shoulder.x)*width>(hip.y-shoulder.y)*height*.15)return;
  for(const [h,k,a] of [[23,25,27],[24,26,28]])if(p[k].y-p[h].y<.08||p[a].y-p[k].y<.08)return;
  if(Math.abs(p[11].y-p[12].y)>.035||Math.abs(p[29].y-p[30].y)>.045)return;
  // Find crown only near the tracked head; hands raised above it cannot set scale.
  let crown=-1;
  const headX=Math.round(p[0].x*mw),headY=Math.round(p[0].y*mh);
  for(let y=Math.max(0,headY-Math.ceil(mh*.16));y<=headY;y++){
    let occupied=0;for(let x=headX-2;x<=headX+2;x++)if(probability(x,y)>.8)occupied++;
    if(occupied>=3){crown=y/mh;break;}
  }
  const bodyHeight=feet-crown;
  if(crown<.025||bodyHeight<.5||crown>=p[0].y||shoulder.y-crown<bodyHeight*.12||shoulder.y-crown>bodyHeight*.30)return;
  const cmPerY=heightCm/bodyHeight;
  const shoulderRatio=Math.hypot((p[11].x-p[12].x)*width/height,p[11].y-p[12].y)/bodyHeight;
  if(sideOf){if(shoulderRatio>sideOf.shoulderRatio*.60||shoulderRatio<.015)return;}
  else {
    if(shoulderRatio<.16||shoulderRatio>.35)return;
    // Arms apart and below shoulder: avoid including sleeves/forearms in torso widths.
    for(const [s,e,w] of [[11,13,15],[12,14,16]]){
      if(!visible(p[e])||!visible(p[w])||p[e].y<p[s].y+.04||Math.abs(p[w].x-hip.x)<Math.abs(p[s].x-shoulder.x)*1.15)return;
    }
  }
  const widths={} as Measurements;
  for(const [name,t] of [['chest',.30],['waist',.65],['hips',.95]] as const){
    const values:number[]=[];
    for(const delta of [-.02,0,.02]){
      const f=t+delta,cx=Math.round((shoulder.x+(hip.x-shoulder.x)*f)*mw),cy=Math.round((shoulder.y+(hip.y-shoulder.y)*f)*mh);
      if(probability(cx,cy)<.8)return;
      const edges:number[]=[];
      for(const direction of [-1,1]){
        let x=cx;
        while(x>1&&x<mw-2&&probability(x,cy)>=.6)x+=direction;
        if(x<=1||x>=mw-2)return;
        edges.push(x);
      }
      // Avoid pose arms crossing any sampled row, including the side view.
      for(const [a,b] of [[13,15],[14,16]]){
        if(!visible(p[a])||!visible(p[b]))return;
        const y=cy/mh,dy=p[b].y-p[a].y;
        if((p[a].y-y)*(p[b].y-y)<=0&&Math.abs(dy)>.001){
          const x=(p[a].x+(p[b].x-p[a].x)*(y-p[a].y)/dy)*mw;
          if(x>=edges[0]-2&&x<=edges[1]+2)return;
        }
      }
      values.push((edges[1]-edges[0])/mw*width/height*cmPerY);
    }
    widths[name]=median(values);
    if(widths[name]<(sideOf?8:18)||widths[name]>(sideOf?55:75))return;
  }
  return {widths,shoulderRatio};
}

export function combineViews(front:ScanView,side:ScanView):Measurements|undefined {
  const result={} as Measurements;
  for(const key of dimensions){
    const a=front.widths[key]/2,b=side.widths[key]/2;
    if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b/a<.35||b/a>1.15)return;
    result[key]=Math.PI*(3*(a+b)-Math.sqrt((3*a+b)*(a+3*b)));
  }
  return validMeasurements(result)?result:undefined;
}

export class StableScan {
  private samples:{at:number;view:ScanView}[]=[];
  reset(){this.samples=[];}
  update(view:ScanView|undefined,now:number):ScanView|undefined {
    if(!view||!Number.isFinite(now)){this.reset();return;}
    const last=this.samples.at(-1);if(last&&(now<=last.at||now-last.at>350))this.reset();
    this.samples.push({at:now,view});this.samples=this.samples.filter(s=>now-s.at<=3500).slice(-90);
    const keys=[...dimensions,'shoulderRatio'] as const;
    const value=(v:ScanView,k:typeof keys[number])=>k==='shoulderRatio'?v[k]:v.widths[k];
    for(const key of keys){const xs=this.samples.map(s=>value(s.view,key)),mid=median(xs);if(Math.max(...xs)-Math.min(...xs)>mid*.06){this.samples=[{at:now,view}];return;}}
    if(this.samples.length<15||now-this.samples[0].at<1200)return;
    const widths={} as Measurements;for(const key of dimensions)widths[key]=median(this.samples.map(s=>s.view.widths[key]));
    return {widths,shoulderRatio:median(this.samples.map(s=>s.view.shoulderRatio))};
  }
}
