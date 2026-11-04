import { test } from "node:test";
import './perception.test';
import './waist-sleeves.test';
import {prepareTorso,releaseFrame} from '../storefront/live-ar/tracking';
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { CameraController } from "../storefront/live-ar/camera";
import { torsoFromPose, PoseSmoother, type Landmark } from "../storefront/live-ar/pose";
import { mappedVariant, addVariantToCart, type ARProduct } from "../storefront/live-ar/catalog";
import { mobileHandoffUrl, incomingHandoff } from "../storefront/live-ar/handoff";
import { MobileHandoff } from "../storefront/live-ar/handoff-ui";
import jsQR from "jsqr";
import { profiles, jacketTargets, warpPoint, drawJacket, jacketPoint, jacketShapePoint } from "../storefront/live-ar/garment-mesh";

test('every image jacket uses a stable upper panel while retaining its collar style',()=>{
  const torso=torsoFromPose(jacketPose(),640,480)!;
  const bent=structuredClone(torso);bent.rig!.rightElbow!.y-=100;bent.rig!.rightWrist!.y-=140;
  const a=jacketTargets(torso)!.points,b=jacketTargets(bent)!.points;
  for(const profile of ['open','open_brown','cafe','flame','raider','brown','trucker','jacket']){
    for(const p of [{x:.5,y:.02},{x:.2,y:.08},{x:.8,y:.08},{x:.5,y:.5}]){
      const original=jacketPoint(p,profile,a),moved=jacketPoint(p,profile,b);
      assert.ok(Math.abs(original.x-moved.x)<1e-6);assert.ok(Math.abs(original.y-moved.y)<1e-6);
    }
    assert.deepEqual(jacketShapePoint({x:.5,y:.7},profile),{x:.5,y:.7});
    for(let row=0;row<=12;row++)for(let column=0;column<=10;column++){
      const p=jacketPoint({x:column/10,y:row/12},profile,b);
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(Math.abs(p.x)<2000&&Math.abs(p.y)<2000);
    }
  }
  assert.ok(jacketShapePoint({x:.5,y:0},'cafe').y<0);
  assert.ok(jacketShapePoint({x:.5,y:0},'brown').y<0);
  assert.equal(jacketShapePoint({x:.5,y:0},'trucker').y,0);
  assert.equal(jacketShapePoint({x:.5,y:0},'jacket').y,0);
});
test('pose mouth clearance is confidence-gated, bounded, smoothed and dropped on tracking loss',()=>{
  const points:Landmark[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  points[11]={x:.3,y:.4,visibility:1};points[12]={x:.7,y:.4,visibility:1};
  points[23]={x:.35,y:.85,visibility:1};points[24]={x:.65,y:.85,visibility:1};
  points[9]={x:.48,y:.24,visibility:1};points[10]={x:.52,y:.24,visibility:1};
  const a=torsoFromPose(points,640,480)!;assert.ok(a.neckClearance!>=.25&&a.neckClearance!<=.38);
  const filter=new PoseSmoother();filter.update(a,100);
  const next=filter.update({...a,neckClearance:.38},133);assert.ok(next.neckClearance!<.38);
  points[9].visibility=.3;const missing=torsoFromPose(points,640,480)!;assert.equal(missing.neckClearance,undefined);
  assert.equal(filter.update(missing,166).neckClearance,undefined);
  points[9].visibility=1;points[9].x=points[10].x=.95;
  assert.equal(torsoFromPose(points,640,480)!.neckClearance,undefined);
});


const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (markup: string, options: object) => { window: Window & typeof globalThis };
};

