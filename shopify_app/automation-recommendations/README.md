# Automation Recommendations

A separate Shopify app with a merchant recommendations dashboard and a shopper-facing product recommendations block. No paid AI API is used.

## Add the storefront block

After starting the development preview with the new extension, open Online Store → Themes → Customize.
Choose Add section → Apps → Product recommendations (Automation Recommendations), or Add block → Apps inside an app-compatible section.
On product pages, the block uses the current product; on other pages, choose a Source product. Shopify supplies related products through its recommendations API. Fallback products can be selected manually if no automatic results are returned.
For an empty store, enable Show sample preview when empty. Sample cards are labelled fictional and have no purchase links. With demo off and no products, shoppers see no empty block; the editor shows setup guidance.
Theme support for app blocks is required. The new extension is discovered on dev startup, so stop the existing app process and restart it once after adding the extension. These storefront recommendations do not expose the merchant dashboard's stock data.

## Test with an empty store

From this folder run `npm run demo`, then open http://127.0.0.1:3091.
Choose **Try sample products** or **Preview empty store**. Fixtures are fictional and never written to Shopify. This local demo is a standalone preview; the installed app uses Shopify Polaris in the merchant admin.

## How the installed app works

1. Open Automation Recommendations from Shopify admin.
2. Click **Scan products**. The server authenticates the merchant through Shopify and reads their catalog.
3. Rules flag missing images/descriptions, zero prices and tracked stock at five units or fewer. Archived products are skipped; stock alerts only apply to active products.
4. Review each explanation and follow the link to the product in Shopify. Changes are made by the merchant, never by this app.
5. Scan again after fixing a product. Results are not retained. There is no background schedule or automatic restocking.

With no products, a scan shows **No products found** and an **Add a product** link. **Try sample demo** lets the merchant test the same rules without adding products.

Inventory counts are totals across locations, not promises of online availability. Each scan is bounded to the first 100 products by ID and 20 variants per product; a warning identifies incomplete coverage. These checks are not a complete store audit or sales forecast.

## Shopify setup

This app is registered separately in the My Store organization and linked to leather-vision-dev.myshopify.com. The CLI currently uses shopify.app.automation-recommendations.toml. Do not reuse Leather Vision's credentials or client ID.

1. From this folder run `npm run config:link` (or `shopify app config link --reset`) and sign in to your Shopify developer account.
2. Choose to create a new app named **Automation Recommendations**, or select that app if you already created it in the Dev Dashboard. Preserve the checked-in scopes, webhook subscriptions and development URL settings if the command replaces the configuration.
3. Install dependencies with `npm ci` if needed.
4. Run `npm run dev -- --store leather-vision-dev.myshopify.com` and approve installation with `read_products,read_inventory`. The CLI supplies development credentials and tunnel URLs.
5. Open the app in Shopify admin and test its empty state and sample demo.

The app has its own SQLite file at `prisma/automation.sqlite`, used only for Shopify sessions. No image jobs, app proxy or Puter account are involved. Storefront recommendations use Shopify's public same-origin endpoint.

## Commands

- `npm run demo`: standalone local preview on loopback port 3091; no dependencies needed.
- `npm test`: rule engine tests, no store/API calls.
- `npm run setup`: generate the Prisma client and apply session migrations.
- `npm run lint`, `npm run typecheck`, `npm run build`: checks and build.
- `npm run start`: production server after setup/build and new app environment configuration.

Both app configurations use this app's own client ID, July 2026 webhooks and /auth/callback. The CLI updates development URLs for its tunnel. There is no verified hosting service. A production deployment needs HTTPS, the new app's credentials, and persistent session storage. Shopify configuration deployment does not host the Node server. Hosting may have costs even though these recommendations require no AI credits.

## Windows lockfile access

If Shopify CLI reports an npm error opening package-lock.json, first stop duplicate startup commands, then run npm install --ignore-scripts --offline --no-audit --no-fund --cache .npm-cache. After installation succeeds, run npm run dev -- --store leather-vision-dev.myshopify.com --skip-dependencies-installation. The skip flag is a temporary workaround; install dependencies again whenever package.json or the lockfile changes.
