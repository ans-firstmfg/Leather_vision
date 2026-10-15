export type ImageProviderId = "openai" | "mock" | "puter" | "cloudflare";

export function configuredProvider(): ImageProviderId {
  const provider = process.env.IMAGE_PROVIDER?.trim() || "openai";
  if (!["openai", "mock", "puter", "cloudflare"].includes(provider)) throw new Error("IMAGE_PROVIDER must be openai, mock, puter or cloudflare.");
  return provider as ImageProviderId;
}

export function puterConfiguration() {
  const model = process.env.PUTER_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
  const quality = process.env.PUTER_IMAGE_QUALITY?.trim() || "512";
  // Keep supported model/size pairs explicit so invalid settings fail before a user call.
  const models: Record<string, string[]> = {
    "gemini-3.1-flash-image": ["512", "1K", "2K", "4K"],
    "gemini-3.1-flash-lite-image": ["1K"],
    "gemini-3-pro-image": ["1K", "2K", "4K"],
  };
  if (!models[model]?.includes(quality)) throw new Error("Unsupported Puter image model or quality.");
  const testMode = process.env.PUTER_TEST_MODE || "false";
  if (!["true", "false"].includes(testMode)) throw new Error("PUTER_TEST_MODE must be true or false.");
  return { model, quality, testMode: testMode === "true" };
}

export function cloudflareConfiguration() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() || "";
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID must be a 32-character account ID.");
  if (!token || /\s/.test(token)) throw new Error("CLOUDFLARE_API_TOKEN is required.");
  const model = process.env.CLOUDFLARE_IMAGE_MODEL?.trim() || "@cf/black-forest-labs/flux-2-klein-4b";
  if (model !== "@cf/black-forest-labs/flux-2-klein-4b") throw new Error("Unsupported Cloudflare image model.");
  const size = Number(process.env.CLOUDFLARE_IMAGE_SIZE || "512");
  if (![256, 512].includes(size)) throw new Error("CLOUDFLARE_IMAGE_SIZE must be 256 or 512 for this testing provider.");
  return { accountId, token, model, size };
}

export function validateProviderConfiguration(provider = configuredProvider()) {
  if (provider === "mock") {
    if (process.env.NODE_ENV === "production") throw new Error("Mock image generation is for development only.");
  } else if (provider === "puter") {
    puterConfiguration();
  } else if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required.");
  } else if (provider === "cloudflare") {
    cloudflareConfiguration();
  } else throw new Error("Unknown image provider.");
}
