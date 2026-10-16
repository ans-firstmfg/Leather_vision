import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";

const source = await readFile("extensions/leather-vision/assets/leather-vision.js", "utf8");
const puterSource = await readFile("extensions/leather-vision/assets/leather-vision-puter.js", "utf8");
const flowSource = await readFile("extensions/leather-vision/assets/leather-vision-flow.js", "utf8");
const block = await readFile("extensions/leather-vision/blocks/leather-vision.liquid", "utf8");
const copy = JSON.parse(await readFile("extensions/leather-vision/locales/en.default.json", "utf8")).leather_vision;
const id = "00000000-0000-4000-8000-000000000000", token = "a".repeat(64);

async function storefront(fetch, resume = false, options = {}) {
  const start = block.indexOf("<leather-vision"), end = block.indexOf("</leather-vision>") + "</leather-vision>".length;
  assert.ok(start >= 0 && end > start, "Liquid must render the registered custom element");
  const markup = block.slice(start, end).replace(/{%[\s\S]*?%}/g, "").replace(/{{[\s\S]*?}}/g, "");
  const dom = new JSDOM(markup, { url: "https://store.example/pages/design", runScripts: "outside-only", virtualConsole: new VirtualConsole() });
  const window = dom.window, root = window.document.querySelector("leather-vision");
  Object.assign(root.dataset, { proxyPath: "/apps/custom-design", blockId: "demo", lvCopy: JSON.stringify(copy),
    cartAddUrl: "/en/cart/add.js", cartUrl: "/en/cart" });
  root.querySelector("[data-lv-variant]").options[0].value = "123";
  if (!options.fresh) {
    root.querySelector('input[name="leather"][value="atlas-full-grain"]').checked = true;
    root.querySelector('input[name="color"][value="Red"]').checked = true;
  }
  let revoked = 0;
  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => { revoked++; };
  window.AbortSignal.any = (signals) => {
    const controller = new window.AbortController();
    for (const signal of signals) signal.addEventListener("abort", () => controller.abort(), { once: true });
    return controller.signal;
  };
  window.AbortSignal.timeout = () => new window.AbortController().signal;
  window.fetch = (url, init) => String(url).endsWith("/config")
    ? options.config ? options.config(url, init) : Promise.resolve(Response.json({ provider: options.puter ? "puter" : "openai",
      puter: { model: "gemini-3.1-flash-image", quality: "512", testMode: false } })) : fetch(url, init);
  if (options.puter) { window.puter = options.puter; window.eval(puterSource); }
  if (resume) window.sessionStorage.setItem("leather-vision:/apps/custom-design:demo", JSON.stringify({ id, token }));
  window.eval(flowSource);
  window.eval(source);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { dom, window, root, get revoked() { return revoked; } };
}

test("Generate opens Puter sign-in before reserving a generation and continues once", async () => {
  let signedIn = false, signIns = 0, requests = 0, finishSignIn;
  const sdk = { auth: { isSignedIn: () => signedIn, signIn: () => {
    signIns++; return new Promise(resolve => { finishSignIn = () => { signedIn = true; resolve(); }; });
  } } };
  const { root, window } = await storefront(async (url, options) => {
    if (options.method === "POST") { requests++; return Response.json({ generationId: id, token }); }
    return ready();
  }, false, { puter: sdk });
  await root.providerReady;
  const pending = root.generate();
  assert.equal(signIns, 1, "Sign-in must start synchronously within the submit gesture");
  assert.equal(requests, 0, "Do not reserve a job until sign-in completes");
  assert.equal(root.submitBtn.disabled, true);
  await root.generate();
  assert.equal(signIns, 1, "Repeated clicks cannot open duplicate popups");
  assert.equal(root.querySelector("[data-lv-puter-connect]"), null);
  finishSignIn(); await pending;
  assert.equal(requests, 1);
  root.remove(); window.close();
});

test("cancelled or blocked Puter sign-in leaves choices intact and creates no job", async () => {
  let requests = 0;
  const sdk = { auth: { isSignedIn: () => false, signIn: async () => { throw new Error("popup closed"); } } };
  const { root, window } = await storefront(async () => { requests++; return ready(); }, false, { puter: sdk });
  await root.providerReady;
  root.form.elements.instructions.value = "Make a jacket";
  await root.generate();
  assert.equal(requests, 0);
  assert.equal(root.submitBtn.disabled, false);
  assert.equal(root.errorEl.textContent, copy.puter_connect_required);
  assert.equal(root.form.elements.instructions.value, "Make a jacket");
  assert.equal(root.form.elements.color.value, "Red");
  root.remove(); window.close();
});

