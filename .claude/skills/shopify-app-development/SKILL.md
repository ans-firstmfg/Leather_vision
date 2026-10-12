---
name: shopify-app-development
description: "Change Leather Vision's Shopify authentication, app proxy, webhooks, merchant UI, theme extension, or Shopify configuration."
---

# Shopify App Development

Read [the project guide](../../../CLAUDE.md), APP/AGENTS.md, APP/shopify.app.toml, APP/shopify.web.toml, and app/shopify.server.js. Follow the required Shopify AI Toolkit workflow for platform work; install missing tooling on the agent host, not in this repository. Verify APIs and Liquid/config values against official documentation and the project's 2026-07 version.

Use authenticate.admin for merchant data, authenticateProxy (which calls authenticate.public.appProxy) for storefront routes, and authenticate.webhook for webhook actions. Preserve SDK response/header boundaries in app.jsx. The only configured scope is write_app_proxy; add scopes only for a specific verified requirement.

The public /apps/leather-vision path maps to backend /proxy. Support signed path_prefix customization; do not hardcode the public hostname or tunnel URL. The extension schema registers leather-vision.js/CSS; keep locale JSON and Liquid copy capture synchronized.

Use s-* Polaris web components/App Bridge for merchant UI and vanilla JS/Liquid for the storefront. Verify theme-editor reconnect behavior and locale-aware cart URLs. Shopify app deploy releases configuration/extensions; it does not host the backend. No remote deployment or store mutation is implied by editing code.

