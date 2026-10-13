import test from "node:test";
import assert from "node:assert/strict";
import { recommend } from "../app/services/recommendations.mjs";
import { demoProducts } from "../app/services/demo.mjs";

function product(overrides = {}) {
  return { id: "p1", title: "Wallet", status: "ACTIVE", description: "Leather wallet",
    mediaCount: { count: 1 }, variants: { nodes: [] }, ...overrides };
}
function variant(overrides = {}) {
  return { id: "v1", title: "Default Title", price: "20.00", inventoryQuantity: 10,
    inventoryPolicy: "DENY", inventoryItem: { tracked: true }, ...overrides };
}
test("empty store has zero recommendations and no fabricated products", () => {
  assert.deepEqual(recommend([]), []);
});
test("complete product with healthy stock needs no recommendation", () => {
  assert.deepEqual(recommend([product({ variants: { nodes: [variant()] } })]), []);
});
test("sample fixtures exercise content, zero price, stock and backorders without modification", () => {
  const before = JSON.stringify(demoProducts);
  const results = recommend(demoProducts);
  assert.equal(results.length, 5);
  assert.equal(results[0].priority, "High");
  assert.ok(results.some((item) => item.detail.includes("backorder")));
  assert.equal(JSON.stringify(demoProducts), before);
});
test("untracked, unknown and draft inventory do not produce low stock warnings", () => {
  for (const v of [variant({ inventoryQuantity: 0, inventoryItem: { tracked: false } }), variant({ inventoryQuantity: null })]) {
    assert.deepEqual(recommend([product({ variants: { nodes: [v] } })]), []);
  }
  assert.deepEqual(recommend([product({ status: "DRAFT", variants: { nodes: [variant({ inventoryQuantity: 0 })] } })]), []);
});
test("threshold includes five units but excludes six; negative inventory is high priority", () => {
  const results = recommend([product({ variants: { nodes: [variant({ id: "a", inventoryQuantity: 5 }), variant({ id: "b", inventoryQuantity: 6 }), variant({ id: "c", inventoryQuantity: -1 })] } })]);
  assert.equal(results.length, 2);
  assert.equal(results[0].priority, "High");
  assert.notEqual(results[0].id, results[1].id);
});
test("archived products are skipped; whitespace descriptions are missing", () => {
  assert.deepEqual(recommend([product({ status: "ARCHIVED", description: "" })]), []);
  assert.equal(recommend([product({ description: "  " })])[0].title, "Add a product description");
});
