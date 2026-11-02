export { CameraController } from "./camera";
export { PoseSmoother, torsoFromPose } from "./pose";
export { addVariantToCart, mappedVariant } from "./catalog";
import type { Landmark, Torso } from "./pose";
import { drawJacket } from "./garment-mesh";
import type { ThreeGarment } from "./model3d";

export {createTracker,prepareTorso,releaseFrame} from './tracking';
export type {Tracker} from './tracking';
import type {TrackingFrame} from './tracking';
import { FrameEffects } from './frame-effects';

export class GarmentRenderer {
  private effects=new FrameEffects();
  private image?: HTMLImageElement;
  private generation = 0;
  private fit = "vest";
  private model?: ThreeGarment;
  constructor(private canvas: HTMLCanvasElement, private modelModule?: string) {}
  async load(url: string, fit = "vest") {
    const generation = ++this.generation;
    this.image = undefined;
    this.model?.dispose(); this.model = undefined;
    this.clear();
    if (fit === "model3d") {
      if (!this.modelModule) throw new Error("3D renderer is not configured");
      const { ThreeGarment } = await import(/* @vite-ignore */ this.modelModule) as typeof import("./model3d");
      if (generation !== this.generation) return;
      const model = new ThreeGarment(this.canvas.closest<HTMLElement>('first-mfg-live-ar') ?? undefined); this.model = model;
      await model.load(url);
      if (generation !== this.generation) { model.dispose(); return; }
      this.fit = fit; return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    if (generation === this.generation) { this.image = image; this.fit = fit; }
  }
  clear() { this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height);this.canvas.dataset.handOcclusion='0'; }
  dispose() { this.generation++; this.image = undefined; this.model?.dispose(); this.model = undefined; this.effects.dispose(); this.clear(); }
  draw(torso: Torso, frame?: TrackingFrame, video?: HTMLVideoElement) {
    this.clear();
    this.canvas.dataset.bodySizing=torso.body&&Object.keys(torso.body).length?'silhouette':'landmarks';
    const context = this.canvas.getContext("2d");
    if(Math.abs(torso.yaw??0)>.5||Math.abs(torso.pitch??0)>.4)return 'body_missing';
    if (context && this.model) {const status=this.model.draw(context,torso);if(status==='model_preview'&&frame&&video)this.effects.apply(context,torso,frame,video);return status;}
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
