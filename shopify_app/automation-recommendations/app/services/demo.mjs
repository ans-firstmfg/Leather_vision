// Synthetic fixtures only. These products are never created in Shopify.
export const demoProducts = [
  { id: "demo-jacket", title: "Sample leather jacket", status: "ACTIVE", description: "",
    mediaCount: { count: 0 }, variants: { nodes: [
      { id: "demo-jacket-m", title: "Brown / Medium", price: "120.00", inventoryQuantity: 2,
        inventoryPolicy: "DENY", inventoryItem: { tracked: true } },
    ] } },
  { id: "demo-wallet", title: "Sample leather wallet", status: "ACTIVE", description: "A compact leather wallet.",
    mediaCount: { count: 1 }, variants: { nodes: [
      { id: "demo-wallet-black", title: "Black", price: "0.00", inventoryQuantity: 0,
        inventoryPolicy: "CONTINUE", inventoryItem: { tracked: true } },
    ] } },
];
