import test from "node:test";
import assert from "node:assert/strict";
import { scanCatalogQuery } from "../app/services/catalog.mjs";

const connection = (nodes = [], hasNextPage = false, endCursor = null) => ({
  data: { products: { nodes, pageInfo: { hasNextPage, endCursor } } },
});
const response = (payload, ok = true) => ({ ok, json: async () => payload });
test("empty Shopify catalog returns real zero-product state", async () => {
  const result = await scanCatalogQuery({ graphql: async () => response(connection()) }, "read query");
  assert.equal(result.productCount, 0);
  assert.equal(result.demo, false);
  assert.deepEqual(result.items, []);
});
test("API and permission failures do not become a false clean scan", async () => {
  for (const payload of [{ errors: [{ message: "Access denied" }] }, {}, connection()]) {
    await assert.rejects(scanCatalogQuery({ graphql: async () => response(payload, false) }, "read query"));
  }
});
test("pagination passes the cursor and reports variant coverage", async () => {
  const cursors = [];
  const admin = { graphql: async (_, { variables }) => {
    cursors.push(variables.after);
    return response(cursors.length === 1 ? connection([], true, "next") : connection([
      { id: "p1", title: "Wallet", status: "ACTIVE", description: "Leather", mediaCount: { count: 1 },
        variants: { nodes: [], pageInfo: { hasNextPage: true } } },
    ]));
  } };
  const result = await scanCatalogQuery(admin, "read query");
  assert.deepEqual(cursors, [null, "next"]);
  assert.equal(result.productCount, 1);
  assert.equal(result.hasMore, false);
  assert.equal(result.limitedVariants, true);
});
test("scan is bounded and unfinished catalogs are disclosed", async () => {
  let calls = 0;
  const admin = { graphql: async () => response(connection([], true, `page-${++calls}`)) };
  const result = await scanCatalogQuery(admin, "read query");
  assert.equal(calls, 10);
  assert.equal(result.hasMore, true);
});
