import catalogue from "../../catalog/leathers.json";

const PRODUCT_TYPES: Record<string, string> = {
  briefcase: "briefcase",
  wallet: "wallet",
  belt: "belt",
  bag: "bag",
  jacket: "jacket",
  other: "leather accessory",
};

const LEATHERS: Record<string, string> = {
  ...Object.fromEntries(catalogue.articles.map((article) => [article.slug, article.name])),
  "atlas-full-grain": "Atlas full-grain leather",
  "buffalo-pebble": "Buffalo pebble leather with a pebbled grain",
  "sassari-embossed": "Sassari embossed leather with a woven basket pattern",
  "stardust-glitter-cow": "Stardust glitter cow leather",
  "tennessee-italian": "Tennessee Italian leather",
  "full-grain": "full-grain leather",
  "top-grain": "top-grain leather",
  suede: "suede",
  nubuck: "nubuck",
  "crazy-horse": "crazy horse leather",
};

export function isLeather(slug: string): boolean {
  return Object.hasOwn(LEATHERS, slug);
}

export function leatherLabel(slug?: string): string | undefined {
  if (!slug) return undefined;
  return LEATHERS[slug] ?? slug;
}

export function productTypeLabel(slug?: string): string | undefined {
  if (!slug) return undefined;
  return PRODUCT_TYPES[slug] ?? slug;
}
