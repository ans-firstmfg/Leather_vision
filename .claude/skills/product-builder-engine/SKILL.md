---
name: product-builder-engine
description: "Modify reference-image options, edit prompts, generated variations, design selection, or product/cart attachment in Leather Vision."
---

# Product Builder Engine

Read [the project guide](../../../CLAUDE.md), upload.server.ts, materials.server.ts, promptBuilder.server.ts, generate.server.ts, jobs.server.ts, and the extension block/JS in APP.

Inputs are image, productType, leather, color, stitching, hardware, instructions, and variationCount. Product/material values are server-validated enums; free text is bounded. Uploaded designs are converted to catalog-style photos while requesting preserved silhouette/seams/pockets. Additional variations currently change lighting/angle and use the original upload.

A new control needs aligned Liquid, locale, frontend FormData, server parsing/types, persisted JobOptions, and prompt handling. Don't treat browser validation as authoritative. Model edits cannot guarantee manufacturing geometry.

Selection POST /proxy/generations/:id accepts variationId, verifies a ready owned variation, and returns safe line-item properties. The block's configured product and variant picker supply the real Shopify variant; generated images do not create products or alter Shopify prices. Preserve the current small-variant-catalog constraint and prevent duplicate cart submissions.

Change generation strategy only within user scope. Masks, multiple references, refinement of a selected output, and explicit quality settings require implementation; don't describe them as existing features.

