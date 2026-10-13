# Automation Recommendations

Separate merchant app; do not reuse Leather Vision credentials, database, app ID or image worker.
React Router 7 / React 19 / official Shopify adapter / Prisma SQLite sessions.
Authenticated routes under /app; July 2026 Admin API. Only read_products and read_inventory.
No product writes, customer or order access, AI provider, billing, background scheduler or saved scans.
The demo uses synthetic in-memory products and never installs them in Shopify.
Recommendation engine: app/services/recommendations.mjs. Scan limits: 100 products / 20 variants each, clearly reported.
Run npm test, npm run lint, npm run typecheck and npm run build. Runtime/credentials stay ignored.
shopify.app.toml has an intentional placeholder until linked to a NEW app registration.