test("Live AR has its own theme extension and all block translations resolve", async () => {
  const themes = [];
  for (const dir of await readdir("extensions", { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const config = await readFile(`extensions/${dir.name}/shopify.extension.toml`, "utf8");
    if (/type\s*=\s*"theme"/.test(config)) themes.push(dir.name);
  }
  assert.deepEqual(themes, ["live-ar"]);
  const locale = JSON.parse(await readFile("extensions/live-ar/locales/en.default.json", "utf8"));
  for (const file of await readdir("extensions/live-ar/blocks")) {
    const liquid = await readFile(`extensions/live-ar/blocks/${file}`, "utf8");
    for (const match of liquid.matchAll(/["']((?:leather_vision|live_ar)\.[\w.-]+)["']\s*\|\s*t\b/g)) {
      assert.equal(typeof match[1].split(".").reduce((value, key) => value?.[key], locale), "string", match[1]);
    }
  }
});

const product: ARProduct = { id: "9", title: "Pilot vest", url: "/en/products/pilot", variants: [
  { id: "101", title: "Black / M", available: true, price: "$100", asset: "https://cdn.example/black.png" },
  { id: "102", title: "Red / M", available: false, price: "$100", asset: "https://cdn.example/red.png" },
] };

test("camera stops late permission streams after close and releases media on playback failure", async () => {
  let finish!: (stream: MediaStream) => void, stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] } as unknown as MediaStream;
  const video = { pause() {}, play: async () => {}, srcObject: null } as unknown as HTMLVideoElement;
  const camera = new CameraController(video, { getUserMedia: () => new Promise(resolve => { finish = resolve; }) });
  const pending = camera.start(); camera.stop(); finish(stream);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(stopped, 1); assert.equal(video.srcObject, null);
  video.play = async () => { throw new Error("playback blocked"); };
  const failing = new CameraController(video, { getUserMedia: async () => stream });
  await assert.rejects(failing.start(), /playback blocked/);
  assert.equal(stopped, 2); assert.equal(video.srcObject, null);
});

test("camera restart releases previous stream; permission denial does not retain media", async () => {
  let stopped = 0;
  const video = { pause() {}, play: async () => {}, srcObject: null } as unknown as HTMLVideoElement;
  const camera = new CameraController(video, { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) as unknown as MediaStream });
  await camera.start(); await camera.start("environment"); assert.equal(stopped, 1);
  camera.stop(); assert.equal(stopped, 2); assert.equal(video.srcObject, null);
  const denied = new CameraController(video, { getUserMedia: async () => { throw new DOMException("Denied", "NotAllowedError"); } });
  await assert.rejects(denied.start(), { name: "NotAllowedError" }); assert.equal(video.srcObject, null);
});

test("a device ending its camera track clears media and reports the interruption", async () => {
  const track = new EventTarget(); let stopped = 0, ended = 0;
  const video = { pause() {}, play: async () => {}, srcObject: null } as unknown as HTMLVideoElement;
  const camera = new CameraController(video, { getUserMedia: async () => ({ getTracks: () => [Object.assign(track, { stop: () => stopped++ })] }) as unknown as MediaStream }, () => { ended++; });
  await camera.start(); track.dispatchEvent(new Event("ended"));
  assert.equal(stopped, 1); assert.equal(ended, 1); assert.equal(video.srcObject, null);
});

function pose() {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  points[11] = { x: 0.3, y: 0.3, visibility: 1 }; points[12] = { x: 0.7, y: 0.3, visibility: 1 };
  points[23] = { x: 0.4, y: 0.8, visibility: 1 }; points[24] = { x: 0.6, y: 0.8, visibility: 1 };
  return points;
}

test("torso geometry scales with the video and refuses uncertain/cropped/profile poses", () => {
  const points = pose(), torso = torsoFromPose(points, 640, 480)!;
  assert.equal(torso.x, 320); assert.equal(torso.angle, 0);
  assert.ok(torso.width > 256 && torso.height > 240);
  assert.equal(torsoFromPose(points, 1280, 960)!.width, torso.width * 2);
  points[11].visibility = 0.1; assert.equal(torsoFromPose(points, 640, 480), null);
  points[11].visibility = 1; points[11].x = -0.1; assert.equal(torsoFromPose(points, 640, 480), null);
  points[11].x = 0.69; assert.equal(torsoFromPose(points, 640, 480), null);
  assert.equal(torsoFromPose([], 640, 480), null);
});

test("smoothing damps small movements and resets after tracking loss", () => {
  const smoother = new PoseSmoother(), torso = torsoFromPose(pose(), 640, 480)!;
  smoother.update(torso, 1);
  const next = { ...torso, x: torso.x + 100 };
  const smoothed = smoother.update(next, 34);
  assert.ok(smoothed.x > torso.x && smoothed.x < next.x);
  smoother.reset(); assert.equal(smoother.update(next, 67).x, next.x);
});

function jacketPose() {
  const p = pose();
  for (const [i,x,y] of [[11,.30,.25],[12,.70,.25],[23,.36,.75],[24,.64,.75],[13,.20,.48],[14,.80,.48],[15,.15,.72],[16,.85,.72]]) {
    p[i] = { x, y, visibility: .95 };
  }
  return p;
}

test("jacket texture shoulders, waist, elbows and cuffs land on their body anchors", () => {
  const torso = torsoFromPose(jacketPose(), 640, 480)!;
  const target = jacketTargets(torso)!;
  assert.equal(target.complete, true);
  for (const profile of Object.values(profiles)) for (let i=0;i<profile.length;i++) {
    const actual = warpPoint(profile[i], profile, target.points);
    assert.ok(Math.hypot(actual.x-target.points[i].x,actual.y-target.points[i].y)<.01, `anchor ${i}`);
  }
  assert.ok(target.points[1].x-target.points[0].x > torso.width*.8, "Jacket body covers the shoulders rather than shrinking inside a full-image rectangle");
  const collar = warpPoint({x:.5,y:.03}, profiles.cafe, target.points);
  assert.ok(collar.y < target.points[0].y, "Collar sits above the shoulder line");
});

test('jacket shoulder seams lift above tracked joints with scale and tilt preserved',()=>{
  for(const scale of [1,2]){
    const torso=torsoFromPose(jacketPose(),640*scale,480*scale)!;
    const r=torso.rig!,target=jacketTargets(torso)!.points;
    const span=r.rightShoulder.x-r.leftShoulder.x;
    assert.ok(Math.abs(target[0].y-(r.leftShoulder.y-span*.10))<1e-6);
    assert.ok(Math.abs(target[1].y-(r.rightShoulder.y-span*.10))<1e-6);
    assert.ok(target[8].y<target[0].y && target[9].y<target[1].y);
    assert.deepEqual(target[4],r.leftElbow);assert.deepEqual(target[5],r.rightElbow);
    assert.deepEqual(target[6],r.leftWrist);assert.deepEqual(target[7],r.rightWrist);
    const theta=.25,cos=Math.cos(theta),sin=Math.sin(theta),rot=(p:{x:number;y:number})=>({x:p.x*cos-p.y*sin,y:p.x*sin+p.y*cos});
    const rotated={...torso,angle:theta,rig:{
      leftShoulder:rot(r.leftShoulder),rightShoulder:rot(r.rightShoulder),leftHip:rot(r.leftHip),rightHip:rot(r.rightHip),
      leftElbow:r.leftElbow?rot(r.leftElbow):undefined,rightElbow:r.rightElbow?rot(r.rightElbow):undefined,
      leftWrist:r.leftWrist?rot(r.leftWrist):undefined,rightWrist:r.rightWrist?rot(r.rightWrist):undefined,
    }};
    const turned=jacketTargets(rotated)!.points;
    for(let i=0;i<target.length;i++){const expected=rot(target[i]);assert.ok(Math.hypot(turned[i].x-expected.x,turned[i].y-expected.y)<1e-6);}
  }
});

test("bent sleeves follow elbows/wrists while shoulder and waist anchors stay fixed", () => {
  const p = jacketPose(), straight = jacketTargets(torsoFromPose(p,640,480)!)!;
  p[13] = {x:.20,y:.56,visibility:.95}; p[15] = {x:.35,y:.65,visibility:.95};
  const bent = jacketTargets(torsoFromPose(p,640,480)!)!;
  assert.deepEqual(bent.points.slice(0,4),straight.points.slice(0,4));
  const cuff = warpPoint(profiles.cafe[6],profiles.cafe,bent.points);
  assert.ok(Math.abs(cuff.x-224)<.01 && Math.abs(cuff.y-312)<.01);
  const smoother = new PoseSmoother(); smoother.update(torsoFromPose(p,640,480)!,1);
  p[15].visibility = .1;
  const uncertain = smoother.update(torsoFromPose(p,640,480)!,34);
  assert.equal(uncertain.rig?.leftWrist,undefined, "Do not retain a stale visible wrist after confidence drops");
  assert.equal(jacketTargets(uncertain)?.complete,false);
});

test("jacket rendering uses bounded, finite mesh transforms and balances canvas state", () => {
  let depth=0,draws=0;
  const context = {save(){depth++;},restore(){depth--;},beginPath(){},closePath(){},clip(){},
    moveTo(x:number,y:number){assert.ok(Number.isFinite(x)&&Number.isFinite(y));},
    lineTo(x:number,y:number){assert.ok(Number.isFinite(x)&&Number.isFinite(y));},
    transform(...values:number[]){assert.ok(values.every(Number.isFinite));},drawImage(){draws++;},
  } as unknown as CanvasRenderingContext2D;
  assert.equal(drawJacket(context,{naturalWidth:1280,naturalHeight:1280} as HTMLImageElement,torsoFromPose(jacketPose(),640,480)!,"cafe"),true);
  assert.ok(draws>100 && draws<=240); assert.equal(depth,0);
});

test("only explicitly mapped, available variants with a real asset can be selected", () => {
  assert.equal(mappedVariant(product, "101")?.title, "Black / M");
  assert.equal(mappedVariant(product, "102"), undefined);
  assert.equal(mappedVariant(product, "999"), undefined);
  assert.equal(mappedVariant({ ...product, variants: [{ ...product.variants[0], asset: "" }] }, "101"), undefined);
});

test("cart checks live availability and sends only the selected Shopify ID with locale preserved", async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const fetcher = (async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1 ? Response.json({ variants: [{ id: 101, available: true }] }) : Response.json({ items: [{ id: 101 }] });
  }) as typeof fetch;
  await addVariantToCart(product, "101", "/en/cart/add.js", new AbortController().signal, fetcher, "https://shop.example");
  assert.equal(calls[0].url, "https://shop.example/en/products/pilot.js");
  assert.equal(calls[1].url, "https://shop.example/en/cart/add.js");
  assert.deepEqual(JSON.parse(String(calls[1].options!.body)), { items: [{ id: "101", quantity: 1 }] });
});

