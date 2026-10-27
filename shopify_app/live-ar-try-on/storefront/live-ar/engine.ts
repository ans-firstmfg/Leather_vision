export { CameraController } from "./camera";
export { PoseSmoother, torsoFromPose } from "./pose";
export { addVariantToCart, mappedVariant } from "./catalog";
import type { Landmark, Torso } from "./pose";

export interface Tracker {
  detectForVideo(video: HTMLVideoElement, timestamp: number): { landmarks: Landmark[][] };
  close(): void;
}
interface VisionModule {
  FilesetResolver: { forVisionTasks(path: string): Promise<unknown> };
  PoseLandmarker: { createFromOptions(files: unknown, options: unknown): Promise<Tracker> };
}

// A pinned public runtime is lazy-loaded; inference receives the video element locally.
export async function createTracker(): Promise<Tracker> {
  const base = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1";
  const runtime = await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`) as VisionModule;
  const files = await runtime.FilesetResolver.forVisionTasks(`${base}/wasm`);
  return runtime.PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate: "CPU" },
    runningMode: "VIDEO", numPoses: 1, minPoseDetectionConfidence: 0.6,
    minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6, outputSegmentationMasks: false,
  });
}

export class GarmentRenderer {
  private image?: HTMLImageElement;
  private generation = 0;
  constructor(private canvas: HTMLCanvasElement) {}
  async load(url: string) {
    const generation = ++this.generation;
    this.image = undefined;
    this.clear();
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    await image.decode();
    if (generation === this.generation) this.image = image;
  }
  clear() { this.canvas.getContext("2d")?.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  dispose() { this.generation++; this.image = undefined; this.clear(); }
  draw(torso: Torso) {
    this.clear();
    const context = this.canvas.getContext("2d");
    if (!context || !this.image) return;
    context.save(); context.translate(torso.x, torso.y); context.rotate(torso.angle);
    context.drawImage(this.image, -torso.width / 2, -torso.height / 2, torso.width, torso.height);
    context.restore();
  }
}
