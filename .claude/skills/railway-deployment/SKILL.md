---
name: railway-deployment
description: "Prepare or troubleshoot a requested Railway deployment using Leather Vision's existing Dockerfile, persistent SQLite/images, and Shopify URLs."
---

# Railway Deployment

Read [the project guide](../../../CLAUDE.md), APP/Dockerfile, .dockerignore, package.json, scripts/prisma.mjs, shopify.app.toml, and README.md.

Railway is a proposed deployment target: no railway.json/railway.toml or verified service configuration is checked in. Don't claim the app is deployed. No /health route exists. The user has said there is no GitHub repository and not to add one; use an authorized local upload/container workflow if deployment is requested.

Use APP as build context/root. Existing Docker stages use Node 22 Alpine, npm ci, Prisma generate, build, and runtime pruning. Runtime starts npm run docker-start (setup then start), uses non-root node, and expects a writable /app/storage mount: DATABASE_URL=file:/app/storage/dev.sqlite and GENERATION_DATA_DIR=/app/storage/images. Verify workspace packages, Prisma native engines, volume permissions, service port/binding, and startup in the actual container.

Require durable database and image storage. For a volume-backed database keep migration execution at startup when the mount is present, not solely at image build or a pre-deploy phase. Keep one instance; don't enable replicas/sleeping until worker/storage architecture supports them.

Supply Shopify credentials, HTTPS app URL, scope, OpenAI key/model and limits through service variables. Verify production application_url/auth redirect/proxy/webhook settings; example.com is a placeholder. Shopify app deploy doesn't deploy this backend.

Prepare checks and rollback/backups before any authorized deployment. A container build alone is not proof of persistence, authentication, or generation.
References: https://docs.railway.com/builds/dockerfiles and https://docs.railway.com/volumes

