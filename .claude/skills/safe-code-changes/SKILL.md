---
name: safe-code-changes
description: "Make focused changes to Leather Vision while preserving existing work, credentials, API contracts, and paid-generation safeguards."
---

# Safe Code Changes

Read [the project guide](../../../CLAUDE.md) and inspect status/diff in the parent repository before editing. It tracks both APP and the theme. Locate the smallest change with rg; read its callers and tests.

Preserve existing .env values, Shopify session data, migrations, user edits, and the single parent Git repository. Do not replace dependencies, reset databases, change production URLs, or broaden scopes to solve an unrelated issue. New files or schema fields should serve the authorized task.

For a generation change, check the upload, queue, frontend recovery, selection, image access, and quota consequences. Keep POST generation asynchronous and do not replay an uncertain paid request. Current explicit 429 provider retries are different from retrying an interrupted generation.

Use tests appropriate to the actual behavior changed; documentation-only edits need link/path/format verification rather than paid API calls. Report validation and remaining uncertainty. Request additional information only where needed; don't invent a new approval requirement for reversible work already authorized.

