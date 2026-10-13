---
name: product-builder-engine
description: "Modify reference-image options, edit prompts, generated variations, design selection, or product/cart attachment in Leather Vision."
---

# Product Builder Engine

Read [the project guide](../../../CLAUDE.md), upload.server.ts, materials.server.ts, promptBuilder.server.ts, generate.server.ts, jobs.server.ts, and the extension block/JS in APP.

Inputs are optional image, productType, leather, color, stitching, hardware, instructions, and variationCount. Product/material values are server-validated enums; free text is bounded. Without an image, productType or instructions must describe the product. Jobs persist hasReferenceImage; legacy jobs default to requiring the upload. Reference jobs request preserved silhouette/seams/pockets through image edits; no-reference jobs generate from specifications. Additional variations change lighting/angle. Mock mode uses labelled placeholders when no reference is supplied.

A new control needs aligned Liquid, locale, frontend FormData, server parsing/types, persisted JobOptions, and prompt handling. Don't treat browser validation as authoritative. Model edits cannot guarantee manufacturing geometry.

Selection POST /proxy/generations/:id accepts variationId, verifies a ready owned variation, and returns safe line-item properties. The block's configured product and variant picker supply the real Shopify variant; generated images do not create products or alter Shopify prices. Preserve the current small-variant-catalog constraint and prevent duplicate cart submissions.

Puter uses a browser SDK after explicit customer sign-in, server-built prompts, and optional normalized references. Server-configured model/quality/test mode are saved per job. Results are uploaded as bytes to the protected result endpoint, not accepted as server-fetched URLs. Each variation is generated once; interrupted browser calls are never automatically replayed. Test mode returns labelled samples.

Change generation strategy only within user scope. Masks, multiple references and refinement of a selected output require implementation; don't describe them as existing features. Puter has explicit quality settings; OpenAI currently leaves output quality to the API default.

