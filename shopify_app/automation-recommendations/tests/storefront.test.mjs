import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const script = readFileSync(new URL("../extensions/product-recommendations/assets/recommendations.js", import.meta.url), "utf8");
function setup({ editor = false, children = [], response, remote } = {}) {
  let Element;
  const requests = [];
  const cards = { children, replaceChildren(...nodes) { this.children = nodes; } };
  const notice = { hidden: false };
  class HTMLElement {
    constructor() { this.dataset = { editor: String(editor), endpoint: "/en/recommendations/products", blockId: "one", section: "section-one", limit: "4" }; this.isConnected = true; }
    querySelector(selector) { return selector === "[data-cards]" ? cards : notice; }
  }
  runInNewContext(script, { HTMLElement, AbortController, URL, setTimeout, clearTimeout,
    location: { origin: "https://store.example" },
    customElements: { get: () => undefined, define: (_, value) => { Element = value; } },
    fetch: async (url, options) => { requests.push({ url, options }); return response ?? { ok: false }; },
    DOMParser: class { parseFromString() { return { querySelectorAll: () => remote ? [remote] : [] }; } },
  });
  const element = new Element();
  element.controller = new AbortController();
  return { element, cards, requests, notice };
}
test("empty store stays visible in editor, hidden for shoppers, with no API calls", async () => {
  for (const editor of [true, false]) {
    const { element, requests } = setup({ editor });
    element.hidden = false;
    await element.load();
    assert.equal(element.hidden, !editor);
    assert.equal(requests.length, 0);
  }
});
test("curated/demo cards survive an unavailable recommendations API", async () => {
  const { element, cards } = setup({ children: ["fallback"] });
  element.dataset.source = "123";
  element.hidden = false;
  await element.load();
  assert.deepEqual(cards.children, ["fallback"]);
  assert.equal(element.hidden, false);
});
test("related recommendations use locale-aware same-origin URL and replace only this block", async () => {
  const remote = { dataset: { blockId: "one" }, querySelector: (selector) => selector === "[data-cards]" ? { children: ["real-card"], childNodes: ["real-card"] } : { hidden: true } };
  const { element, cards, requests, notice } = setup({ children: ["demo"], remote, response: { ok: true, text: async () => "rendered section" } });
  element.dataset.source = "123";
  await element.load();
  assert.equal(requests[0].url.pathname, "/en/recommendations/products");
  assert.equal(requests[0].url.searchParams.get("product_id"), "123");
  assert.equal(requests[0].url.searchParams.get("section_id"), "section-one");
  assert.equal(requests[0].url.searchParams.get("intent"), "related");
  assert.deepEqual(cards.children, ["real-card"]);
  assert.equal(notice.hidden, true);
});
test("unexpected external endpoint is never fetched", async () => {
  const { element, requests } = setup();
  element.dataset.source = "123";
  element.dataset.endpoint = "https://other.example/recommendations/products";
  await element.load();
  assert.equal(requests.length, 0);
});
