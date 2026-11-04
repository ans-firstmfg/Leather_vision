export { CameraController } from "./camera";
export { PoseSmoother, torsoFromPose } from "./pose";
export { addVariantToCart, mappedVariant } from "./catalog";
import type { Landmark, Torso } from "./pose";
import { drawJacket } from "./garment-mesh";

export {createTracker,prepareTorso,releaseFrame} from './tracking';
export type {Tracker} from './tracking';
import type {TrackingFrame} from './tracking';
import { FrameEffects } from './frame-effects';

export class GarmentRenderer {
  private effects=new FrameEffects();
  private image?: HTMLImageElement;
  private generation = 0;
  private fit = "vest";
  constructor(private canvas: HTMLCanvasElement) {}
  async load(url: string, fit = "vest") {
    const generation = ++this.generation;
    this.image = undefined;
    this.clear();
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    if (generation === this.generation) { this.image = image; this.fit = fit; }
  }
  clear() { this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height);this.canvas.dataset.handOcclusion='0'; }
  dispose() { this.generation++; this.image = undefined; this.effects.dispose(); this.clear(); }
  draw(torso: Torso, frame?: TrackingFrame, video?: HTMLVideoElement) {
    this.clear();
    this.canvas.dataset.bodySizing=torso.body&&Object.keys(torso.body).length?'silhouette':'landmarks';
    this.canvas.dataset.rendererVersion='straight-body-v5';
    const context = this.canvas.getContext("2d");
    if(Math.abs(torso.yaw??0)>.5||Math.abs(torso.pitch??0)>.4)return 'body_missing';
    if (!context || !this.image) return;
    if (this.fit !== "vest" && torso.rig) {
      const complete=drawJacket(context,this.image,torso,this.fit);
      if(frame&&video)this.effects.apply(context,torso,frame,video);
      return complete?'tracking':'arms_missing';
    }
    context.save(); context.translate(torso.x, torso.y); context.rotate(torso.angle);
    context.drawImage(this.image, -torso.width / 2, -torso.height / 2, torso.width, torso.height);
    context.restore();
  }
}
