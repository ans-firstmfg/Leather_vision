---
name: debugging-root-cause
description: "Diagnose Leather Vision storefront, proxy, authentication, queue, provider, or runtime failures using request and log evidence."
---

# Debugging Root Cause

Read [the project guide](../../../CLAUDE.md) and reproduce the reported failure before choosing a fix. Capture the failing URL/method/status, response body, sanitized timing/logs, environment variable presence (not values), and the affected source path.

Trace POST generation logs: received, authenticated, provider-not-configured, upload-read, reserved, queued. No received means this route wasn't reached; authentication-stage failure differs from a queued worker failure. A Shopify HTML response saying the third-party app failed does not reveal the underlying exception. Correlate current tunnel/session evidence; don't infer expiry from an old timestamp.

Verify custom-element initialization when form values appear in the page query string. Separate Shopify unload-policy, favicon, CSS preload, and transport warnings from the actual failed generation request. For React hook failures inspect React/React DOM versions, Vite dedupe/prebundling, and stale client chunks.

Check queue status/storage and provider configuration after 202 acceptance. OpenAI is the only provider; distinguish rejected 429 requests from ambiguous gateway timeouts. Do not automatically retry a generation POST or a stale processing job.

Make the smallest evidence-supported change, add a meaningful regression test when warranted, and state what remains unverified. Mock tests and a successful build do not prove live generation works.

