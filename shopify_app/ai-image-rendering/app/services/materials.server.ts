const PRODUCT_TYPES: Record<string, string> = {
  briefcase: "briefcase",
  wallet: "wallet",
  belt: "belt",
  bag: "bag",
  jacket: "jacket",
  other: "leather accessory",
};

const LEATHERS: Record<string, string> = {
  "full-grain": "full-grain leather",
  "top-grain": "top-grain leather",
  suede: "suede",
  nubuck: "nubuck",
  "crazy-horse": "crazy horse leather",
};

export function leatherLabel(slug?: string): string | undefined {
  if (!slug) return undefined;
  return LEATHERS[slug] ?? slug;
}

export function productTypeLabel(slug?: string): string | undefined {
  if (!slug) return undefined;
  return PRODUCT_TYPES[slug] ?? slug;
}
