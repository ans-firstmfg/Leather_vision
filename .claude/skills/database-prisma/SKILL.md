---
name: database-prisma
description: "Change or troubleshoot Leather Vision's SQLite sessions, durable generation jobs, migrations, quotas, ownership, or worker leases."
---

# Database Prisma

Read [the project guide](../../../CLAUDE.md), APP/prisma/schema.prisma and migrations, scripts/prisma.mjs, app/db.server.js, jobs.server.ts, and worker.server.ts.

The only models are Session and Generation. Session stores Shopify access/refresh credentials. Generation stores shop/customer ownership, actor/token hashes, string status, JSON-encoded options/variations, selectedVariation, lease/worker fields, and expiry. Do not add imaginary Product, BuilderConfig, Subscription, or Usage models to explanations.

Preserve uploading → pending → processing → ready/failed transitions, atomic quota reservation, conditional worker claims/completion, timing-safe capability checks, expiry, and retention extension on selection. Default limits come from config.server.ts. Maintenance marks stale paid work failed; it does not retry it.

Use npm run prisma -- generate and npm run prisma -- migrate deploy for existing migrations; npm run setup combines them. For schema changes, create/review an additive migration against a disposable database before applying it. Never use reset/db push against populated data without explicit authorization and a backup.

SQLite relative URLs are schema-relative; default file:dev.sqlite means APP/prisma/dev.sqlite. Images are separate files under GENERATION_DATA_DIR. Back up both. Postgres migration needs schema/migration and queue-transaction review; changing DATABASE_URL alone is insufficient.

