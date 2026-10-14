# Automation Recommendations

Separate merchant app; do not reuse Leather Vision credentials, database, app ID or image worker.
React Router 7 / React 19 / official Shopify adapter / Prisma SQLite sessions.
Authenticated routes under /app; July 2026 Admin API. Only read_products and read_inventory.
No product writes, customer or order access, AI provider, billing, background scheduler or saved scans.
Storefront extension: extensions/product-recommendations. Liquid app block uses the locale-aware Shopify recommendations HTML endpoint, current/chosen source product, curated fallbacks and explicitly labelled optional demo cards. Never expose merchant inventory scans to shoppers. Validate Liquid with context app. Restart dev after adding an extension so the CLI registers it.
The demo uses synthetic in-memory products and never installs them in Shopify.
Recommendation engine: app/services/recommendations.mjs. Scan limits: 100 products / 20 variants each, clearly reported.
Run npm test, npm run lint, npm run typecheck and npm run build. Runtime/credentials stay ignored.
The app is registered separately in My Store. Both app configs use its own client ID; CLI currently selects shopify.app.automation-recommendations.toml. Preserve /auth/callback, July 2026 webhook API and read-only scopes.
