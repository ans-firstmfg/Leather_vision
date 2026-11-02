import type { Landmark,Torso,Point } from './pose';
import type { TrackingFrame } from './tracking';
import { maskProbability } from './body-mask';

/** Only a hand matched to a confident, visibly forward pose wrist may occlude. */
export function foregroundHands(frame:TrackingFrame,torso:Torso,width:number,height:number):Landmark[][] {
  if(!frame.mask||!torso.rig)return [];
  const pose=frame.landmarks[0],r=torso.rig,span=torso.width/1.28;
  if(!pose)return [];
  const shoulderY=(r.leftShoulder.y+r.rightShoulder.y)/2,hipY=(r.leftHip.y+r.rightHip.y)/2;
  const center=(r.leftShoulder.x+r.rightShoulder.x)/2;
  const depth=[11,12,23,24].map(i=>pose[i]?.z);
  if(!depth.every(Number.isFinite))return [];
  return (frame.hands??[]).filter(hand=>{
    if(hand.length!==21||hand.some(p=>![p.x,p.y].every(Number.isFinite)||p.x<0||p.x>1||p.y<0||p.y>1))return false;
    const extent=(Math.max(...hand.map(p=>p.x))-Math.min(...hand.map(p=>p.x)))*width;
    if(extent<span*.03||extent>span*.7)return false;
    const wrist=hand[0],x=wrist.x*width,y=wrist.y*height;
    if(Math.abs(x-center)>span*.8||y<shoulderY-span*.25||y>hipY+span*.25)return false;
    const candidates=[pose[15],pose[16]].filter(p=>p&&(p.visibility??0)>=.75&&Number.isFinite(p.z));
    candidates.sort((a,b)=>Math.hypot((a.x-wrist.x)*width,(a.y-wrist.y)*height)-Math.hypot((b.x-wrist.x)*width,(b.y-wrist.y)*height));
    const p=candidates[0];if(!p||Math.hypot((p.x-wrist.x)*width,(p.y-wrist.y)*height)>span*.20)return false;
    const t=Math.max(0,Math.min(1,(y-shoulderY)/(hipY-shoulderY)));
    const torsoZ=(depth[0]!+depth[1]!)/2*(1-t)+(depth[2]!+depth[3]!)/2*t;
    return p.z!<torsoZ-.03;
  });
}

function hull(points:Point[]):Point[]{
  const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half=(list:Point[])=>{const stack:Point[]=[];for(const p of list){while(stack.length>1&&cross(stack[stack.length-2],stack[stack.length-1],p)<=0)stack.pop();stack.push(p);}return stack;};
  const a=half(sorted),b=half(sorted.reverse());a.pop();b.pop();return a.concat(b);
}

