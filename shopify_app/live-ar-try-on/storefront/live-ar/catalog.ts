export interface ARVariant { id: string; title: string; price: string; available: boolean; asset: string; fit?: string }
export interface ARProduct { id: string; title: string; url: string; demo?: boolean; variants: ARVariant[] }

export function mappedVariant(product: ARProduct, id: string): ARVariant | undefined {
  return product.variants.find(variant => variant.id === id && /^\d+$/.test(variant.id) && variant.available &&
    /^(https?:\/\/|\/\/|\/(?!\/))/.test(variant.asset));
}

export async function addVariantToCart(product: ARProduct, id: string, cartUrl: string,
  signal: AbortSignal, fetcher: typeof fetch = fetch, origin = location.origin) {
  if (product.demo) throw new Error("variant_unavailable");
  const variant = mappedVariant(product, id);
  if (!variant) throw new Error("variant_unavailable");
  const productUrl = new URL(product.url, origin), endpoint = new URL(cartUrl, origin);
  if (productUrl.origin !== origin || endpoint.origin !== origin) throw new Error("cart_error");
  productUrl.search = ""; productUrl.hash = ""; productUrl.pathname += ".js";
  const response = await fetcher(productUrl.href, { credentials: "same-origin", signal });
  if (!response.ok) throw new Error("cart_error");
  const current = await response.json();
  if (current.requires_selling_plan || !current.variants?.some((entry: { id: number; available: boolean; requires_selling_plan?: boolean }) =>
    String(entry.id) === id && entry.available && !entry.requires_selling_plan)) throw new Error("variant_unavailable");
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const result = await fetcher(endpoint.href, { method: "POST", credentials: "same-origin", signal,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ items: [{ id, quantity: 1 }] }) });
  if (!result.ok) throw new Error(result.status === 422 ? "variant_unavailable" : "cart_error");
  return result.json();
}
