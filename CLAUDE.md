# Leather Vision — project instructions

## Verified scope

This guide was checked against the local workspace on 2026-10-12, after the ZIP replacement (outer commit 60a625f; app commit 12e3b64). There is no configured Git remote. The user explicitly said not to add one; do not describe a GitHub repository as this project's source of truth.

Re-read source before changing behavior; these instructions are a snapshot, not a substitute for code. Respect the user's requested scope and read applicable AGENTS.md files. The app's existing CLAUDE.md imports its AGENTS.md; preserve it. Paths below are relative to this workspace root unless prefixed with APP.

APP = `shopify_app/ai-image-rendering`. The outer Git repository contains `shopify_store` and tracks APP as a gitlink. APP has its own Git repository. There is no root package.json.

## Product and architecture

Customers choose leather, color and product type, add instructions and an optional sample image, generate 1–4 variations, select a design, and add a configured Shopify product variant to cart with a design reference. Stitching, hardware and variation count are under More design options. Without a reference, a product type or product description is required. Merchants retrieve designs through the authenticated dashboard.

- APP: React Router 7.18.2, React/React DOM 19.3.0, Vite, mixed JS/JSX and TS/TSX, Prisma 6, Sharp.
- Routes are filesystem routes from APP/app/routes.js using flatRoutes(); do not add Next.js, Express, or an invented /api layer.
- Shopify integration is APP/app/shopify.server.js: official React Router adapter, PrismaSessionStorage, AppStore distribution, expiring offline tokens, July 2026 API.
- Storefront: APP/extensions/leather-vision (Liquid block, vanilla custom element, CSS, locale JSON). Merchant UI uses App Bridge and s-* Polaris web components.
- Separate Horizon theme: shopify_store. Its material-builder section and assets/material-builder.js are distinct from the app extension.
- Database: APP/prisma/schema.prisma defines SQLite Session and Generation. Images live on disk; the database stores filenames and JSON strings.
- APP/app/services/jobs.server.ts owns quotas, hashed capability tokens, ownership, leases, states, and selection.
- APP/app/services/worker.server.ts runs within the long-lived Node process; APP/app/entry.server.jsx starts it. No Redis, external worker service, or serverless queue is implemented.
- IMAGE_PROVIDER defaults to openai; its implementation is APP/app/services/ai/openai.server.ts. Development-only mock mode uses Sharp locally, needs no key, applies no requested AI changes, and labels previews and cart properties; no-reference jobs produce labelled placeholders. Jobs snapshot the provider and hasReferenceImage in stored options; legacy jobs use OpenAI and require their original upload. Mock mode is rejected in production. Prompt rules are in promptBuilder.server.ts. Default OpenAI model gpt-image-1, fixed 1024x1024 output, high input fidelity for supported edit models, output quality left to API auto. Each real variation edits the original upload or generates from specifications in a separate request. Do not claim masks, iterative refinement, usage-cost tracking, Puter integration, or NVIDIA support exist.

## Route contract

Storefront URLs use the configured /apps/leather-vision prefix; Shopify forwards them to /proxy. Preserve custom path_prefix support.

