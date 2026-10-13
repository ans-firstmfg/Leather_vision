import { openaiProvider } from "./openai.server";
import { mockProvider } from "./mock.server";
import { configuredProvider, validateProviderConfiguration, type ImageProviderId } from "./config.server";
import type { ImageEditProvider } from "./types";

export { validateProviderConfiguration } from "./config.server";

export function getImageEditProvider(provider: ImageProviderId = configuredProvider()): ImageEditProvider {
  validateProviderConfiguration(provider);
  return provider === "mock" ? mockProvider : openaiProvider;
}
