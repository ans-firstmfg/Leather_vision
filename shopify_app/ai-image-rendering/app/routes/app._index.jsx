import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { generationLimits } from "../services/config.server";
import { validateProviderConfiguration } from "../services/ai/index.server";
import { configuredProvider } from "../services/ai/config.server";
import { parseStored } from "../services/jobs.server";
import { DesignImage } from "../components/DesignImage";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference")?.trim().split(/[ /]/)[0] || "";
  const rows = await db.generation.findMany({ where: { shop: session.shop,
    ...(reference ? { id: reference } : {}), expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" }, take: 50 });
  let providerError = null;
  let demo = false;
  let puter = false;
  try { validateProviderConfiguration(); demo = configuredProvider() === "mock"; puter = configuredProvider() === "puter"; } catch (error) { providerError = error.message; }
  return { jobs: rows.map(({ id, status, options, variations, selectedVariation, createdAt, expiresAt }) => ({
    id, status, variations: parseStored(variations, []), selectedVariation, createdAt, expiresAt,
    demo: parseStored(options, {}).provider === "mock" || parseStored(options, {}).puter?.testMode === true,
    puter: parseStored(options, {}).provider === "puter",
  })), limits: generationLimits(), providerError, demo, puter, reference };
};

export default function Dashboard() {
  const { jobs, limits, providerError, demo, puter, reference } = useLoaderData();
  return (
    <s-page heading="Leather Vision">
      <s-section heading="Generation service">
        {providerError ? <s-banner tone="warning" heading="Provider configuration required">{providerError}</s-banner>
          : demo ? <s-banner tone="warning" heading="Demo mode — AI editing disabled">Local previews test the upload and cart flow. Requested changes are not applied. No AI API requests are made.</s-banner>
          : puter ? <s-paragraph>Puter is configured. Customers connect their own Puter account and use its allowance or credits. Results are submitted from the customer&apos;s browser.</s-paragraph>
          : <s-paragraph>Image generation is configured.</s-paragraph>}
        <s-paragraph>Daily image budget: {limits.dailyPerShop} per shop and {limits.dailyPerActor} per customer or visitor. Designs are retained for {limits.retentionDays} days.</s-paragraph>
        <s-link href="/app/additional">Setup instructions</s-link>
      </s-section>
      <s-section heading="Find an order's design">
        <Form method="get">
          <label htmlFor="design-reference">Design reference from the cart or order</label>
          <input id="design-reference" name="reference" defaultValue={reference} placeholder="Generation ID" />
          <button type="submit">Find design</button>
        </Form>
      </s-section>
      <s-section heading="Recent designs">
        {!jobs.length && <s-paragraph>No designs found. Add the Leather Vision block to your storefront to get started.</s-paragraph>}
        {jobs.map((job) => (
          <s-section key={job.id} heading={job.id}>
            {job.demo && <s-paragraph>Demo preview — AI editing disabled.</s-paragraph>}
            {job.puter && <s-paragraph>Customer-supplied Puter result. Image format is validated; AI origin is not independently verified.</s-paragraph>}
            <s-paragraph>Status: {job.status}{job.selectedVariation ? " · Selected: " + job.selectedVariation : ""}</s-paragraph>
            <s-paragraph>Created: {new Date(job.createdAt).toISOString()} · Available until: {new Date(job.expiresAt).toISOString()}</s-paragraph>
            {job.status === "ready" && job.variations.map((v) => (
              <DesignImage key={v.id} src={"/app/images/" + job.id + "/" + v.filename} label={"Design " + v.id} />
            ))}
          </s-section>
        ))}
      </s-section>
    </s-page>
  );
}
export const headers = (args) => boundary.headers(args);
