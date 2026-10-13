---
name: project-architecture
description: "Map Leather Vision routes, services, storage, and storefront integration before architectural changes or project explanations."
---

# Project Architecture

Read [the project guide](../../../CLAUDE.md), APP/app/routes.js, APP/app/shopify.server.js, APP/prisma/schema.prisma, and the affected route/service files.

Trace the real chain: Liquid custom element → Shopify app proxy → bounded upload/reservation → persisted pending job → in-process worker → saved provider (OpenAI edit or development-only local mock) → private PNG → selection → locale-aware Cart Ajax request. Mock previews and cart properties are labelled and apply no requested changes. Merchant retrieval is a separate authenticated route.

Keep the Horizon material-builder section separate from the extension's leather-vision custom element. React belongs in the merchant app, not the storefront block. SQLite and disk images are the current implementation; Postgres/object storage are future migrations.

When proposing an architecture change, identify its effect on route contracts, SDK authentication, capability ownership, persistent storage, leases, and cart references. List existing behavior separately from proposed behavior. Consult the scoped AGENTS.md before implementation; do not use stale in-memory job descriptions from older editor notes.

