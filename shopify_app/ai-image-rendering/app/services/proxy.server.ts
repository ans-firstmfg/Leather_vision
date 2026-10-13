import { createHmac } from "node:crypto";
import { authenticate } from "../shopify.server";
import type { JobOwner } from "./jobs.server";
import { trustedProxyHops } from "./config.server";

export async function authenticateProxy(request: Request): Promise<JobOwner> {
  let context: Awaited<ReturnType<typeof authenticate.public.appProxy>>;
  try {
    context = await authenticate.public.appProxy(request);
  } catch (error) {
    // Shopify's session refresh helper can throw an empty 500 response.
    // Keep signature failures unchanged, but make connection failures actionable.
    if (error instanceof Response && error.status < 500) throw error;
    console.error("Leather Vision proxy authentication failed", {
      status: error instanceof Response ? error.status : undefined,
      errorType: error instanceof Error ? error.name : "Response",
    });
    throw Response.json({ error: "The store connection could not be verified. Please try again later. The store owner should open Leather Vision in Shopify admin to check the connection." },
      { status: 503, headers: privateHeaders });
  }
  const { session } = context;
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!session || !shop || session.shop !== shop) {
    throw Response.json({ error: "This shop is not connected to Leather Vision." }, { status: 403 });
  }
  const customerId = url.searchParams.get("logged_in_customer_id") || null;
  const actor = customerId || clientAddress(request) || "anonymous";
  return { shop, customerId,
    actorHash: createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(shop + ":" + actor).digest("hex") };
}

// Shopify's app proxy sets X-Forwarded-For to the shopper's IP; each proxy in front of
// this app (tunnel, load balancer) appends one more address after it.
export function clientAddress(request: Request) {
  const hops = request.headers.get("x-forwarded-for")?.split(",").map((hop) => hop.trim()).filter(Boolean) ?? [];
  return hops[Math.max(0, hops.length - 1 - trustedProxyHops())];
}

export function requireStorefrontAction(request: Request) {
  if (request.headers.get("X-Leather-Vision") !== "1") {
    throw Response.json({ error: "Unsupported request." }, { status: 403 });
  }
}

// Capability tokens are accepted only in the Authorization header so they never reach URLs or access logs.
export function requestToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : "";
}

export function proxyPath(request: Request) {
  const prefix = new URL(request.url).searchParams.get("path_prefix") || "/apps/leather-vision";
  if (!/^\/(apps|a|community|tools)\/[a-zA-Z0-9_-]+\/?$/.test(prefix)) {
    throw Response.json({ error: "Invalid proxy path." }, { status: 400 });
  }
  return prefix.replace(/\/$/, "");
}

export const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
