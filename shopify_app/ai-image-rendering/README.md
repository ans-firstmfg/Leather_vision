# Leather Vision

Leather Vision is a Shopify embedded app and theme app extension. Customers choose leather, color and product type, add instructions and an optional sample image, generate variations, select a design, and attach its reference to a purchasable product in the cart. Stitching, hardware and variation count are available under More design options.

## Architecture

- React Router 7 / React 19 serves the merchant dashboard, authentication, webhooks, and app proxy routes.
- Shopify's official React Router package handles merchant authentication, signed proxy requests, and webhooks.
- Prisma / SQLite stores Shopify sessions and durable generation jobs.
- A leased database queue runs within the long-lived Node server. Pending jobs resume after a restart; interrupted provider calls fail rather than being retried and billed automatically.
- Puter jobs run in the customer's browser instead of the worker. The server reserves quota and stores validated result uploads under the same private design references.
- Sharp validates and normalizes uploads and provider output.
- The theme extension calls the app through the signed store proxy. Every job requires both the originating shop/customer context and a private random access token, sent only in the Authorization header (never in URLs). The storefront loads result images with that header and displays them as local blob URLs.
- Image files live in GENERATION_DATA_DIR. The database stores references, never image blobs.
- The separate Horizon theme is located at ../../shopify_store.

## Local setup

