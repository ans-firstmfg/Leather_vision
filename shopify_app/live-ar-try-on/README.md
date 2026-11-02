# Live AR Try-On

Independent Shopify extension-only app for the First MFG camera preview.

- Client ID: `040517bd87707ddbfbc0c3a36d00ed81`
- One theme extension: `extensions/live-ar`; one block: **Live AR Try-On**.
- No server, private API key, database, app proxy or Admin API scopes are required for the current browser-only functionality. Use custom distribution for a production extension-only installation.
- Leather Vision remains separately installed under its original Client ID in `../ai-image-rendering`.

## Development

Run `npm install`, then `npm run dev -- --store leather-vision-dev.myshopify.com`. Stop other Shopify CLI dev sessions first to avoid theme preview port conflicts. Follow the CLI install/preview link for this app, then add its Live AR Try-On block in the theme editor. The new extension gets its own Shopify identifier; do not reuse Leather Vision's UID.

Enable **Show sample jackets when unconfigured** to see the three sample garments. For real purchases, select a product, transparent garment image and matching variant IDs. Sample mode cannot purchase anything.

The AR block previously belonged to Leather Vision. Remove that old block instance from the theme and add the block supplied by this new app after both app versions/previews are updated. Local changes alone do not update installed Shopify versions. Deploying the original app removes its old AR block, so do this on the development store/draft theme first.

## 3D sample experiment

The body-aware milestone adds segmentation-assisted torso proportions, One-Euro joint smoothing, world-landmark orientation, conservative hand occlusion, and subtle lighting adaptation. See `docs/body-aware-preview.md` for fallback rules and limits; run `/perception-check` on the local demo for synthetic and actual-runtime diagnostics. These remain visual previews, not reliable body measurements or size recommendations.

The supplied GLB is preserved at `models/white-mesh.glb`. Select **3D white mesh (experimental)** from the sample row, then start the camera. The adaptive pilot deforms its torso and sleeves using confident shoulder, hip, elbow and wrist landmarks, with bounded visual width/length controls. This is sample-specific procedural deformation of untextured geometry, not an authored skeletal rig or a size recommendation. The separate Three.js helper loads only when this sample is selected after camera consent. The existing 2D options remain available.

For camera-free inspection, run `npm run demo:ar` and open http://127.0.0.1:3092/model-check. Compare standard, wider and longer synthetic bodies, bend the elbows, adjust proportions, or rotate the original model. `node scripts/prepare-model.mjs` regenerates its self-contained glTF JSON equivalent for Shopify's supported asset formats. See `docs/adaptive-preview.md` for pilot behavior, limitations and required assets before realistic try-on.

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

Camera processing stays on-device. The three sample jackets use a 2D mesh anchored at the shoulders, waist, elbows and wrists. For uploaded images, choose **Uploaded garment type** in the block: Vest uses a rigid overlay; Jacket uses a generic garment calibration. These are experimental visual previews, not 3D garments or size measurements. Cloth drape and arm occlusion are not simulated. Physical-phone tracking and real product alignment still require testing. See `docs/sample-assets.md` for image provenance and `docs/jacket-alignment.md` for calibration limits. Earlier investigation/validation files record the previous combined-app architecture; this README describes the current split.
