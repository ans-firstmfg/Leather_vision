import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { CameraController } from "../storefront/live-ar/camera";
import { torsoFromPose, PoseSmoother } from "../storefront/live-ar/pose";
import { mappedVariant, addVariantToCart, type ARProduct } from "../storefront/live-ar/catalog";

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

async function ui() {
  const source = await readFile("extensions/live-ar/assets/leather-vision-ar.js", "utf8");
  const dom = new JSDOM(`<first-mfg-live-ar><button data-ar-open>Open</button><dialog><button data-ar-close>Close</button><button data-ar-start>Start</button><button data-ar-switch>Switch</button><video></video><canvas></canvas><select><option value="101">Black M</option></select><p data-ar-status></p><button data-ar-cart>Buy</button><p data-ar-cart-status></p></dialog></first-mfg-live-ar>`, {
    url: "https://shop.example/en/products/pilot?variant=101", runScripts: "outside-only", pretendToBeVisual: true,
  });
  const window = dom.window;
  const root = window.document.querySelector("first-mfg-live-ar") as unknown as HTMLElement & {
    start(): Promise<void>; addToCart(): Promise<void>; loadRuntime(): Promise<unknown>;
  };
  root.dataset.product = JSON.stringify(product); root.dataset.copy = JSON.stringify({ denied: "Camera blocked", paused: "Paused" });
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
  let stopped = 0, disposed = 0, closed = 0, draws = 0, clears = 0, time = 1, points = pose();
  const frames: FrameRequestCallback[] = [];
  window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  window.cancelAnimationFrame = () => {};
  Object.defineProperty(window.navigator, "mediaDevices", { value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) } });
  const video = root.querySelector("video")!;
  Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 640 }, videoHeight: { value: 480 }, currentTime: { get: () => time } });
  root.loadRuntime = async () => ({ mappedVariant, torsoFromPose, PoseSmoother,
    createTracker: async () => ({ detectForVideo: () => ({ landmarks: [points] }), close: () => { closed++; } }),
    GarmentRenderer: class { async load() {} draw() { draws++; } clear() { clears++; } dispose() { disposed++; } },
  });
  click("[data-ar-open]"); await root.start();
  frames.shift()!(100); assert.equal(root.dataset.state, "tracking"); assert.equal(draws, 1);
  frames.shift()!(500); assert.equal(root.dataset.state, "lost", "A stalled camera must not leave a frozen garment visible");
  const before = clears; points = []; time++;
  frames.shift()!(600); assert.equal(root.dataset.state, "lost"); assert.ok(clears > before); assert.equal(draws, 1);
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
