---
name: live-preview-engine
description: "Debug or improve Leather Vision's upload preview, asynchronous result polling, refresh recovery, and theme-editor lifecycle."
---

# Live Preview Engine

Read [the project guide](../../../CLAUDE.md), APP/extensions/leather-vision/assets/leather-vision.js, its Liquid block/locales, and tests/frontend.test.mjs.

There is no separate preview engine, websocket result server, or 3D canvas. previewImage displays the local upload through an object URL; generation results arrive through GET polling after a 202 POST. The job id/token are saved in sessionStorage for refresh recovery. Reconnecting must poll the saved job, not submit another paid generation.

Maintain connected/disconnected lifecycle cleanup: abort requests, cancel timers, revoke object URLs, and avoid duplicate listeners. Keep upload, pending/processing, ready, failed, expired/missing, timeout, and cart-error states visible and accessible. Selection state must match the persisted variation.

For a native GET form navigation with ?image=&productType=..., check that the custom element registered, its init completed, and submit is prevented. Verify script loading and console errors before assuming backend failure. Test browser refresh, block reconnect, slow polling, keyboard interactions, and non-default locale. Static render-ui.mjs fixtures only preview merchant markup; they don't validate the storefront or Shopify authentication.

