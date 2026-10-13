export const LOW_STOCK_THRESHOLD = 5;

/** Read-only rules. No AI calls, writes, sales forecasts, or purchase orders. */
export function recommend(products, threshold = LOW_STOCK_THRESHOLD) {
  const items = [];
  for (const product of products) {
    if (product.status === "ARCHIVED") continue;
    const add = (rule, title, detail, priority = "Medium", variantId = "") => {
      items.push({ id: `${product.id}:${rule}:${variantId}`, productId: product.id,
        productTitle: product.title, title, detail, priority });
    };
    if (product.mediaCount?.count === 0) {
      add("image", "Add a product image", "Upload a clear image so shoppers can see this product.");
    }
    if (!product.description?.trim()) {
      add("description", "Add a product description", "Explain materials, sizes, care and the main benefits.");
    }
    for (const variant of product.variants?.nodes ?? []) {
      const label = variant.title === "Default Title" ? "This variant" : variant.title;
      const price = Number(variant.price);
      if (Number.isFinite(price) && price === 0) {
        add("price", "Review a zero price", `${label} is priced at zero. Confirm that this is intentional.`, "High", variant.id);
      }
      // Draft products are not yet for sale. Untracked inventory isn't evidence of low stock.
      if (product.status !== "ACTIVE" || !variant.inventoryItem?.tracked ||
          !Number.isInteger(variant.inventoryQuantity) || variant.inventoryQuantity > threshold) continue;
      const quantity = variant.inventoryQuantity;
      const backorders = variant.inventoryPolicy === "CONTINUE"
        ? " Selling when out of stock is enabled; check any backorder promise." : "";
      add("stock", quantity <= 0 ? "Review out-of-stock inventory" : "Review low stock",
        `${label} has ${quantity} units across inventory locations. Check location availability and restocking needs.${backorders}`,
        quantity <= 0 ? "High" : "Medium", variant.id);
    }
  }
  return items.sort((a, b) => (a.priority === "High" ? 0 : 1) - (b.priority === "High" ? 0 : 1));
}