test("cart refuses unmapped IDs, stale stock, subscription variants and external endpoints", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return Response.json({ variants: [{ id: 101, available: false }] }); }) as typeof fetch;
  await assert.rejects(addVariantToCart(product, "999", "/en/cart/add.js", new AbortController().signal, fetcher, "https://shop.example"), /variant_unavailable/);
  assert.equal(calls, 0);
  await assert.rejects(addVariantToCart(product, "101", "/en/cart/add.js", new AbortController().signal, fetcher, "https://shop.example"), /variant_unavailable/);
  assert.equal(calls, 1);
  await assert.rejects(addVariantToCart(product, "101", "https://other.example/cart/add.js", new AbortController().signal, fetcher, "https://shop.example"), /cart_error/);
  const subscription = (async () => Response.json({ variants: [{ id: 101, available: true, requires_selling_plan: true }] })) as typeof fetch;
  await assert.rejects(addVariantToCart(product, "101", "/en/cart/add.js", new AbortController().signal, subscription, "https://shop.example"), /variant_unavailable/);
});

async function ui(url = "https://shop.example/en/products/pilot?variant=101") {
  const source = await readFile("extensions/live-ar/assets/leather-vision-ar.js", "utf8");
  const dom = new JSDOM(`<first-mfg-live-ar><button data-ar-open>Open</button><button data-ar-mobile>Phone</button><p data-ar-mobile-error hidden></p><section data-ar-mobile-panel hidden tabindex="-1"><button data-ar-mobile-close>Close phone</button><div data-ar-qr></div><a data-ar-mobile-link hidden></a><p data-ar-mobile-unavailable hidden></p></section><dialog><button data-ar-close>Close</button><button data-ar-start>Start</button><button data-ar-switch>Switch</button><video></video><canvas></canvas><select><option value="101">Black M</option></select><p data-ar-status></p><button data-ar-cart>Buy</button><p data-ar-cart-status></p></dialog></first-mfg-live-ar>`, {
    url, runScripts: "outside-only", pretendToBeVisual: true,
  });
  const window = dom.window;
  const root = window.document.querySelector("first-mfg-live-ar") as unknown as HTMLElement & {
    start(): Promise<void>; addToCart(): Promise<void>; loadRuntime(): Promise<unknown>; loadHandoff(): Promise<unknown>;
  };
  root.dataset.product = JSON.stringify(product); root.dataset.copy = JSON.stringify({ denied: "Camera blocked", paused: "Paused" });
  root.dataset.handoffId = "pilot-block";
  Object.defineProperty(window, "isSecureContext", { value: true });
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.play = async () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  window.eval(source);
  const click = (selector: string) => (root.querySelector(selector) as HTMLButtonElement).click();
  return { dom, window, root, click };
}

