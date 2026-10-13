import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";

const source = await readFile("extensions/leather-vision/assets/leather-vision.js", "utf8");
const block = await readFile("extensions/leather-vision/blocks/leather-vision.liquid", "utf8");
const copy = JSON.parse(await readFile("extensions/leather-vision/locales/en.default.json", "utf8")).leather_vision;
const id = "00000000-0000-4000-8000-000000000000", token = "a".repeat(64);

async function storefront(fetch, resume = false) {
  const start = block.indexOf("<leather-vision"), end = block.indexOf("</leather-vision>") + "</leather-vision>".length;
  assert.ok(start >= 0 && end > start, "Liquid must render the registered custom element");
  const markup = block.slice(start, end).replace(/{%[\s\S]*?%}/g, "").replace(/{{[\s\S]*?}}/g, "");
  const dom = new JSDOM(markup, { url: "https://store.example/pages/design", runScripts: "outside-only", virtualConsole: new VirtualConsole() });
  const window = dom.window, root = window.document.querySelector("leather-vision");
  Object.assign(root.dataset, { proxyPath: "/apps/custom-design", blockId: "demo", lvCopy: JSON.stringify(copy),
    cartAddUrl: "/en/cart/add.js", cartUrl: "/en/cart" });
  root.querySelector("[data-lv-variant]").options[0].value = "123";
  let revoked = 0;
  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => { revoked++; };
  window.AbortSignal.any = (signals) => {
    const controller = new window.AbortController();
    for (const signal of signals) signal.addEventListener("abort", () => controller.abort(), { once: true });
    return controller.signal;
  };
  window.AbortSignal.timeout = () => new window.AbortController().signal;
  window.fetch = fetch;
  if (resume) window.sessionStorage.setItem("leather-vision:/apps/custom-design:demo", JSON.stringify({ id, token }));
  window.eval(source);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { dom, window, root, get revoked() { return revoked; } };
}

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
  assert.deepEqual([...root.form.elements].map((el) => el.name).filter(Boolean).slice(0, 5),
    ["leather", "color", "productType", "instructions", "image"]);
  assert.equal(root.imageInput.required, false);
  root.form.elements.leather.value = "suede";
  root.form.elements.color.value = "Brown";
  root.form.elements.productType.value = "jacket";
  root.form.elements.instructions.value = "Add brass buttons";
  await root.generate();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(posted.has("image"), false);
  assert.equal(posted.get("leather"), "suede");
  assert.equal(posted.get("instructions"), "Add brass buttons");
  assert.equal(root.results.hidden, false);
  assert.equal(root.errorEl.hidden, true);
  root.remove(); window.close();
});

test("an empty design is rejected before submitting a generation request", async () => {
  let calls = 0;
  const { root, window } = await storefront(async () => { calls++; return ready(); });
  await root.generate();
  assert.equal(calls, 0);
  assert.equal(root.errorEl.textContent, copy.error_details);
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
