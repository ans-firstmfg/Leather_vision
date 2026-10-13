import { recommend } from "./recommendations.mjs";

export async function scanCatalogQuery(admin, query) {
  const products = [];
  let after = null;
  let hasMore = false;
  let limitedVariants = false;
  // Bound request cost/time; explicitly report coverage instead of implying a full scan.
  for (let page = 0; page < 10; page++) {
    const response = await admin.graphql(query, { variables: { after } });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length || !payload.data?.products) {
      throw new Error("CATALOG_SCAN_FAILED");
    }
    const connection = payload.data.products;
    for (const product of connection.nodes) {
      limitedVariants ||= product.variants.pageInfo.hasNextPage;
      products.push(product);
    }
    hasMore = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
    if (!hasMore) break;
    if (!after) throw new Error("CATALOG_SCAN_FAILED");
  }
  return { items: recommend(products), productCount: products.length, hasMore,
    limitedVariants, scannedAt: new Date().toISOString(), demo: false };
}
