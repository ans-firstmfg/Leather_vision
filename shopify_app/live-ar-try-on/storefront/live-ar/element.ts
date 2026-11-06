import type * as Engine from "./engine";
import type { ARProduct } from "./catalog";
import { CameraController } from "./camera";
import { incomingHandoff } from "./handoff";
import type { MobileHandoff } from "./handoff-ui";
import type {SizeAssistant} from './sizing-ui';

class LiveARTryOn extends HTMLElement {
  private controller?: AbortController;
  private operation = 0;
  private frame = 0;
  private lastVideoTime = -1;
  private lastInference = 0;
  private interval = 42;
  private hadTracking = false;
  private facing: "user" | "environment" = "user";
  private active = false;
  private starting = false;
  private cartBusy = false;
  private assetReady = false;
  private copy: Record<string, string> = {};
  private product!: ARProduct;
  private runtime?: typeof Engine;
  private camera?: Engine.CameraController;
  private tracker?: Engine.Tracker;
  private renderer?: Engine.GarmentRenderer;
  private smoother?: Engine.PoseSmoother;
  private dialog!: HTMLDialogElement;
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private variant!: HTMLSelectElement;
  private assetOperation = 0;
  private handoff?: MobileHandoff;
  private sizing?:SizeAssistant;

  connectedCallback() {
    if (this.controller) return;
    this.controller = new AbortController();
    try {
      this.product = JSON.parse(this.dataset.product || "{}");
      this.copy = JSON.parse(this.dataset.copy || "{}");
    } catch { return; }
    this.dialog = this.querySelector("dialog")!;
    this.video = this.querySelector("video")!;
    this.canvas = this.querySelector("canvas")!;
    this.variant = this.querySelector("select")!;
    if (!this.dialog || !this.video || !this.canvas || !this.variant) return;
    const { signal } = this.controller;
    this.control("open")?.addEventListener("click", () => this.open(), { signal });
    this.control("mobile")?.addEventListener("click", () => { void this.mobile(); }, { signal });
    this.control("close")?.addEventListener("click", () => this.close(), { signal });
    this.control("start")?.addEventListener("click", () => { void this.start(); }, { signal });
    this.control("switch")?.addEventListener("click", () => {
      if (!this.active || this.starting) return;
      this.facing = this.facing === "user" ? "environment" : "user"; void this.start();
    }, { signal });
    this.control("cart")?.addEventListener("click", () => { void this.addToCart(); }, { signal });
    this.variant.addEventListener("change", () => { if (this.active) void this.loadAsset(); this.updateCart(); }, { signal });
    this.querySelectorAll<HTMLButtonElement>("[data-ar-sample]").forEach(button => button.addEventListener("click", () => {
      this.variant.value = button.dataset.arSample!;
      this.variant.dispatchEvent(new Event("change"));
      this.querySelectorAll("[data-ar-sample]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    }, { signal }));
    this.dialog.addEventListener("cancel", () => this.stop(), { signal });
    this.dialog.addEventListener("close", () => this.stop(), { signal });
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.pause(); }, { signal });
    window.addEventListener("pagehide", () => this.pause(), { signal });
    const selected = new URL(location.href).searchParams.get("variant");
    if (selected && this.product.variants.some(v => v.id === selected)) this.variant.value = selected;
    this.updateCart();
    const incoming = incomingHandoff(location.href, this.dataset.handoffId || "");
    if (incoming && this.product.variants.some(v => v.id === incoming && v.available)) {
      this.variant.value = incoming; this.open();
    }
  }

  disconnectedCallback() { this.stop();this.sizing?.dispose();this.sizing=undefined;this.controller?.abort(); this.controller = undefined; this.handoff = undefined; }

  async loadSizing(){
    if(this.sizing||!this.dataset.sizingModule)return;
    const signal=this.controller!.signal;
    try{const module=await import(/* @vite-ignore */ this.dataset.sizingModule);
      if(!signal.aborted)this.sizing??=new module.SizeAssistant(this,this.product,()=>this.active);
    }catch{if(!signal.aborted)this.status('module_error');}
  }


  loadHandoff(): Promise<typeof import("./handoff-ui")> { return import(/* @vite-ignore */ this.dataset.handoffModule!); }
  private async mobile() {
    const signal = this.controller!.signal;
    try {
      if (!this.handoff) {
        const { MobileHandoff } = await this.loadHandoff();
        if (signal.aborted || !this.isConnected) return;
        this.handoff ??= new MobileHandoff(this, signal);
      }
      this.handoff.show(this.variant.value);
      const feedback = this.control<HTMLElement>("mobile-error");
      if (feedback) feedback.hidden = true;
    } catch {
      const feedback = this.control<HTMLElement>("mobile-error");
      if (!signal.aborted && feedback) feedback.hidden = false;
    }
  }

  loadRuntime(): Promise<typeof Engine> { return import(/* @vite-ignore */ this.dataset.engine!); }

  private text(key: string) { return this.copy[key] || key; }
  private control<T extends HTMLElement=HTMLElement>(name:string){return this.querySelector<T>(`[data-ar-${name}]`);}
  private status(key: string) {
    const el = this.control<HTMLElement>("status");
    if (el && el.textContent !== this.text(key)) el.textContent = this.text(key);
    this.dataset.state = key;
  }

  private failure(stage: string, error: unknown) {
    this.dataset.errorStage = stage;
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("[Live AR]", stage, detail.replace(/https?:\/\/\S+/g, "[resource]").slice(0, 240));
    this.status(stage + "_error");
  }

  private open() {
    if (typeof this.dialog.showModal !== "function") {
      let message = this.control<HTMLElement>("launch-status");
      if (!message) { message = document.createElement("p"); message.dataset.arLaunchStatus = ""; message.setAttribute("role", "status"); this.append(message); }
      message.textContent = this.text("unsupported"); return;
    }
    this.dialog.showModal(); this.status("permission");void this.loadSizing();
    const current = new URL(location.href).searchParams.get("variant");
    if (current && this.product.variants.some(v => v.id === current)) this.variant.value = current;
    this.updateCart();
  }

  private close() { this.stop();this.sizing?.clearCapture(); this.dialog.close(); this.control<HTMLButtonElement>("open")?.focus(); }
  private pause() { this.stop();this.sizing?.clearCapture(); if (this.dialog?.open) this.status("paused"); }

  private stop() {
    this.sizing?.cancelScan();
    this.operation++; this.assetOperation++;
    this.active = false; this.starting = false; this.assetReady = false;
    cancelAnimationFrame(this.frame);
    this.camera?.stop(); this.camera = undefined;
    this.tracker?.close(); this.tracker = undefined;
    this.renderer?.dispose(); this.renderer = undefined;
    this.smoother?.reset(); this.smoother = undefined;
    this.hadTracking = false; this.lastVideoTime = -1; this.lastInference = 0; this.interval = 42;
    const start = this.control<HTMLButtonElement>("start");
    if (start) start.disabled = false;
    const switcher = this.control<HTMLButtonElement>("switch");
    if (switcher) switcher.disabled = true;
  }

  async start() {
    if (this.starting || !this.dialog.open) return;
    this.stop();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { this.status("unsupported"); return; }
    const operation = this.operation;
    const valid = () => operation === this.operation && this.isConnected && this.dialog.open;
    this.starting = true;
    delete this.dataset.errorStage;
    this.control<HTMLButtonElement>("start")!.disabled = true;
    this.status("starting");
    let stage = "camera";
    try {
      // Request camera within the click action; no SDK download before permission is granted.
      this.camera = new CameraController(this.video, navigator.mediaDevices, () => { this.stop(); this.status("camera_error"); });
      await this.camera.start(this.facing);
      if (!valid()) return;
      this.status("loading");
      stage = "module";
      this.runtime = await this.loadRuntime();
      if (!valid()) return;
      stage = "model";
      const tracker = await this.runtime.createTracker();
      if (!valid()) { tracker.close(); return; }
      this.tracker = tracker;
      this.renderer = new this.runtime.GarmentRenderer(this.canvas);
      this.smoother = new this.runtime.PoseSmoother();
      this.active = true;
      await this.loadAsset();
      if (!valid()) return;
      this.starting = false;
      this.control<HTMLButtonElement>("start")!.disabled = false;
      this.control<HTMLButtonElement>("switch")!.disabled = false;
      this.status(this.assetReady ? "body_missing" : "asset_error");
      this.dataset.mirrored = String(this.facing === "user");
      this.frame = requestAnimationFrame(time => this.tick(time));
    } catch (error) {
      if (!valid()) return;
      this.stop();
      if (error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(error.name)) this.status("denied");
      else this.failure(stage, error);
    }
  }

  private async loadAsset() {
    const variant = this.runtime?.mappedVariant(this.product, this.variant.value);
    if(variant&&this.assetReady&&this.renderer?.readyFor(variant.asset,variant.fit))return;
    const operation = ++this.assetOperation;
    this.assetReady = false; this.renderer?.clear(); this.smoother?.reset();
    if (!variant) { this.status("variant_unavailable"); return; }
    this.status("loading");
    try {
      await this.renderer?.load(variant.asset, variant.fit);
      if (operation === this.assetOperation && this.active) { this.assetReady = true; this.status("body_missing"); }
    } catch (error) { if (operation === this.assetOperation && this.active) this.failure("asset", error); }
  }

  private tick(now: number) {
    if (!this.active || !this.tracker || !this.runtime || !this.renderer || !this.smoother) return;
    try {
      const width=this.video.videoWidth,height=this.video.videoHeight;
      if (this.video.readyState >= 2 && width > 0 && height > 0 && this.video.currentTime !== this.lastVideoTime && now - this.lastInference >= this.interval) {
        this.lastVideoTime = this.video.currentTime; this.lastInference = now;
        if (this.canvas.width !== width) this.canvas.width = width;
        if (this.canvas.height !== height) this.canvas.height = height;
        const before = performance.now();
        const result = this.tracker.detectForVideo(this.video, now);
        try {
        this.sizing?.update(result,width,height,now);
        const torso = this.runtime.prepareTorso(result,width,height);

        if (this.assetReady) {
          const state=this.renderer.draw(torso?this.smoother.update(torso,now):null,result,this.video,now,this.sizing?.grading());
          if(state==='body_missing'){this.smoother.reset();this.status(this.hadTracking?'lost':'body_missing');}
          else {this.status(state||'tracking');this.hadTracking=true;}
        } else {
          this.renderer.resetTracking(); this.smoother.reset();
        }
        } finally { this.runtime.releaseFrame(result); }
        this.interval = Math.min(200, Math.max(42, this.interval * .8 + (performance.now() - before) * 1.3 * .2));
      } else if (now - this.lastInference > 1000 && this.assetReady) {
        this.renderer.resetTracking(); this.smoother.reset(); this.status(this.hadTracking ? "lost" : "body_missing");
      }
      this.frame = requestAnimationFrame(time => this.tick(time));
    } catch (error) { this.stop(); this.failure("frame", error); }
  }

  private updateCart() {
    this.querySelectorAll<HTMLButtonElement>("[data-ar-sample]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.arSample === this.variant.value)));
    this.handoff?.update(this.variant.value);
    const button = this.control<HTMLButtonElement>("cart");
    if (button) button.disabled = !!this.product.demo || this.cartBusy || !this.product.variants.some(v => v.id === this.variant.value && v.available && /^\d+$/.test(v.id) && !!v.asset);
  }

  async addToCart() {
    if (this.cartBusy || this.product.demo) return;
    this.cartBusy = true; this.updateCart();
    const feedback = this.control<HTMLElement>("cart-status")!;
    feedback.textContent = this.text("adding");
    try {
      const runtime = this.runtime ?? await this.loadRuntime();
      if (this.controller?.signal.aborted || !this.isConnected) return;
      await runtime.addVariantToCart(this.product, this.variant.value, this.dataset.cartAddUrl!, this.controller!.signal);
      if (this.isConnected) feedback.textContent = this.text("added");
    } catch (error) {
      if (this.isConnected) feedback.textContent = this.text(error instanceof Error && error.message === "variant_unavailable" ? "variant_unavailable" : "cart_error");
    } finally { this.cartBusy = false; this.updateCart(); }
  }
}

if (!customElements.get("first-mfg-live-ar")) customElements.define("first-mfg-live-ar", LiveARTryOn);
