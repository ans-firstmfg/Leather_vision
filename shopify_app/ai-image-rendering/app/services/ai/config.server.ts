export type ImageProviderId = "openai" | "mock";

export function configuredProvider(): ImageProviderId {
  const provider = process.env.IMAGE_PROVIDER?.trim() || "openai";
  if (provider !== "openai" && provider !== "mock") throw new Error("IMAGE_PROVIDER must be openai or mock.");
  return provider;
}

export function validateProviderConfiguration(provider = configuredProvider()) {
  if (provider === "mock") {
    if (process.env.NODE_ENV === "production") throw new Error("Mock image generation is for development only.");
  } else if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required.");
  } else throw new Error("Unknown image provider.");
}