export class FrameEffects {
  private sample?:HTMLCanvasElement;
  private handMask?:HTMLCanvasElement;
  private personMask?:HTMLCanvasElement;
  private tint=[128,128,128];
  private amount=0;
  private canvas(){return document.createElement('canvas');}
  apply(context:CanvasRenderingContext2D,torso:Torso,frame:TrackingFrame,video:HTMLVideoElement){
    const mask=frame.mask;if(!mask||!torso.rig)return;
    const width=context.canvas.width,height=context.canvas.height;
    this.sample??=this.canvas();this.sample.width=32;this.sample.height=32;
    const sample=this.sample.getContext('2d',{willReadFrequently:true});
    if(sample){
      sample.drawImage(video,0,0,32,32);const pixels=sample.getImageData(0,0,32,32).data;
      const r=torso.rig,top=(r.leftShoulder.y+r.rightShoulder.y)/2,bottom=(r.leftHip.y+r.rightHip.y)/2,center=(r.leftShoulder.x+r.rightShoulder.x)/2;
      const sum=[0,0,0];let count=0;
      for(let y=0;y<32;y++)for(let x=0;x<32;x++){
        const px=(x+.5)/32*width,py=(y+.5)/32*height;
        if(py<top+(bottom-top)*.2||py>top+(bottom-top)*.75||Math.abs(px-center)>torso.width*.22||maskProbability(mask,px,py,width,height)<.95)continue;
        const i=(y*32+x)*4;for(let c=0;c<3;c++)sum[c]+=pixels[i+c];count++;
      }
      if(count>=8){
        const mean=sum.map(n=>n/count),max=Math.max(32,...mean),luminance=(mean[0]*.2126+mean[1]*.7152+mean[2]*.0722)/255;
        this.tint=this.tint.map((n,i)=>n*.8+(mean[i]/max*160)*.2);this.amount=this.amount*.8+(.04+.06*(1-luminance))*.2;
      }else this.amount=0;
    }
    context.save();context.globalCompositeOperation='source-atop';context.globalAlpha=this.amount;
    context.fillStyle=`rgb(${this.tint.map(Math.round).join(',')})`;context.fillRect(0,0,width,height);
    context.globalAlpha=1;
    const r=torso.rig,span=torso.width/1.28,cx=(r.leftShoulder.x+r.rightShoulder.x)/2,cy=(r.leftShoulder.y+r.rightShoulder.y)/2;
    context.translate(cx,cy);context.rotate(torso.angle);context.scale(1,.32);
    const shade=context.createRadialGradient(0,-span*.55,span*.12,0,-span*.55,span*.5);
    shade.addColorStop(0,'rgba(0,0,0,.12)');shade.addColorStop(1,'rgba(0,0,0,0)');
    context.fillStyle=shade;context.fillRect(-span*.6,-span*1.1,span*1.2,span*1.2);context.restore();
    const hands=foregroundHands(frame,torso,width,height);context.canvas.dataset.handOcclusion=String(hands.length);if(!hands.length)return;
    this.handMask??=this.canvas();this.personMask??=this.canvas();
    const mw=Math.min(256,mask.width),mh=Math.min(256,mask.height);
    for(const canvas of [this.handMask,this.personMask]){canvas.width=mw;canvas.height=mh;}
    const hand=this.handMask.getContext('2d'),person=this.personMask.getContext('2d');if(!hand||!person)return;
    const alpha=person.createImageData(mw,mh);
    for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){
      const i=(y*mw+x)*4,p=maskProbability(mask,(x+.5)/mw*width,(y+.5)/mh*height,width,height);
      alpha.data[i+3]=Math.max(0,Math.min(1,(p-.75)/.2))*255;
    }
    person.putImageData(alpha,0,0);hand.fillStyle='white';hand.strokeStyle='white';hand.lineCap='round';hand.lineJoin='round';
    for(const points of hands){
      const palm=hull([0,1,2,5,9,13,17].map(i=>({x:points[i].x*mw,y:points[i].y*mh})));
      hand.beginPath();palm.forEach((p,i)=>i?hand.lineTo(p.x,p.y):hand.moveTo(p.x,p.y));hand.closePath();hand.fill();
      const palmWidth=Math.hypot((points[5].x-points[17].x)*mw,(points[5].y-points[17].y)*mh);
      hand.lineWidth=Math.max(1,palmWidth*.18);
      for(const finger of [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]){
        hand.beginPath();finger.forEach((index,i)=>{const p=points[index];i?hand.lineTo(p.x*mw,p.y*mh):hand.moveTo(p.x*mw,p.y*mh);});hand.stroke();
      }
    }
    hand.globalCompositeOperation='destination-in';hand.drawImage(this.personMask,0,0);
    context.save();context.globalCompositeOperation='destination-out';context.drawImage(this.handMask,0,0,width,height);context.restore();
  }
  dispose(){for(const canvas of [this.sample,this.handMask,this.personMask])if(canvas){canvas.width=0;canvas.height=0;}this.sample=this.handMask=this.personMask=undefined;this.amount=0;this.tint=[128,128,128];}
}
