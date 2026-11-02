import type { Point,Torso } from './pose';

export interface BodyMask { width:number; height:number; data:Float32Array }
export interface BodyWidths { chest:number; waist:number; hips:number }
export function maskProbability(mask:BodyMask,x:number,y:number,width:number,height:number):number {
  const mx=Math.floor(x/width*mask.width),my=Math.floor(y/height*mask.height);
  if(mx<0||my<0||mx>=mask.width||my>=mask.height)return 0;
  return mask.data[my*mask.width+mx]??0;
}

/** Silhouette widths are visual proportions including existing clothes, not cm. */
export function silhouetteWidths(mask:BodyMask,torso:Torso,width:number,height:number):Partial<BodyWidths>|undefined {
  const r=torso.rig;if(!r||mask.data.length!==mask.width*mask.height||mask.width<8||mask.height<8)return;
  const top={x:(r.leftShoulder.x+r.rightShoulder.x)/2,y:(r.leftShoulder.y+r.rightShoulder.y)/2};
  const bottom={x:(r.leftHip.x+r.rightHip.x)/2,y:(r.leftHip.y+r.rightHip.y)/2};
  const span=Math.hypot(r.rightShoulder.x-r.leftShoulder.x,r.rightShoulder.y-r.leftShoulder.y);
  const ux=Math.cos(torso.angle),uy=Math.sin(torso.angle),along=(p:Point,c:Point)=>(p.x-c.x)*ux+(p.y-c.y)*uy;
  const down=(p:Point,c:Point)=>-(p.x-c.x)*uy+(p.y-c.y)*ux;
  const result:Partial<BodyWidths>={};
  for(const [name,fraction] of [['chest',.30],['waist',.65],['hips',.90]] as const){
    const samples:number[]=[];
    for(const delta of [-.025,0,.025]){
      const t=fraction+delta,c={x:top.x+(bottom.x-top.x)*t,y:top.y+(bottom.y-top.y)*t};
      let arms=false;
      for(const [shoulder,elbow,wrist] of [[r.leftShoulder,r.leftElbow,r.leftWrist],[r.rightShoulder,r.rightElbow,r.rightWrist]]){
        if(!elbow||!wrist){arms=true;break;}
        for(const [a,b] of [[shoulder,elbow],[elbow,wrist]] as [Point,Point][]){
          const ay=down(a,c),by=down(b,c);
          if(ay*by<=0 && Math.abs(by-ay)>1){const f=-ay/(by-ay),x=along(a,c)+(along(b,c)-along(a,c))*f;if(Math.abs(x)<span*.72)arms=true;}
          // A nearly horizontal forearm can otherwise evade the row intersection.
          if(Math.abs(ay)<span*.08&&Math.abs(by)<span*.08&&Math.min(Math.abs(along(a,c)),Math.abs(along(b,c)))<span*.72)arms=true;
        }
      }
      if(arms || maskProbability(mask,c.x,c.y,width,height)<.8)continue;
      const edges:number[]=[];
      for(const direction of [-1,1]){
        let edge=0;
        for(let d=2;d<=span*.85;d+=2){
          const x=c.x+ux*d*direction,y=c.y+uy*d*direction;
          if(x<2||x>width-2||y<2||y>height-2){edge=0;break;}
          if(maskProbability(mask,x,y,width,height)<.6){edge=d;break;}
        }
        edges.push(edge);
      }
      const total=edges[0]+edges[1];
      if(edges.every(n=>n>span*.18)&&total>=span*.55&&total<=span*1.5&&Math.max(...edges)/Math.min(...edges)<1.8)samples.push(total);
    }
    if(samples.length>=2){samples.sort((a,b)=>a-b);result[name]=samples[Math.floor(samples.length/2)];}
  }
  return Object.keys(result).length?result:undefined;
}
