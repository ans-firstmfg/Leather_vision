---
name: automated-testing
description: "Run or extend Leather Vision's existing isolated backend/frontend checks and distinguish them from live-store verification."
---

# Automated Testing

Read [the project guide](../../../CLAUDE.md), APP/package.json, scripts/test.mjs, tests/security.test.ts, tests/frontend.test.mjs, and .github/workflows/checks.yml.

From APP run npm run typecheck, npm run lint, npm test, and npm run build as appropriate. npm test bundles TS with esbuild, runs node:test, creates temporary SQLite/image storage, mocks SDK/provider responses, and cleans its own directory. Frontend tests use jsdom and the actual block markup.

For behavioral changes exercise meaningful invariants: ownership/cross-shop rejection, token/expiry enforcement, upload limits without Content-Length, atomic quotas and claims, invalid provider output, recovery without paid replay, selection/cart properties without secrets, 429 retry bounds, and reconnect cleanup. Don't write tests that only duplicate implementation or assert prose.

Avoid real provider calls, production databases, and live-store mutations in normal tests. Request live verification only when relevant and authorized. Keep synthetic fixtures free of customer data. The app-local CI assumes APP is repository root; outer-repository CI needs separate working-directory and nested-checkout handling.

Report commands and results, including failures; don't imply lint/type/build verifies live authentication or checkout. For instructions-only work validate skill frontmatter, links, file paths, and documented script names instead of rerunning application checks.

