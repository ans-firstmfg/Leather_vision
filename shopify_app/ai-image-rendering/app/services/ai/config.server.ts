export type ImageProviderId = "openai" | "mock" | "puter";

export function configuredProvider(): ImageProviderId {
  const provider = process.env.IMAGE_PROVIDER?.trim() || "openai";
  if (!["openai", "mock", "puter"].includes(provider)) throw new Error("IMAGE_PROVIDER must be openai, mock or puter.");
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

export function validateProviderConfiguration(provider = configuredProvider()) {
  if (provider === "mock") {
    if (process.env.NODE_ENV === "production") throw new Error("Mock image generation is for development only.");
  } else if (provider === "puter") {
    puterConfiguration();
  } else if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required.");
  } else throw new Error("Unknown image provider.");
}
