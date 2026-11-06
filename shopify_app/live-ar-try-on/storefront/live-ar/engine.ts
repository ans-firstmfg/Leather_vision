export { CameraController } from "./camera";
export { PoseSmoother, torsoFromPose } from "./pose";
export { addVariantToCart, mappedVariant } from "./catalog";
import type { Landmark, Torso } from "./pose";
import { drawJacket } from "./garment-mesh";

export {createTracker,prepareTorso,releaseFrame} from './tracking';
export type {Tracker} from './tracking';
import type {TrackingFrame} from './tracking';
import { FrameEffects } from './frame-effects';
import {VisualSizer} from './visual-size';
import {neutralGrading,type SizeGrading} from './size-profiles';

export class GarmentRenderer {
  private effects=new FrameEffects();
  private sizing=new VisualSizer();
  private image?: HTMLImageElement;
  private generation = 0;
  private fit = "vest";
  private assetKey='';
  private pending?:{key:string;promise:Promise<void>};
  private lastPose?:{torso:Torso;at:number};
  constructor(private canvas: HTMLCanvasElement) {}
  readyFor(url:string,fit='vest'){return !!this.image&&this.assetKey===JSON.stringify([url,fit]);}
  load(url: string, fit = "vest"):Promise<void> {
    const key=JSON.stringify([url,fit]);
    if(this.image&&this.assetKey===key)return Promise.resolve();
    if(this.pending?.key===key)return this.pending.promise;
    const generation = ++this.generation;
    this.image = undefined;
    this.resetTracking();
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    const promise=image.decode().then(()=>{
      if(generation===this.generation){this.image=image;this.fit=fit;this.assetKey=key;}
    }).finally(()=>{if(generation===this.generation)this.pending=undefined;});
    this.pending={key,promise};return promise;
  }
  clear() { this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height);this.canvas.dataset.handOcclusion='0'; }
  dispose() { this.generation++; this.image = undefined; this.pending=undefined;this.assetKey='';this.effects.dispose(); this.resetTracking(); }
  resetTracking(){this.lastPose=undefined;this.sizing.reset();this.clear();}
  draw(torso: Torso|null, frame?: TrackingFrame, video?: HTMLVideoElement,now=performance.now(),grading:SizeGrading=neutralGrading) {
    // Shoulder/torso geometry decides visibility. Noisy world rotation estimates
    // must not hide the entire jacket while the upper body is still tracked.
    if(torso){torso=this.sizing.update(torso,now);this.lastPose={torso,at:now};}
    else if(this.lastPose&&now-this.lastPose.at<=400){torso=this.lastPose.torso;frame=undefined;}
    else {this.resetTracking();return 'body_missing';}
    if(!torso)return 'body_missing';
    this.clear();
    this.canvas.dataset.bodySizing=torso.body&&Object.keys(torso.body).length?'silhouette':'landmarks';
    this.canvas.dataset.rendererVersion='upper-body-tracking-v1';
    const context = this.canvas.getContext("2d");
    if (!context || !this.image) return;
    this.canvas.dataset.previewWidth=String(torso.previewWidth??1);
    if (this.fit !== "vest" && torso.rig) {
      const complete=drawJacket(context,this.image,torso,this.fit,grading);
      if(frame&&video)this.effects.apply(context,torso,frame,video);
      return complete?'tracking':'arms_missing';
    }
    context.save(); context.translate(torso.x, torso.y); context.rotate(torso.angle);
    context.drawImage(this.image, -torso.width*grading.width/2, -torso.height/2, torso.width*grading.width, torso.height*grading.length);
    context.restore();
  }
}