test("opening dialog never asks for camera or loads the vision runtime; denied camera is actionable", async () => {
  const { window, root, click } = await ui();
  let requests = 0, downloads = 0;
  Object.defineProperty(window.navigator, "mediaDevices", { value: { getUserMedia: async () => {
    requests++; throw new window.DOMException("denied", "NotAllowedError");
  } } });
  root.loadRuntime = async () => { downloads++; throw new Error("Unexpected download"); };
  click("[data-ar-open]"); assert.equal(requests, 0); assert.equal(downloads, 0);
  await root.start(); assert.equal(requests, 1); assert.equal(downloads, 0);
  assert.equal(root.dataset.state, "denied");
  root.remove(); window.close();
});

test("browsers without dialog support receive visible fallback guidance", async () => {
  const { root, window, click } = await ui();
  Object.defineProperty(root.querySelector("dialog"), "showModal", { value: undefined });
  click("[data-ar-open]");
  assert.ok(root.querySelector("[data-ar-launch-status]")?.textContent);
  root.remove(); window.close();
});

test("closing during permission request stops a subsequently granted camera", async () => {
  const { window, root, click } = await ui();
  let finish!: (stream: unknown) => void, stopped = 0, downloads = 0;
  Object.defineProperty(window.navigator, "mediaDevices", { value: { getUserMedia: () => new Promise(resolve => { finish = resolve; }) } });
  root.loadRuntime = async () => { downloads++; throw new Error("Unexpected download"); };
  click("[data-ar-open]"); const pending = root.start(); click("[data-ar-close]");
  finish({ getTracks: () => [{ stop: () => stopped++ }] }); await pending;
  assert.equal(stopped, 1); assert.equal(downloads, 0);
  assert.equal(root.querySelector("video")!.srcObject, null);
  root.remove(); window.close();
});

