---
name: debugging-root-cause
description: "Diagnose Leather Vision storefront, proxy, authentication, queue, provider, or runtime failures using request and log evidence."
---

# Debugging Root Cause

Read [the project guide](../../../CLAUDE.md) and reproduce the reported failure before choosing a fix. Capture the failing URL/method/status, response body, sanitized timing/logs, environment variable presence (not values), and the affected source path.

Trace POST generation logs: received, authenticated, provider-not-configured, upload-read, reserved, queued. No received means this route wasn't reached; authentication-stage failure differs from a queued worker failure. A Shopify HTML response saying the third-party app failed does not reveal the underlying exception. Correlate current tunnel/session evidence; don't infer expiry from an old timestamp.

Verify custom-element initialization when form values appear in the page query string. Separate Shopify unload-policy, favicon, CSS preload, and transport warnings from the actual failed generation request. For React hook failures inspect React/React DOM versions, Vite dedupe/prebundling, and stale client chunks.

Check queue status/storage and the provider saved in job options after 202 acceptance. IMAGE_PROVIDER defaults to OpenAI; development-only mock mode creates labelled local previews without AI changes or network calls. Changing the environment does not change an existing job's provider. Distinguish rejected OpenAI 429 requests from ambiguous gateway timeouts. Do not automatically retry a generation POST or a stale processing job.

Make the smallest evidence-supported change, add a meaningful regression test when warranted, and state what remains unverified. Mock tests and a successful build do not prove live generation works.

For Puter inspect GET /proxy/config, SDK loading, Connect Puter popup/account access, then generation and POST /proxy/generations/:id/result. AI runs in the browser, not the worker; server logs cannot confirm the upstream model succeeded. Capture sanitized SDK error codes without raw messages or account tokens. Insufficient funds, moderation refusal, blocked popups/third-party requests and result download/upload failures are distinct. Reloads must not retry an interrupted Puter call; test mode returns labelled samples.

