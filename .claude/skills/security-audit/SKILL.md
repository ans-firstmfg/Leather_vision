---
name: security-audit
description: "Audit Leather Vision's tenant isolation, private images, uploads, paid-generation controls, sessions, and deployment secrets."
---

# Security Audit

Read [the project guide](../../../CLAUDE.md) and trace the affected routes through APP/app/services/proxy.server.ts, jobs.server.ts, upload.server.ts, generate.server.ts, worker.server.ts, plus proxy/admin image routes and webhook actions.

Validate SDK signatures/session context before using proxy shop/customer values. X-Leather-Vision is an action marker, not an authorization credential. Capability access additionally requires matching shop/customer, unexpired job, valid hashed token, and ready variation membership. Admin retrieval must constrain session.shop.

Check streaming upload and selection limits, MIME/extension/decoded image consistency, pixel/page limits, safe filenames, Sharp normalization, private response headers, and raw-error suppression. Verify guest actor identification against the actual trusted forwarded-header chain; the actor is the entry TRUSTED_PROXY_HOPS (default 1) from the end, which must match the real proxy chain of the deployment.

Review atomic quotas, active-worker concurrency, stale leases, provider retries, cancellation, and uninstall/retention cleanup. API cost abuse is relevant even without merchant billing. Tokens are accepted only in the Authorization header; keep them out of URLs, logs, and cart/order properties. Compliance webhooks live in webhooks.compliance.jsx; uninstall retains designs until shop/redact.

Inspect .gitignore/.dockerignore for secrets, SQLite journals, generated files and customer images; do not print .env or session rows. Report reproducible issues with file/line evidence, impact, and a narrow remediation. Distinguish observed vulnerabilities from untested deployment assumptions. Don't change authentication, scopes, or production credentials merely because an audit was requested.