for (const referenceImage of [undefined, "data:image/png;base64,cmVmZXJlbmNl"]) {
  test("Puter generates and saves private results " + (referenceImage ? "with a sample" : "from text"), async () => {
    const aiCalls = [], uploads = [], downloads = [];
    const sdk = { auth: { isSignedIn: () => true }, ai: { txt2img: async (prompt, options) => {
      aiCalls.push({ prompt, options }); return { src: "https://images.puter.example/result.png" };
    } } };
    const { root, window } = await storefront(async (url, options) => {
      if (url === "https://images.puter.example/result.png") {
        downloads.push(options); return new Response("image-bytes", { headers: { "Content-Type": "image/png" } });
      }
      if (String(url).endsWith("/result")) { uploads.push(options); return Response.json({ status: "ready" }); }
      if (options.method === "POST") return Response.json({ generationId: id, token, status: "awaiting_client",
        clientGeneration: { prompts: ["Create a brown suede jacket"], model: "gemini-3.1-flash-image", quality: "512", testMode: false,
          ...(referenceImage ? { referenceImage } : {}) } });
      return ready();
    }, false, { puter: sdk });
    await root.providerReady;
    await root.generate();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(aiCalls.length, 1);
    assert.equal(aiCalls[0].options.model, "gemini-3.1-flash-image");
    assert.equal(aiCalls[0].options.quality, "512");
    assert.equal(aiCalls[0].options.input_image, referenceImage);
    assert.equal(downloads[0].credentials, "omit");
    assert.equal(downloads[0].headers, undefined);
    assert.equal(uploads[0].body.get("variationId"), "v1");
    assert.equal(uploads[0].body.get("image").size, 11);
    assert.equal(uploads[0].headers.Authorization, "Bearer " + token);
    assert.equal(root.results.hidden, false);
    root.remove(); window.close();
  });
}

test("Puter failure cancels the job without exposing provider messages or retrying AI", async () => {
  let aiCalls = 0, cancelled = 0;
  const sdk = { auth: { isSignedIn: () => true }, ai: { txt2img: async () => {
    aiCalls++; throw new Error("Secret raw provider diagnostic");
  } } };
  const { root, window } = await storefront(async (url, options) => {
    if (String(url).endsWith("/result")) { assert.equal(options.body.get("action"), "cancel"); cancelled++; return Response.json({ status: "failed" }); }
    return Response.json({ generationId: id, token, clientGeneration: { prompts: ["Design"], model: "gemini-3.1-flash-image", quality: "512" } });
  }, false, { puter: sdk });
  await root.generate();
  assert.equal(aiCalls, 1); assert.equal(cancelled, 1);
  assert.equal(root.errorEl.textContent, copy.puter_error);
  assert.equal(root.submitBtn.disabled, false);
  root.remove(); window.close();
});

test("reload of an interrupted Puter generation never invokes AI again", async () => {
  let aiCalls = 0, cancelled = 0;
  const sdk = { auth: { isSignedIn: () => true }, ai: { txt2img: async () => { aiCalls++; } } };
  const { root, window } = await storefront(async (url, options) => {
    if (options.method === "POST") { assert.ok(String(url).endsWith("/result")); cancelled++; return Response.json({ status: "failed" }); }
    return Response.json({ status: "awaiting_client", variations: [] });
  }, true, { puter: sdk });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(aiCalls, 0); assert.equal(cancelled, 1);
  assert.equal(root.errorEl.textContent, copy.puter_interrupted);
  root.remove(); window.close();
});

test("Puter credit exhaustion gives an account-specific message without retrying", async () => {
  let calls = 0;
  const sdk = { auth: { isSignedIn: () => true }, ai: { txt2img: async () => {
    calls++; throw { code: "insufficient_funds", message: "Private billing diagnostic" };
  } } };
  const { root, window } = await storefront(async (url) => String(url).endsWith("/result")
    ? Response.json({ status: "failed" }) : Response.json({ generationId: id, token,
      clientGeneration: { prompts: ["Design"], model: "gemini-3.1-flash-image", quality: "512" } }), false, { puter: sdk });
  await root.generate();
  assert.equal(calls, 1);
  assert.equal(root.errorEl.textContent, copy.puter_error_funds);
  root.remove(); window.close();
});