test("closing during SDK download releases the camera immediately", async () => {
  const { window, root, click } = await ui();
  let resolveRuntime!: (runtime: unknown) => void, stopped = 0, openedTracker = 0;
  Object.defineProperty(window.navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) } });
  root.loadRuntime = () => new Promise(resolve => { resolveRuntime = resolve; });
  click("[data-ar-open]"); const pending = root.start();
  await new Promise(resolve => setTimeout(resolve, 0));
  click("[data-ar-close]"); assert.equal(stopped, 1);
  resolveRuntime({ createTracker: () => { openedTracker++; } }); await pending;
  assert.equal(openedTracker, 0);
  root.remove(); window.close();
});

test("active tracking renders only confident poses, clears on loss, and releases all resources on pagehide", async () => {
  const { window, root, click } = await ui();
  let stopped = 0, disposed = 0, closed = 0, draws = 0, clears = 0, time = 1, points = pose(), masksClosed=0;
  const frames: FrameRequestCallback[] = [];
  window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  window.cancelAnimationFrame = () => {};
  Object.defineProperty(window.navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) } });
  const video = root.querySelector("video")!;
  Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 640 }, videoHeight: { value: 480 }, currentTime: { get: () => time } });
  root.loadRuntime = async () => ({ mappedVariant, torsoFromPose, PoseSmoother,prepareTorso,releaseFrame,
    createTracker: async () => ({ detectForVideo: () => ({ landmarks: [points],segmentationMasks:[{width:8,height:8,getAsFloat32Array:()=>new Float32Array(64),close(){masksClosed++;}}] }), close: () => { closed++; } }),
    GarmentRenderer: class { async load() {} draw() { draws++; } clear() { clears++; } dispose() { disposed++; } },
  });
  click("[data-ar-open]"); await root.start();
  frames.shift()!(100); assert.equal(root.dataset.state, "tracking"); assert.equal(draws, 1);assert.equal(masksClosed,1);
  frames.shift()!(500); assert.equal(root.dataset.state, "lost", "A stalled camera must not leave a frozen garment visible");
  const before = clears; points = []; time++;
  frames.shift()!(600); assert.equal(root.dataset.state, "lost"); assert.ok(clears > before); assert.equal(draws, 1);assert.equal(masksClosed,2);
  window.dispatchEvent(new window.Event("pagehide"));
  assert.equal(stopped, 1); assert.equal(closed, 1); assert.equal(disposed, 1);
  assert.equal(root.dataset.state, "paused");
  frames.shift()!(700); assert.equal(draws, 1, "A stale scheduled frame must not draw after cleanup");
  root.remove(); window.close();
});

