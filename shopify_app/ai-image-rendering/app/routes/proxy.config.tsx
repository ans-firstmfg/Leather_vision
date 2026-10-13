import type { LoaderFunctionArgs } from "react-router";
import { authenticateProxy, privateHeaders } from "../services/proxy.server";
import { configuredProvider, puterConfiguration, validateProviderConfiguration } from "../services/ai/config.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateProxy(request);
  try {
    validateProviderConfiguration();
    const provider = configuredProvider();
    return Response.json({ provider, ...(provider === "puter" ? { puter: puterConfiguration() } : {}) }, { headers: privateHeaders });
  } catch {
    return Response.json({ error: "Image generation is not configured. Please contact the store." }, { status: 503, headers: privateHeaders });
  }
};
