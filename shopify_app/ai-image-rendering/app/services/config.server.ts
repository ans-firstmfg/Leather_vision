export function positiveInt(name: string, fallback: number, max = 10000): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return number;
}

export function generationLimits() {
  return {
    concurrency: positiveInt("GENERATION_CONCURRENCY", 2, 8),
    activePerShop: positiveInt("GENERATION_ACTIVE_PER_SHOP", 3, 20),
    dailyPerShop: positiveInt("GENERATION_DAILY_IMAGES_PER_SHOP", 50),
    dailyPerActor: positiveInt("GENERATION_DAILY_IMAGES_PER_ACTOR", 12),
    retentionDays: positiveInt("GENERATION_RETENTION_DAYS", 30, 365),
  };
}

// Number of proxies between Shopify and this app that append to X-Forwarded-For.
export function trustedProxyHops(): number {
  const value = process.env.TRUSTED_PROXY_HOPS;
  if (value === undefined || value === "") return 1;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 10) {
    throw new Error("TRUSTED_PROXY_HOPS must be an integer between 0 and 10");
  }
  return number;
}

export function validateShopifyEnvironment() {
  for (const name of ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL"]) {
    if (!process.env[name]?.trim()) throw new Error(`${name} is required`);
  }
  const url = new URL(process.env.SHOPIFY_APP_URL!);
  if (url.hostname === "example.com" || url.protocol !== "https:") {
    throw new Error("SHOPIFY_APP_URL must be your application's HTTPS URL");
  }
  generationLimits();
  trustedProxyHops();
}
