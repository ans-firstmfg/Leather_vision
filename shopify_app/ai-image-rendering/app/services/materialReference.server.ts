import { readFile } from "node:fs/promises";
import path from "node:path";
import catalogue from "../../catalog/leathers.json";

const articles = new Map(catalogue.articles.map((article) => [article.slug, article]));

export async function leatherSwatch(slug?: string): Promise<Buffer | undefined> {
  // Resolve only bundled catalogue entries; never accept a client path or remote URL.
  const article = slug ? articles.get(slug) : undefined;
  if (!article) return undefined;
  return readFile(path.resolve("extensions/leather-vision/assets", `lv-catalog-${article.slug}.jpg`));
}