| Backend path | Method / purpose | Guard |
| --- | --- | --- |
| /proxy/generations | POST multipart; returns 202 with generationId, token, status, pollUrl; GET returns 405 | authenticateProxy + storefront action header for POST |
| /proxy/generations/:id | GET job status/images; POST small JSON variationId selection returning cart properties | signed proxy + shop/customer ownership + capability; action header for POST |
| /proxy/images/:gen/:file | GET a ready variation PNG | same ownership/capability; filename allowlist |
| /app | GET merchant generation dashboard / reference lookup | authenticate.admin |
| /app/additional | Merchant setup page under /app layout | authenticated layout |
| /app/images/:gen/:file | GET merchant image | authenticate.admin + matching shop + expiry |
| /auth/login; /auth/* | Shopify login / callback authentication | official SDK |
| /webhooks/app/uninstalled; /webhooks/app/scopes_update | POST webhook actions; uninstall deletes sessions and fails queued jobs but keeps designs | authenticate.webhook |
| /webhooks/compliance | POST customers/data_request, customers/redact, shop/redact (mandatory privacy topics) | authenticate.webhook |

There is no dedicated health, billing, preview, product-creation, or order-webhook route. Check app/routes before adding one.

## Commands

Run app commands from APP, using npm and its package-lock.json.

| Task | Command |
| --- | --- |
| Install | npm ci |
| Generate client + apply existing migrations | npm run setup |
| Development | npm run dev -- --store leather-vision-dev.myshopify.com |
| Check | npm run typecheck; npm run lint; npm test; npm run build (run separately) |
| Production server | npm run start |
| Container startup | npm run docker-start |
| Static merchant UI fixtures | node scripts/render-ui.mjs |

setup invokes scripts/prisma.mjs, which loads an existing .env and defaults DATABASE_URL to file:dev.sqlite. Relative SQLite URLs resolve from the Prisma schema directory. Never overwrite .env with .env.example when it already exists.

shopify.web.toml generates Prisma before dev; its dev command applies migrations and launches React Router. Storefront JavaScript source is APP/storefront/leather-vision.js; npm run build:storefront generates APP/extensions/leather-vision/assets/leather-vision.js with esbuild and enforces Shopify's 10,000-byte limit. npm predev/prebuild/predeploy/pretest generate it automatically. During a running dev session, regenerate after source edits. npm test uses scripts/test.mjs, temporary SQLite/storage, Node's test runner, and mocked AI; frontend tests execute the generated extension asset. It does not test a live Shopify installation. Static UI fixtures are not a storefront or authenticated runtime test.

The app-local .github/workflows/checks.yml assumes the app is checkout root. It is not an automatically active outer-repository workflow. Do not invent an outer CI pipeline.

## Boundaries to preserve

Authenticate proxy, admin, and webhook routes with the SDK; X-Leather-Vision alone is not authentication. Job access requires shop, matching customer context, valid unexpired capability token, and a ready variation where applicable. Capability tokens travel only in the Authorization header (requestToken ignores query strings); storefront and merchant images load via authenticated fetch into blob URLs. Cart items carry Design reference, _leather_vision_generation, and _leather_vision_variation; never attach capability tokens or private image URLs.

Keep the upload stream bounded without relying on Content-Length (8 MB image plus multipart allowance), still PNG/JPEG/WebP only, 16 megapixel limit, Sharp normalization, and 1–4 variation validation. Keep quotas atomic with reservation, lease ownership, and expiry checks; read-then-write transactions in jobs.server.ts run through an in-process serializer because concurrent SQLite transactions fail to upgrade to writes. Guest actors come from the Shopify-supplied X-Forwarded-For entry, TRUSTED_PROXY_HOPS from the end. Interrupted paid calls fail rather than replay; the provider separately retries explicit 429 rejections up to three times.

Do not expose credentials, cookies, customer payloads, or raw provider errors in logs, client responses, screenshots, or commits. Tests should use synthetic inputs and mocks unless a live paid call is authorized.

## Deployment and missing features

Dockerfile uses Node 22 Alpine, build-time client generation/build, non-root runtime, /app/storage/dev.sqlite and /app/storage/images, a /app/storage volume, and docker-start. Persistent database AND image storage are required. Keep a single instance until shared storage/database/worker support is implemented.

No railway.json, railway.toml, or verified Railway service exists. shopify.app.toml still has production example.com URLs; CLI changes them for development only. Shopify app deploy publishes configuration/extensions, not the Node backend.

No merchant billing, subscription model, billing webhook, or entitlement enforcement exists. Generation quotas and cart product pricing are not app billing. Use the dedicated skills for requested implementation; don't add these features simply because a skill exists.

## Skills and delivery

The twelve project skills are under .claude/skills/<name>/SKILL.md. Read only relevant ones: project-architecture, safe-code-changes, shopify-app-development, product-builder-engine, live-preview-engine, database-prisma, debugging-root-cause, automated-testing, shopify-billing, railway-deployment, security-audit, git-workflow.

Keep edits focused; preserve unrelated work. Report changes, checks actually run, and unverified runtime behavior. Existing user authorization carries forward; preparing a plan does not itself authorize new deployment, charges, destructive data operations, or remote publication. Do not create remotes or push without a user request.