test("tracker finishing after close is disposed without restarting the camera", async () => {
  const { window, root, click } = await ui();
  let finish!: (tracker: unknown) => void, stopped = 0, closed = 0;
  Object.defineProperty(window.navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) } });
  root.loadRuntime = async () => ({ createTracker: () => new Promise(resolve => { finish = resolve; }) });
  click("[data-ar-open]"); const pending = root.start();
  await new Promise(resolve => setTimeout(resolve, 0));
  root.remove(); assert.equal(stopped, 1);
  finish({ close: () => { closed++; } }); await pending; assert.equal(closed, 1);
  window.close();
});

test("Shopify cart rejections and cancellation never report success", async () => {
  const controller = new AbortController(); let calls = 0;
  const fetcher = (async () => { calls++; return calls === 1 ? Response.json({ variants: [{ id: 101, available: true }] }) : Response.json({}, { status: 422 }); }) as typeof fetch;
  await assert.rejects(addVariantToCart(product, "101", "/en/cart/add.js", controller.signal, fetcher, "https://shop.example"), /variant_unavailable/);
  const cancelled = (async () => { controller.abort(); return Response.json({ variants: [{ id: 101, available: true }] }); }) as typeof fetch;
  await assert.rejects(addVariantToCart(product, "101", "/en/cart/add.js", controller.signal, cancelled, "https://shop.example"), { name: "AbortError" });
});

test("sample garments cannot reach Shopify cart endpoints", async () => {
  let calls = 0;
  const fetcher = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  const sample = { ...product, demo: true };
  assert.ok(mappedVariant(sample, "101"), "sample image can be previewed");
  await assert.rejects(addVariantToCart(sample, "101", "/cart/add.js", new AbortController().signal, fetcher, "https://shop.example"), /variant_unavailable/);
  assert.equal(calls, 0);
});

test("Shopify CDN asset URLs work in absolute, protocol-relative and storefront-relative form", async () => {
  for (const asset of ["https://cdn.shopify.com/extensions/a/coat.png", "//cdn.shopify.com/extensions/a/coat.png", "/cdn/shop/files/coat.png"]) {
    const mapped = mappedVariant({ ...product, variants: [{ ...product.variants[0], asset }] }, "101");
    assert.equal(mapped?.asset, asset);
  }
  for (const asset of ["javascript:alert(1)", "data:image/png;base64,test", "https:https://cdn.shopify.com/coat.png"]) {
    assert.equal(mappedVariant({ ...product, variants: [{ ...product.variants[0], asset }] }, "101"), undefined);
  }
  const liquid = await readFile("extensions/live-ar/blocks/live-ar.liquid", "utf8");
  assert.ok(!liquid.includes("prepend: 'https:'"), "CDN URLs must not be prefixed with an extra protocol");
});

test("model startup and garment load failures report distinct stages instead of the same generic error", async () => {
  for (const failed of ["model", "asset"]) {
    const { root, window, click } = await ui();
    window.console.error = () => {};
    let stopped = 0;
    Object.defineProperty(window.navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) } });
    root.loadRuntime = async () => ({ mappedVariant, PoseSmoother,
      createTracker: async () => { if (failed === "model") throw new Error("Model failed"); return { close() {} }; },
      GarmentRenderer: class { async load() { throw new Error("Image failed"); } clear() {} dispose() {} },
    });
    click("[data-ar-open]"); await root.start();
    assert.equal(root.dataset.state, failed + "_error");
    assert.equal(root.dataset.errorStage, failed);
    root.remove(); assert.equal(stopped, 1); window.close();
  }
});

