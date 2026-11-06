import type {Torso} from './pose';

/** Relative screen-space proportions only. Never converts a pose into cm. */
export class VisualSizer {
  private scale=1;
  private samples:{at:number;ratio:number}[]=[];
  reset(){this.scale=1;this.samples=[];}
  update(torso:Torso,now:number):Torso {
    const r=torso.rig;
    if(!r)return torso;
    const span=Math.hypot(r.rightShoulder.x-r.leftShoulder.x,r.rightShoulder.y-r.leftShoulder.y);
    const widths=[torso.body?.chest,torso.body?.hips].filter((v):v is number=>Number.isFinite(v)&&v!>0);
    const down=(p:{x:number;y:number},s:{x:number;y:number})=>(p.y-s.y)*Math.cos(torso.angle)-(p.x-s.x)*Math.sin(torso.angle);
    const neutral=([['leftShoulder','leftElbow','leftWrist'],['rightShoulder','rightElbow','rightWrist']] as const).every(([s,e,w])=>
      r[e]&&r[w]&&down(r[e]!,r[s])>span*.30&&down(r[w]!,r[s])>span*.70);
    if(span>1&&neutral&&widths.length&&Math.abs(torso.yaw??0)<.2&&Math.abs(torso.pitch??0)<.2){
      const ratio=Math.max(.95,Math.min(1.35,Math.max(...widths)*1.08/(span*1.11)));
      this.samples.push({at:now,ratio});this.samples=this.samples.filter(s=>now-s.at<=1800).slice(-90);
      const values=this.samples.map(s=>s.ratio).sort((a,b)=>a-b);
      if(values.length>=12&&now-this.samples[0].at>=800&&values.at(-1)!-values[0]<.07)
        this.scale+=(values[Math.floor(values.length/2)]-this.scale)*.08;
    }else this.samples=[];
    return {...torso,previewWidth:this.scale};
  }
}
