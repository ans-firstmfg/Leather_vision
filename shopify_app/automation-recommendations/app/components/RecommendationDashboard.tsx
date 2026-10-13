import type { JSX } from "react";

export interface ScanResult {
  error?: string;
  demo?: boolean;
  productCount: number;
  items: { id: string; title: string; productTitle: string; detail: string; priority: string; productId: string }[];
  scannedAt?: string;
  hasMore?: boolean;
  limitedVariants?: boolean;
}

export default function RecommendationDashboard({ result, busy, run }: {
  result?: ScanResult;
  busy: boolean;
  run: (intent: string) => void;
}): JSX.Element {
  return <s-page heading="Automation Recommendations">
    <s-section heading="Find your next store improvement">
      <s-paragraph>Review product content, zero prices and tracked stock at five units or fewer. You decide what to change.</s-paragraph>
      <s-stack direction="inline" gap="base">
        <s-button variant="primary" disabled={busy} loading={busy} onClick={() => run("scan")}>Scan products</s-button>
        <s-button disabled={busy} onClick={() => run("demo")}>Try sample demo</s-button>
      </s-stack>
      <s-paragraph>No paid AI API is used. Scans run when you click the button; there is no scheduled automation.</s-paragraph>
    </s-section>
    {result?.error && <s-banner tone="critical" heading="Scan unavailable">{result.error}</s-banner>}
    {result && !result.error && <>
      {result.demo && <s-banner tone="info" heading="Sample demo">These are fictional products. Nothing was added to your store.</s-banner>}
      <s-section heading={result.demo ? "Sample results" : "Scan results"}>
        <s-paragraph>{result.productCount} products checked · {result.items.length} recommendations</s-paragraph>
        {result.scannedAt && <s-paragraph>Scanned at {result.scannedAt}</s-paragraph>}
        {(result.hasMore || result.limitedVariants) && <s-banner tone="warning" heading="Partial catalog scan">This version checks up to 100 products and the first 20 variants per product. Additional products or variants were not checked.</s-banner>}
        {result.productCount === 0 ? <>
          <s-heading>No products found</s-heading>
          <s-paragraph>Add your first product in Shopify, then scan again. You can try the sample demo right now.</s-paragraph>
          <s-link href="shopify://admin/products/new">Add a product</s-link>
        </> : result.items.length === 0 && <s-paragraph>No issues found by these checks. This is not a complete store audit.</s-paragraph>}
      </s-section>
      {result.items.map((item) => <s-section key={item.id} heading={item.title}>
        <s-badge tone={item.priority === "High" ? "critical" : "warning"}>{item.priority}</s-badge>
        <s-paragraph>{item.productTitle}</s-paragraph>
        <s-paragraph>{item.detail}</s-paragraph>
        {!result.demo && <s-link href={`shopify://admin/products/${item.productId.split("/").pop()}`}>Review product in Shopify</s-link>}
      </s-section>)}
    </>}
  </s-page>;
}