Use Node 22.12 or newer in the Node 22 series, or a supported newer Node version, npm, and Shopify CLI.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` **only if you do not already have an environment file**. Preserve existing credentials.
3. Configure Puter, OpenAI, or the local mock as described below.
4. Run `npm run setup`. The additive generation migration preserves existing Shopify sessions.
5. Run `npm run dev`. Shopify CLI supplies Shopify credentials and the development HTTPS tunnel.
6. Open the theme editor and add the Leather Vision app block. Select a dedicated custom-design product and confirm the proxy path.

The Prisma helper defaults DATABASE_URL to `file:dev.sqlite`, preserving the original database at `prisma/dev.sqlite`. In development, Prisma and Shopify CLI load the existing environment file.

### Recovering from a development React error

If the browser shows `Cannot read properties of null (reading 'useContext')`, stop the old development server, run `npm ci`, and restart `npm run dev`. Reopen the preview link printed by that new session and hard-refresh the browser (Ctrl+Shift+R). Vite explicitly deduplicates React and prebundles the client runtime together; an old tab can still retain incompatible dependency chunks until refreshed. React and React DOM must use matching versions.

For an HTTP 504 on `/apps/leather-vision/generations`, check the running development terminal for `Leather Vision upload` logs. `received`, `authenticated`, `upload-read`, `reserved`, and `queued` identify how far the request got; logs contain no uploaded image, instructions, or access tokens. No `received` log means the request did not reach this route. `provider-not-configured` means the selected provider needs its environment configuration corrected. Keep the public tunnel running; a localhost-only server cannot receive Shopify app proxy requests. A CSS preload warning is unrelated to these proxy requests. Do not automatically retry a generation POST after a gateway timeout: the app may have accepted it before the gateway lost the response.

## OpenAI configuration

Set IMAGE_PROVIDER=openai (the default), OPENAI_API_KEY and optionally OPENAI_IMAGE_MODEL (existing default: gpt-image-1). With a sample image, the app sends the normalized reference and instructions to the Images Edit API. Without one, it sends the selected specifications to the Images Generation API. A product type or product description is required when no image is supplied. Ensure the selected model is available to your account.

Uploaded images and customer instructions are sent to OpenAI. Publish your store's appropriate customer-facing privacy information before using the feature publicly.

## Puter configuration

Set these in your existing `.env`, then restart `npm run dev` and refresh the storefront:

```dotenv
IMAGE_PROVIDER=puter
PUTER_IMAGE_MODEL=gemini-3.1-flash-image
PUTER_IMAGE_QUALITY=512
PUTER_TEST_MODE=false
```

No OpenAI or Google API key is required for this mode. Click **Connect Puter**, allow its sign-in popup, and sign in to your own Puter account. Choose specifications and optionally supply a sample image, then generate. Start with **one variation** to check your account's allowance. A signed-in Puter account covers each variation's usage; its free monthly allowance is limited and exhausted accounts may be prompted to upgrade. See [Puter's user-pays documentation](https://docs.puter.com/user-pays-model/).

The Puter SDK is loaded only when this provider is selected. The server's validated choices build the prompts and normalize the optional reference. The browser calls `puter.ai.txt2img` with the configured model/quality and optional data-URI reference; returned images are downloaded in the browser and uploaded as bytes to `POST /apps/leather-vision/generations/:id/result`. Provider URLs are never fetched by our backend, and Puter account credentials are never sent to our backend. The result endpoint verifies the signed proxy, ownership, capability, count/order, request size, decoded image format and pixel limits, and stores private normalized PNGs. Selection and cart attachment use the existing routes.

`PUTER_TEST_MODE=true` asks Puter for sample images without generation credits; it does **not** apply your instructions or reference. Sample results are labelled as demos in the storefront, dashboard and cart. Supported quality pairs are Flash `512`/`1K`/`2K`/`4K`, Flash Lite `1K`, and Pro `1K`/`2K`/`4K`. The default is Flash at 512, with a square aspect ratio. [Puter image API documentation](https://docs.puter.com/AI/txt2img/) describes these options and account-dependent access.

Puter jobs use `awaiting_client` while the browser generates and `receiving_client` during a bounded result upload. Waiting jobs count against active quotas and fail after 30 minutes without activity; stale result-upload leases fail after 60 seconds. Reloads cancel interrupted waiting jobs and never automatically repeat AI calls. Already-ready designs recover normally. A provider request can finish or consume allowance after a tab closes or times out; check Puter usage before starting again.

These results are customer-submitted bytes: the server can validate image safety and job ownership but cannot independently prove AI origin or that the prompt was followed. The merchant dashboard and cart identify the Puter source. Verify designs before fulfillment. Browser popup restrictions, third-party blockers, Shopify theme preview frames, CORS on temporary output URLs, and Puter account/model access need a live development-store check. Test in the actual storefront tab if the theme-editor iframe blocks sign-in.

### Free local demo

Set `IMAGE_PROVIDER=mock` in your existing `.env`, then restart `npm run dev`. No API key or credits are needed. Sharp creates previews of the uploaded image with an embedded demo watermark, or a labelled placeholder if no image is supplied; requested modifications are **not applied**. The storefront and merchant dashboard label demo results, and cart items include **Design mode: Demo - AI editing disabled**. Use a development store to test both optional-upload paths, refresh recovery, private previews, selection and cart attachment. Normal quotas and retention still apply.

Each job saves its provider when created, so switching configuration cannot turn a queued demo into a paid request. Mock mode is rejected in production. To enable actual AI editing later, set `IMAGE_PROVIDER=openai`, configure funded API credentials and an available image model, and restart. Existing demo results remain labelled.

## Customer purchase flow

1. Choose the purchase product in the Leather Vision app block settings.
2. The customer chooses specifications, optionally uploads a sample image, generates variations, and selects one.
3. The selection endpoint verifies ownership and persists the chosen variation.
4. Shopify's locale-aware Cart Ajax API adds the selected variant at its normal Shopify price and availability.
5. The cart/order item contains a visible **Design reference** plus private `_leather_vision_generation` and `_leather_vision_variation` properties. Access tokens and image capability URLs are never placed in cart properties.
6. The merchant pastes the generation ID from an order into the authenticated dashboard to view its images.

The current picker is intended for a dedicated custom-design product with a small variant set (up to 50 variants). Products with large variant catalogs or required selling plans need a separate product-option/selling-plan integration.

## Limits, storage, and retention

Defaults:

| Variable | Default |
| --- | --- |
| GENERATION_CONCURRENCY | 2 active jobs across the database |
| GENERATION_ACTIVE_PER_SHOP | 3 active jobs, including browser generation and result uploads |
| GENERATION_DAILY_IMAGES_PER_SHOP | 50 images per rolling 24 hours |
| GENERATION_DAILY_IMAGES_PER_ACTOR | 12 images per rolling 24 hours |
| GENERATION_RETENTION_DAYS | 30 days |
| GENERATION_DATA_DIR | .data |
| TRUSTED_PROXY_HOPS | 1 (proxies between Shopify and this app that append to X-Forwarded-For) |

Customer quotas use the signed customer ID; guest quotas use a keyed hash of the shopper IP that Shopify's app proxy places in X-Forwarded-For (counting TRUSTED_PROXY_HOPS entries back from the end; set 0 when nothing sits in front of the app, 2 for a CDN plus load balancer), with the shop-wide quota as an additional cap. Reservations include failed jobs to prevent repeated invalid submissions from bypassing limits.

Uploads are limited to 8 MB and 16 megapixels; only still PNG, JPEG, and WebP images are accepted. The multipart stream is bounded before parsing. Generation failures return safe messages without raw provider details.

Jobs expire after the configured retention period; saving a selection extends retention from that selection time. The worker removes expired database records and their image directories. Set retention to cover your fulfillment and support period and back up required order designs. App uninstall deletes that shop's sessions and fails its queued jobs, but keeps existing designs so orders can still be fulfilled after an accidental reinstall. Shopify's mandatory compliance webhooks are handled at /webhooks/compliance: shop/redact (48 hours after uninstall) deletes the shop's designs, images, and sessions; customers/redact deletes the signed-in customer's designs; customers/data_request is acknowledged and logged with a design count. Guest designs carry no customer ID and cannot be matched to a redaction request; orders_to_redact cannot be mapped without an orders scope. Legacy image directories created before the new database job system are preserved.

This deployment supports a single long-lived application instance with persistent SQLite and filesystem storage. Do not deploy it to an ephemeral filesystem or a serverless request-only runtime. Multiple hosts require a shared production database, durable object storage, and a separately operated worker before scaling.

## Deployment

1. Set the actual production application_url and /auth/callback redirect URL in shopify.app.toml. The checked-in example URLs are placeholders; development CLI replaces them for a dev session.
2. Supply SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SCOPES=write_app_proxy, DATABASE_URL, and your chosen image provider configuration at runtime.
3. Run `npm run setup`, `npm run build`, and `npm run start`.
4. Deploy app configuration and the theme extension with `npm run deploy`. Hosting the Node app and publishing the storefront theme are separate operations.

The Dockerfile builds with development tools, prunes them for runtime, excludes secrets/local data, and runs as the node user. Mount a persistent volume at /app/storage; this contains the SQLite database and image files. Keep the volume writable by the node user.

The only requested Shopify scope is write_app_proxy. Demo product and metaobject writes and their configuration have been removed. Existing merchant-created demo products/metaobjects are not deleted.

## Verification

Edit storefront behavior in `storefront/leather-vision.js` and the lazy-loaded Puter adapter in `storefront/leather-vision-puter.js`. `npm run build:storefront` generates both checked-in minified extension assets and rejects any asset above Shopify's 10,000-byte limit. This runs automatically before `npm run dev`, `npm run build`, `npm run deploy`, and `npm test`. After editing the source during an active dev session, run `npm run build:storefront` again so Shopify sees the updated assets. Frontend tests execute the generated assets with mocked SDK calls.

- `npm run typecheck`: generated route types and TypeScript checks.
- `npm run lint`: ESLint.
- `npm test`: temporary SQLite database, mocked provider responses, ownership/quota/worker tests, and DOM interaction tests. Tests never call paid providers or write to the live database.
- `npm run build`: production client and server build.
- `shopify app config validate --json`: Shopify app and extension configuration.
- `shopify theme check --path ../../shopify_store`: storefront theme checks.

The app-local CI definition covers installation, Prisma generation, type checking, linting, tests, and production build. Its nested `.github` path is not automatically active in the parent repository.

Before publishing, verify the complete flow on a development store with a configured provider: upload, generation, refresh recovery, variant selection, add to cart, and design retrieval from an order. Check failed uploads, quota responses, slow generation, sold-out variants, keyboard navigation, mobile layout, and a non-default storefront language.
