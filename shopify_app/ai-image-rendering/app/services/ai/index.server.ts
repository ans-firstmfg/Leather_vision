import { openaiProvider } from "./openai.server";
import { mockProvider } from "./mock.server";
import { configuredProvider, validateProviderConfiguration, type ImageProviderId } from "./config.server";
import type { ImageEditProvider } from "./types";

export { validateProviderConfiguration } from "./config.server";

export function getImageEditProvider(provider: ImageProviderId = configuredProvider()): ImageEditProvider {
  validateProviderConfiguration(provider);
  if (provider === "puter") throw new Error("Puter generation runs in the customer's browser, not the worker.");
  return provider === "mock" ? mockProvider : openaiProvider;
}