test("disconnect stops the Puter flow without requesting another variation or uploading late results", async () => {
  let resolveImage, calls = 0, uploads = 0;
  const sdk = { auth: { isSignedIn: () => true }, ai: { txt2img: () => {
    calls++; return new Promise((resolve) => { resolveImage = resolve; });
  } } };
  const { root, window } = await storefront(async (url) => {
    if (String(url).endsWith("/result")) uploads++;
    return Response.json({ generationId: id, token, clientGeneration: {
      prompts: ["Design one", "Design two"], model: "gemini-3.1-flash-image", quality: "512" } });
  }, false, { puter: sdk });
  const pending = root.generate();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  root.remove();
  await pending;
  resolveImage({ src: "https://images.puter.example/late.png" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1); assert.equal(uploads, 0);
  window.close();
});

const ready = () => Response.json({ status: "ready", variations: [
  { id: "v1", filename: "variation-1.png", url: "/apps/custom-design/images/" + id + "/variation-1.png" },
  { id: "v2", filename: "variation-2.png", url: "/apps/custom-design/images/" + id + "/variation-2.png" },
] });

test("customers can generate from choices with the sample upload after instructions and optional", async () => {
  let posted;
  const instance = await storefront(async (url, options) => {
    if (options.method === "POST") {
      posted = options.body;
      return Response.json({ generationId: id, token, status: "pending" }, { status: 202 });
    }
    if (url.includes("/images/")) return new Response("image", { headers: { "Content-Type": "image/png" } });
    return ready();
  });
  const { root, window } = instance;
  assert.deepEqual([...new Set([...root.form.elements].map((el) => el.name).filter(Boolean))].slice(0, 5),
    ["leather", "color", "instructions", "image", "variationCount"]);
  assert.equal(root.imageInput.required, false);
  root.form.elements.leather.value = "atlas-full-grain";
  root.form.elements.color.value = "Camel";
  root.form.elements.instructions.value = "Add brass buttons";
  await root.generate();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(posted.has("image"), false);
  assert.equal(posted.get("leather"), "atlas-full-grain");
  assert.equal(posted.get("color"), "Camel");
  assert.equal(posted.get("instructions"), "Add brass buttons");
  assert.equal(root.results.hidden, false);
  assert.equal(root.errorEl.hidden, true);
  root.remove(); window.close();
});

test("missing required progressive choices are rejected before submitting a generation", async () => {
  let calls = 0;
  const { root, window } = await storefront(async () => { calls++; return ready(); }, false, { fresh: true });
  await root.generate();
  assert.equal(calls, 0);
  assert.equal(root.form.checkValidity(), false);
  assert.equal(window.document.activeElement, root.querySelector('input[name="leather"]'));
  root.remove(); window.close();
});

test("all three full-width sections stay visible and edits preserve selections and notes", async () => {
  const { root, window } = await storefront(async () => ready(), false, { fresh: true });
  const steps = [...root.querySelectorAll('[data-flow-step]')];
  const visible = () => steps.filter(step => !step.hidden).map(step => step.dataset.flowStep);
  assert.deepEqual(visible(), ['1', '2', '3']);
  assert.equal(root.querySelector('[data-flow-go]'), null);
  root.form.elements.instructions.value = 'Make a wallet';
  root.querySelector('input[name="color"][value="Teal"]').click();
  root.querySelector('input[value="atlas-full-grain"]').click();
  assert.deepEqual(visible(), ['1', '2', '3']);
  assert.equal(steps[0].classList.contains('is-complete'), true);
  assert.equal(steps[1].classList.contains('is-complete'), true);
  root.querySelector('input[value="buffalo-pebble"]').click();
  assert.equal(root.form.elements.color.value, 'Teal');
  assert.equal(root.form.elements.instructions.value, 'Make a wallet');
  assert.deepEqual(visible(), ['1', '2', '3']);
  root.remove(); window.close();
});

test("category and color alone can generate; product type, notes and reference stay optional", async () => {
  let posted;
  const { root, window } = await storefront(async (url, options) => {
    if (options.method === "POST") { posted = options.body; return Response.json({ generationId: id, token }); }
    if (url.includes("/images/")) return new Response("image", { headers: { "Content-Type": "image/png" } });
    return ready();
  }, false, { fresh: true });
  root.querySelector('input[value="sassari-embossed"]').click();
  await root.generate();
  assert.equal(posted, undefined, "Color is required before reserving a generation");
  root.querySelector('input[name="color"][value="Baby Blue"]').click();
  assert.equal(root.form.elements.instructions.required, false);
  assert.equal(root.form.elements.productType, undefined);
  await root.generate();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(posted.get("leather"), "sassari-embossed");
  assert.equal(posted.get("color"), "Baby Blue");
  assert.equal(posted.has("productType"), false);
  assert.equal(posted.get("instructions"), "");
  assert.equal(posted.has("image"), false);
  assert.equal(root.results.hidden, false);
  root.remove(); window.close();
});

test("real storefront markup resumes a job, selects a variation, and sends only safe cart properties", async () => {
  const calls = [];
  const instance = await storefront(async (url, options) => {
    calls.push({ url, options });
    if (url === "/en/cart/add.js") return Response.json({ description: "Sold out" }, { status: 422 });
    if (options.method === "POST") return Response.json({ properties: {
      "Design reference": id + " / v2", _leather_vision_generation: id, _leather_vision_variation: "v2",
    } });
    return ready();
  }, true);
  const { root } = instance;
  assert.equal(root.querySelectorAll(".lv__card").length, 2);
  assert.equal(root.querySelector("[data-lv-cart]").disabled, true);
  root.querySelectorAll(".lv__card button")[1].click();
  assert.equal(root.querySelectorAll(".lv__card button")[1].getAttribute("aria-pressed"), "true");
  assert.equal(root.querySelector("[data-lv-cart]").disabled, false);
  root.querySelector("[data-lv-cart]").click();
  root.querySelector("[data-lv-cart]").click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const cartCalls = calls.filter((call) => call.url === "/en/cart/add.js");
  assert.equal(cartCalls.length, 1);
  const body = JSON.parse(cartCalls[0].options.body);
  assert.equal(body.items[0].id, "123");
  assert.equal(body.items[0].properties._leather_vision_variation, "v2");
  assert.ok(!cartCalls[0].options.body.includes(token));
  assert.equal(root.querySelector("[data-lv-error]").textContent, "Sold out");
  assert.equal(root.querySelector("[data-lv-cart]").disabled, false);
  assert.equal(calls[0].options.headers.Authorization, "Bearer " + token);
  const imageCalls = calls.filter((call) => String(call.url).includes("/images/"));
  assert.equal(imageCalls.length, 2);
  for (const call of imageCalls) {
    assert.ok(!String(call.url).includes(token), "image URLs never carry the token");
    assert.equal(call.options.headers.Authorization, "Bearer " + token);
  }
  assert.equal(root.querySelector(".lv__card-img").getAttribute("src"), "blob:test");
  root.remove(); instance.window.close();
});

test("provider connection recovers on Generate without reloading or replaying a generation", async () => {
  let configs = 0, posts = 0;
  const instance = await storefront(async (_url, options) => {
    if (options.method === "POST") posts++;
    return Response.json({ error: "Test complete" }, { status: 422 });
  }, false, { config: async () => ++configs === 1
    ? new Response("Tunnel unavailable", { status: 503 })
    : Response.json({ provider: "cloudflare" }) });
  const { root, window } = instance;
  assert.match(root.querySelector("[data-lv-error]").textContent, /HTTP 503/);
  root.querySelector("[data-lv-form]").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(configs, 2);
  assert.equal(posts, 1);
  assert.equal(root.providerError, false);
  root.remove(); window.close();
});

test("provider configuration failures preserve actionable errors and never reserve a job", async () => {
  let posts = 0;
  const instance = await storefront(async () => { posts++; }, false, {
    config: async () => Response.json({ error: "Image generation is not configured. Please contact the store." }, { status: 503 }),
  });
  const { root, window } = instance;
  root.querySelector("[data-lv-form]").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(root.querySelector("[data-lv-error]").textContent, "Image generation is not configured. Please contact the store.");
  assert.equal(posts, 0);
  assert.equal(root.querySelector("[data-lv-submit]").disabled, false);
  root.remove(); window.close();
});

test("HTML gateway timeouts show the HTTP status without retrying a generation", async () => {
  let posts = 0;
  const instance = await storefront(async (_url, options) => {
    if (options.method === "POST") posts++;
    return new Response("<html>Gateway timeout</html>", { status: 504 });
  });
  const { root, window } = instance;
  Object.defineProperty(root.querySelector("[data-lv-image]"), "files", {
    value: [new window.File(["reference"], "sketch.png", { type: "image/png" })],
  });
  root.querySelector("[data-lv-form]").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(posts, 1);
  assert.equal(root.querySelector("[data-lv-error]").textContent, copy.error_connection + " (HTTP 504)");
  assert.equal(root.querySelector("[data-lv-submit]").disabled, false);
  assert.equal(root.job, null);
  root.remove(); window.close();
});

test("reload recovery polls without starting another paid generation", async () => {
  let posts = 0;
  const instance = await storefront(async (_url, options) => { if (options.method === "POST") posts++; return ready(); }, true);
  assert.equal(posts, 0);
  assert.equal(instance.root.querySelector("[data-lv-results]").hidden, false);
  instance.root.remove(); instance.window.close();
});

test("resumed demo previews remain labelled and carry the demo marker into cart requests", async () => {
  let cartBody;
  const instance = await storefront(async (url, options) => {
    if (url === "/en/cart/add.js") {
      cartBody = JSON.parse(options.body);
      return Response.json({ description: "Test complete" }, { status: 422 });
    }
    if (options.method === "POST") return Response.json({ properties: {
      "Design mode": "Demo - AI editing disabled", "Design reference": id + " / v1",
      _leather_vision_generation: id, _leather_vision_variation: "v1",
    } });
    const response = await ready().json();
    return Response.json({ ...response, demo: true });
  }, true);
  assert.equal(instance.root.querySelector("[data-lv-demo]").hidden, false);
  assert.equal(instance.root.querySelector("[data-lv-status]").textContent, copy.demo_done);
  instance.root.querySelector(".lv__card button").click();
  instance.root.querySelector("[data-lv-cart]").click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(cartBody.items[0].properties["Design mode"], "Demo - AI editing disabled");
  assert.ok(!JSON.stringify(cartBody).includes(token));
  instance.root.remove(); instance.window.close();
});

test("disconnect aborts requests and revokes upload previews", async () => {
  const instance = await storefront(async () => ready());
  const file = new instance.window.File(["reference"], "sketch.png", { type: "image/png" });
  const input = instance.root.querySelector("[data-lv-image]");
  Object.defineProperty(input, "files", { value: [file] });
  input.dispatchEvent(new instance.window.Event("change"));
  const signal = instance.root.controller.signal;
  instance.root.remove();
  assert.equal(signal.aborted, true);
  assert.equal(instance.revoked, 1);
  instance.window.close();
});

test("Material Builder keyboard tabs remain usable after reconnecting", async () => {
  const dom = new JSDOM('<material-builder-component><button class="material-builder__tab" aria-selected="true" aria-controls="p1">Leather</button><button class="material-builder__tab" aria-selected="false" aria-controls="p2">Hardware</button><div class="material-builder__panel" id="p1"></div><div class="material-builder__panel" id="p2"></div></material-builder-component>', { runScripts: "outside-only" });
  const code = (await readFile("../../shopify_store/assets/material-builder.js", "utf8"))
    .replace("import { Component } from '@theme/component';", "class Component extends HTMLElement { connectedCallback() {} updatedCallback() {} disconnectedCallback() {} }");
  dom.window.eval(code);
  const root = dom.window.document.querySelector("material-builder-component"), tabs = root.querySelectorAll("button");
  tabs[0].dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  assert.equal(tabs[1].getAttribute("aria-selected"), "true");
  assert.equal(tabs[1].tabIndex, 0);
  assert.equal(root.querySelector("#p1").hidden, true);
  assert.equal(root.querySelector("#p2").hidden, false);
  root.remove(); dom.window.document.body.append(root);
  tabs[1].dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
  assert.equal(tabs[0].getAttribute("aria-selected"), "true");
  root.remove(); dom.window.close();
});

test("results that cannot be displayed show an error instead of an empty panel", async () => {
  const instance = await storefront(async () => Response.json({ status: "ready", variations: [
    { id: "v1", filename: "variation-1.png", url: "https://attacker.example/apps/custom-design/images/x/variation-1.png" },
  ] }), true);
  assert.equal(instance.root.querySelector("[data-lv-results]").hidden, true);
  assert.equal(instance.root.querySelector("[data-lv-error]").textContent, copy.error_generic);
  instance.root.remove(); instance.window.close();
});

test("disconnect revokes loaded design images", async () => {
  const instance = await storefront(async () => ready(), true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  instance.root.remove();
  assert.equal(instance.revoked, 2);
  instance.window.close();
});
