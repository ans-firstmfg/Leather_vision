import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const extension = new URL("../extensions/live-ar/", import.meta.url);
const allCopy = JSON.parse(await readFile(new URL("locales/en.default.json", extension), "utf8"));
const copy = { ...allCopy.live_ar };
for (const [key, target] of Object.entries({"starting":"live_ar.permission","lost":"live_ar.body_missing","asset_error":"live_ar.asset_error","camera_preview":"live_ar.launch","adding":"live_ar.adding","add_cart":"live_ar.add_cart"})) { const [group, name] = target.split("."); copy[key] = allCopy[group][name]; }
const samples = [ ["Black cafe racer", "ar-sample-cafe.png"], ["Flame-detail jacket", "ar-sample-flame.png"], ["Raider motorcycle jacket", "ar-sample-raider.png"], ["3D white mesh (experimental)", "white-mesh.gltf.json"] ];
const product = { id: "sample", title: copy.demo, url: "", demo: true, variants: samples.map(([title, file], index) =>
  ({ id: String([1,6,7,4][index]), title, price: "", available: true, fit: ["cafe", "flame", "raider", "model3d"][index], asset: "http://127.0.0.1:3092/" + file })) };
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const block = await readFile(new URL("blocks/live-ar.liquid", extension), "utf8");
const start = block.indexOf("<first-mfg-live-ar"), end = block.indexOf("</first-mfg-live-ar>") + "</first-mfg-live-ar>".length;
let markup = block.slice(start, end)
  .replace(/{% for name in sample_names %}([\s\S]*?){% endfor %}/g, (_, template) => samples.map(([name, file], index) => template
    .replace(/{% if sample_fits\[forloop.index0\] == 'model3d' %}([\s\S]*?){% else %}([\s\S]*?){% endif %}/g, (_, model, image) => index === 3 ? model : image)
    .replace(/{% if forloop.first %}true{% else %}false{% endif %}/g, String(index === 0))
    .replaceAll("{{ sample_ids[forloop.index0] }}", String([1,6,7,4][index])).replaceAll("{{ name | escape }}", name)
    .replaceAll("{{ sample_files[forloop.index0] | asset_url }}", "/" + file)).join(""))
  .replace(/{% if demo %}([\s\S]*?){% else %}[\s\S]*?{% endif %}/g, "$1")
  .replace(/{% unless demo %}[\s\S]*?{% endunless %}/g, "")
  .replace(/<select[\s\S]*?<\/select>/, '<select id="ar-variant-demo">' + samples.map(([name], index) => `<option value="${[1,6,7,4][index]}">${name}</option>`).join("") + '</select>')
  .replace(/<button[^>]*data-ar-cart[\s\S]*?<\/button>/, "")
  .replace(/{% if block.settings.photo_url[\s\S]*?{% endif %}/, "")
  .replace(/<a href="{{ routes.cart_url }}"[\s\S]*?<\/a>/, "")
  .replace(/{{ 'live_ar\.(\w+)' \| t(?: \| escape)? }}/g, (_, key) => escape(copy[key]))
  .replaceAll("{{ ar_data | escape }}", escape(JSON.stringify(product)))
  .replaceAll("{{ ar_copy | escape }}", escape(JSON.stringify(copy)))
  .replaceAll("{{ 'leather-vision-ar-engine.js' | asset_url }}", "/leather-vision-ar-engine.js")
  .replaceAll("{{ 'live-ar-3d.js' | asset_url }}", "/live-ar-3d.js")
  .replaceAll("{{ 'live-ar-handoff.js' | asset_url }}", "/live-ar-handoff.js")
  .replaceAll("{{ block.id | escape }}", "demo")
  .replaceAll("{{ request.path | prepend: request.origin | escape }}", "http://127.0.0.1:3092/")
  .replaceAll("{{ ar_product.title | escape }}", product.title)
  .replaceAll("{{ shop.name | escape }}", "FIRST MFG / LIVE AR LAB")
  .replaceAll("{{ block.id }}", "demo")
  .replace(/{{[\s\S]*?}}/g, "");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="leather"><stop stop-color="#20211f"/><stop offset=".5" stop-color="#41433d"/><stop offset="1" stop-color="#151713"/></linearGradient></defs><path d="M80 12 145 0 200 76 255 0 320 12 308 120 370 176 360 480 40 480 30 176 92 120Z" fill="url(#leather)" stroke="#c6ccab" stroke-width="3"/><path d="m145 0 55 76 55-76-28 130-27-44-27 44Z" fill="#10120e" stroke="#9da68a"/><path d="M200 90v390M58 330h104v66H56m286-66H238v66h106" fill="none" stroke="#8b9479" stroke-width="4"/><text x="200" y="250" fill="#dae6bb" text-anchor="middle" font-size="20" font-family="sans-serif">CALIBRATION</text><text x="200" y="278" fill="#dae6bb" text-anchor="middle" font-size="14" font-family="sans-serif">NOT PRODUCT ARTWORK</text></svg>`;
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>First MFG Live AR Lab</title><link rel="stylesheet" href="/leather-vision-ar.css"><style>body{margin:0;background:#121411;color:#f4f3ef;font:16px/1.6 system-ui}main{max-width:900px;margin:10vh auto;padding:24px}h1{font-size:clamp(32px,5vw,56px);line-height:1.08;max-width:700px}p{max-width:650px;color:#c6c9c0}small{letter-spacing:.15em;color:#dae6bb}</style><main><small>FIRST MFG · EXPERIMENTAL CAMERA LAB</small><h1>Move with your next idea.</h1><p>Explore the cafe racer, Flame-detail jacket, Raider jacket and experimental 3D sample. These AI-prepared cutouts are experimental flat overlays, not fit measurements or purchasable products.</p><p>Nothing is recorded or uploaded. The tracker downloads from jsDelivr and Google only after you allow the camera. Frame your shoulders and hips, face forward and move slowly.</p>${markup}<p>Product mapping and physical-device validation are still pending. Side views, cloth simulation and arm occlusion are outside this milestone.</p></main><script src="/leather-vision-ar.js" defer></script></html>`;
const assets = new Set(["leather-vision-ar.js", "leather-vision-ar-engine.js", "live-ar-3d.js", "live-ar-handoff.js", "leather-vision-ar.css", ...samples.map(([, file]) => file)]);
createServer(async (request, response) => {
  const name = new URL(request.url || "/", "http://127.0.0.1:3092").pathname.slice(1);
  response.setHeader("Cache-Control", "no-store");
  try {
    if (!name) { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(page); }
    else if(name==='perception-check'){
      response.setHeader('Content-Type','text/html; charset=utf-8');response.end(await readFile(new URL('perception-check.html',import.meta.url),'utf8'));
    }
    else if(name==='perception-reference.png'){
      response.setHeader('Content-Type','image/png');response.end(await readFile(new URL('../.cache/perception-reference.png',import.meta.url)));
    }
    else if (name === "model-check") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(await readFile(new URL("model-check.html", import.meta.url), "utf8"));
    }
    else if (name === "fit-check") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(await readFile(new URL("fit-check.html", import.meta.url), "utf8"));
    }
    else if (name === "runtime-check") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Live AR runtime check</title><h1>Tracking runtime diagnostic</h1><p>This developer test downloads the actual pinned MediaPipe runtime and model, then analyzes a blank canvas on this device. It never opens the camera.</p><button id="run">Check runtime</button><p id="status" role="status">Ready</p><script type="module">import {createTracker} from '/leather-vision-ar-engine.js';document.querySelector('#run').onclick=async()=>{const status=document.querySelector('#status');status.textContent='Loading…';let tracker;try{tracker=await createTracker();const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const result=tracker.detectForVideo(canvas,performance.now());status.textContent='Passed: actual runtime initialized and processed a synthetic frame. Detected bodies: '+result.landmarks.length;}catch(error){status.textContent='Failed: '+error.message;}finally{tracker?.close();}};</script></html>`);
    }
    else if (name === "calibration.svg") { response.setHeader("Content-Type", "image/svg+xml"); response.end(svg); }
    else if (assets.has(name)) {
      response.setHeader("Content-Type", name.endsWith(".json") ? "application/json" : name.endsWith(".png") ? "image/png" : name.endsWith(".css") ? "text/css" : "text/javascript");
      response.end(await readFile(new URL("assets/" + name, extension)));
    } else { response.writeHead(404); response.end("Not available in the calibration preview."); }
  } catch { response.writeHead(500); response.end("Build the storefront assets, then restart this preview."); }
}).listen(3092, "127.0.0.1", () => console.info("Live AR calibration preview: http://127.0.0.1:3092 (loopback only; no purchases or uploads)"));
