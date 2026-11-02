/** Only public page and garment identifiers cross devices. Never copy arbitrary query strings. */
export function mobileHandoffUrl(base: string, current: string, block: string, variant: string): string | null {
  try {
    const url = new URL(base), page = new URL(current);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !host.includes(".") ||
      /^(?:\d+\.){3}\d+$/.test(host) || /(?:^|\.)(?:localhost|local|test|invalid)$/.test(host) ||
      !block || !/^\d+$/.test(variant)) return null;
    url.search = ""; url.hash = "";
    const preview = page.searchParams.get("preview_theme_id");
    if (page.origin === url.origin && preview && /^\d+$/.test(preview)) url.searchParams.set("preview_theme_id", preview);
    url.searchParams.set("fm_ar", block);
    url.searchParams.set("fm_ar_variant", variant);
    return url.href;
  } catch { return null; }
}

export function incomingHandoff(current: string, block: string): string | null {
  const page = new URL(current);
  if (!block || page.searchParams.get("fm_ar") !== block) return null;
  const variant = page.searchParams.get("fm_ar_variant");
  return variant && /^\d+$/.test(variant) ? variant : null;
}
