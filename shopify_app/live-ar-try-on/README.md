# Live AR Try-On

Independent Shopify extension-only app for the First MFG camera preview.

- Client ID: `040517bd87707ddbfbc0c3a36d00ed81`
- One theme extension: `extensions/live-ar`; one block: **Live AR Try-On**.
- No server, private API key, database, app proxy or Admin API scopes are required for the current browser-only functionality. Use custom distribution for a production extension-only installation.
- Leather Vision remains separately installed under its original Client ID in `../ai-image-rendering`.

## Development

Run `npm install`, then `npm run dev -- --store leather-vision-dev.myshopify.com`. Stop other Shopify CLI dev sessions first to avoid theme preview port conflicts. Follow the CLI install/preview link for this app, then add its Live AR Try-On block in the theme editor. The new extension gets its own Shopify identifier; do not reuse Leather Vision's UID.

Enable **Show sample jackets when unconfigured** to see the two open-front image jackets. Both image jackets have straight sleeves and a transparent opening from neck to hem so the shopper's own clothing shows through. For real purchases, select a product, transparent garment image and matching variant IDs. Sample mode cannot purchase anything.

The AR block previously belonged to Leather Vision. Remove that old block instance from the theme and add the block supplied by this new app after both app versions/previews are updated. Local changes alone do not update installed Shopify versions. Deploying the original app removes its old AR block, so do this on the development store/draft theme first.

## Body-aware image preview

Both image samples have separate torso and sleeve meshes. Sleeves follow their own shoulders, elbows and wrists without pulling the body or opposite sleeve. The front body has one width from top to hem, with straight sides and no silhouette-driven waist taper. Stable front-view segmentation now calibrates that entire width automatically; posture and camera distance remain live, and the hem follows the hips. See `docs/size-recommendations.md` for current scaling and `docs/straight-sizing.md` for the earlier baseline. `/fit-check` includes raised-arm and wrist-only synthetic poses. Generic uploaded jackets still need individual part calibration.

The body-aware milestone adds segmentation-assisted torso proportions, One-Euro joint smoothing, world-landmark orientation, conservative hand occlusion, and subtle lighting adaptation. See `docs/body-aware-preview.md` for fallback rules and limits; run `/perception-check` on the local demo for synthetic and actual-runtime diagnostics.

**Find my size** lets shoppers preview S, M, L, XL, XXL and 3XL with different jacket width, body length and sleeve reach. Samples start at M and use clearly labelled illustrative measurements, not First MFG sizing. An optional height-based front/side scan suggests a size; a manual choice overrides it until **Use suggested size** is chosen. Tape measurements and room-preference controls are not shown. Real products require a matching approved product chart and mapped available variants; demo measurements never apply to real products. See `docs/size-recommendations.md` for setup, state behaviour and accuracy limits.

## Laptop or phone camera

**Use this camera** opens try-on on the current device. **Use phone camera** lazy-loads a local QR encoder and shows a scannable code for the current storefront page and selected garment. Scanning opens the matching block and garment on the phone, then the shopper taps Start camera and grants permission. No video is streamed to the laptop; the phone maintains its own Shopify cart.

Links include only the page, block ID, garment ID and a numeric `preview_theme_id` when present. Other query parameters and fragments are discarded. Generate codes from the HTTPS storefront preview in a separate browser tab, not from localhost. Password-protected stores may require the shopper to enter the store password first. Draft-theme availability and Shopify development-preview access must also be tested on the phone. Opening a link alone does not start a camera or download the tracking model.

The schema JavaScript stays below 10 KB. The 12 KB QR helper is downloaded only after choosing phone handoff; QR generation never calls a third-party QR image service. QR SVGs include a four-module quiet zone and medium error correction.

## Preview recovery

If Shopify reports an `ENOENT ... unlink` inside `.shopify/dev-bundle`, stop the Shopify dev terminal with Ctrl+C first, then run `npm run dev:clean -- --dev-stopped` from this app and restart `npm run dev -- --store leather-vision-dev.myshopify.com`. The cleanup command deletes only the generated dev bundle, leaving app identity/configuration, source images and credentials intact. Do not clean a bundle while a dev process is using it. Builds now write an asset only when its contents change to avoid redundant watcher events.

AR failures now distinguish camera startup/interruption, preview-module download, model initialization, image loading and frame processing. The console reports a bounded `[Live AR]` diagnostic with the stage; resource URLs are redacted. Shopify CDN image URLs are used directly, supporting absolute, protocol-relative and storefront-relative forms without adding a second protocol.

Shopify preview-bar CSS MIME failures and unused preload warnings come from storefront/preview resources. MediaPipe startup, feedback and cleanup logs do not by themselves identify a fatal inference error. Use the new `[Live AR]` stage and browser Network errors to isolate any failure that remains after restart.

## Local checks

`npm test`, `npm run typecheck`, and `npm run build` operate independently of Leather Vision. `npm run demo:ar` starts the loopback preview at http://127.0.0.1:3092.

Camera processing stays on-device. The two open-front image samples use a 2D mesh anchored at the shoulders, hips, elbows and wrists. For uploaded images, choose **Uploaded garment type** in the block: Vest uses a rigid overlay; Jacket uses a generic garment calibration. The visual overlay does not prove physical fit. Cloth drape and full forearm occlusion are not simulated. Physical-phone tracking, scan accuracy and real product alignment still require testing. See `docs/open-front-sample.md` for the current images' provenance and `docs/jacket-alignment.md` for calibration limits. Earlier investigation/validation files record previous samples and the combined-app architecture; this README describes the current split.
