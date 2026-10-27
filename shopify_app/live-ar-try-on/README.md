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

## Local checks

`npm test`, `npm run typecheck`, and `npm run build` operate independently of Leather Vision. `npm run demo:ar` starts the loopback preview at http://127.0.0.1:3092.

Camera processing stays on-device. These are experimental flat overlays, not 3D garments or size measurements. Physical-phone tracking and real product alignment still require testing. See `docs/sample-assets.md` for image provenance. Earlier investigation/validation files record the previous combined-app architecture; this README describes the current split.