test("phone links preserve page and garment but discard private parameters and fragment", () => {
  const current = "https://shop.example/fr/pages/try?variant=1&preview_theme_id=123&token=secret&customer=private#secret";
  const link = mobileHandoffUrl("https://shop.example/fr/pages/try?ignored=1", current, "block-2", "101")!;
  const url = new URL(link);
  assert.equal(url.pathname, "/fr/pages/try");
  assert.equal(url.searchParams.get("preview_theme_id"), "123");
  assert.equal(url.searchParams.get("fm_ar_variant"), "101");
  assert.equal(url.hash, ""); assert.ok(!link.includes("secret") && !link.includes("private"));
  assert.equal(incomingHandoff(link, "block-2"), "101");
  assert.equal(incomingHandoff(link, "other-block"), null);
  assert.equal(incomingHandoff("https://shop.example/?fm_ar=block-2&fm_ar_variant=oops", "block-2"), null);
  for (const base of ["http://127.0.0.1:3092", "https://localhost", "https://10.1.2.3", "https://demo.local", "https://[::1]", "https://user:pass@shop.example"]) {
    assert.equal(mobileHandoffUrl(base, current, "block-2", "101"), null, base);
  }
  const noPreview = mobileHandoffUrl("https://shop.example/fr/pages/try", "https://admin.shopify.com/?preview_theme_id=123", "block-2", "101")!;
  assert.ok(!noPreview.includes("preview_theme_id"));
});

test("incoming mobile handoff opens the matching jacket without camera permission or runtime downloads", async () => {
  const { root, window } = await ui("https://shop.example/en/products/pilot?fm_ar=pilot-block&fm_ar_variant=101");
  assert.equal(root.querySelector("dialog")!.open, true);
  assert.equal(root.querySelector("select")!.value, "101");
  assert.equal(root.querySelector("video")!.srcObject ?? null, null);
  assert.equal(root.dataset.state, "permission");
  root.remove(); window.close();
});

test("phone choice loads QR only on demand and never requests desktop camera", async () => {
  const { root, window, click } = await ui();
  let cameras = 0, downloads = 0;
  Object.defineProperty(window.navigator, "mediaDevices", { value: { getUserMedia: async () => { cameras++; throw new Error("Unexpected camera"); } } });
  root.loadHandoff = async () => { downloads++; return { MobileHandoff }; };
  assert.equal(downloads, 0);
  click("[data-ar-mobile]"); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(downloads, 1); assert.equal(cameras, 0);
  assert.equal(root.querySelector<HTMLElement>("[data-ar-mobile-panel]")!.hidden, false);
  assert.ok(root.querySelector("svg"));
  assert.equal(root.querySelector("dialog")!.open, false);
  root.remove(); window.close();
});

test("locally generated QR scans to the selected garment and changes when the selection changes", () => {
  const dom = new JSDOM(`<div data-handoff-id="demo-block" data-handoff-base="https://shop.example/en/pages/try"><button data-ar-mobile></button><section data-ar-mobile-panel hidden tabindex="-1"><button data-ar-mobile-close></button><div data-ar-qr></div><a data-ar-mobile-link hidden></a><p data-ar-mobile-unavailable hidden></p></section></div>`, {
    url: "https://shop.example/en/pages/try?token=private&preview_theme_id=123",
  });
  const root = dom.window.document.querySelector("div")!;
  const handoff = new MobileHandoff(root, new dom.window.AbortController().signal);
  handoff.show("2");
  const link = root.querySelector<HTMLAnchorElement>("[data-ar-mobile-link]")!.href;
  const svg = root.querySelector("svg")!;
  const size = Number(svg.getAttribute("viewBox")!.split(" ")[2]), scale = 5, width = size * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const match of svg.querySelector("path")!.getAttribute("d")!.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const x = Number(match[1]) * scale, y = Number(match[2]) * scale;
    for (let py = y; py < y + scale; py++) for (let px = x; px < x + scale; px++) {
      const offset = (py * width + px) * 4; pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  assert.equal(jsQR(pixels, width, width)?.data, link);
  assert.equal(new URL(link).searchParams.get("fm_ar_variant"), "2");
  assert.ok(!link.includes("private"));
  handoff.update("3");
  assert.equal(new URL(root.querySelector<HTMLAnchorElement>("a")!.href).searchParams.get("fm_ar_variant"), "3");
  (root.querySelector("[data-ar-mobile-close]") as HTMLButtonElement).click();
  assert.equal(root.querySelector<HTMLElement>("section")!.hidden, true);
  root.dataset.handoffBase = "http://127.0.0.1:3092"; handoff.show("3");
  assert.equal(root.querySelector<HTMLElement>("[data-ar-mobile-unavailable]")!.hidden, false);
  assert.equal(root.querySelector("svg"), null);
  assert.equal(root.querySelector("a")!.hasAttribute("href"), false);
  dom.window.close();
});
