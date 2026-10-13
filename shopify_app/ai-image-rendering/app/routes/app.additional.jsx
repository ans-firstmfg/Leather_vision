export default function Setup() {
  return (
    <s-page heading="Leather Vision setup">
      <s-section heading="Connect the storefront">
        <s-ordered-list>
          <s-list-item>Open your theme editor and add the Leather Vision app block.</s-list-item>
          <s-list-item>Select the product customers will purchase with their design. Product prices and availability come from Shopify.</s-list-item>
          <s-list-item>Keep the app proxy path in the block aligned with the store&apos;s proxy configuration.</s-list-item>
          <s-list-item>Generate a design, select a variation, and add it to the cart.</s-list-item>
        </s-ordered-list>
      </s-section>
      <s-section heading="Retrieve purchased designs">
        <s-paragraph>The cart and order item contain a Design reference. Paste its generation ID into the dashboard to view the corresponding images. Configure retention to cover your order fulfillment period.</s-paragraph>
        <s-link href="/app">Open the dashboard</s-link>
      </s-section>
    </s-page>
  );
}
