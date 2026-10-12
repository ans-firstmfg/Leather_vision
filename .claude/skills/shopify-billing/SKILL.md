---
name: shopify-billing
description: "Design or implement merchant app pricing and entitlements for Leather Vision when requested; distinguish app billing from product checkout and AI cost."
---

# Shopify Billing

Read [the project guide](../../../CLAUDE.md), APP/app/shopify.server.js, config.server.ts, jobs.server.ts, prisma/schema.prisma, shopify.app.toml, and current official billing documentation.

No billing config, subscription model, entitlement route/webhook, or billable usage ledger exists. Current generation quotas are abuse/budget controls, not purchased credits. Shopify product variant prices and cart line-item properties are customer checkout concerns; OpenAI API spending is a separate cost.

For a supported new public-app pricing model, start with Shopify App Pricing configured in the Partner Dashboard. Use the Shopify AI Toolkit app-pricing topic first. Use legacy/manual Billing API only for a justified existing integration, explicit manual requirement, or unsupported pricing model. Don't blindly add billing.request/appSubscriptionCreate.

Before implementation define recurring/usage/combined plans, entitlement source, trial/test behavior, denied access behavior, and whether reserved, failed, completed, or selected images count as usage. Protect usage events from duplication across retries/restarts; never equate model requests or quota rows with billable success without a specification.

Enforce entitlements server-side at reservation, not only in the UI. Preserve existing ownership and quotas. Test upgrades, cancellation, expiry, trial and uninstallation. Creating live plans or charges requires user authorization.
Reference: https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing

