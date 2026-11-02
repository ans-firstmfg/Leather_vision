# Mobile camera handoff — 28 October 2026

Added two entry points: use the current camera, or open a phone handoff panel. The latter generates an SVG QR locally with uqr, keeping the encoder out of the schema-loaded entry bundle. A scanned link targets the same storefront page, block and selected garment. The receiving page opens the try-on dialog but waits for a deliberate Start camera action and browser permission before starting tracking.

Only page path, block ID, variant/sample ID and a numeric theme preview ID are carried. Arbitrary query parameters, credentials and fragments are excluded. Localhost/private IP targets and non-HTTPS URLs are rejected with useful instructions. No camera or analytics payload is put in the link, and no external QR service is used. Camera video stays on the selected device; this feature does not stream phone video into a desktop browser.

Verification: 21 tests passed, including decoding a rasterized version of the actual generated SVG with an independent QR decoder, exact destination/selection, selection changes, local-address rejection, no desktop-camera request on phone choice, and opening incoming links without starting the camera. Typechecking, build and Shopify app-context Liquid validation passed. Browser checked both choices, opening/closing the phone instructions and camera dialog, plus a narrow viewport with no horizontal overflow. No camera permission was accepted during these checks.

Still pending: physical phone scanning and camera tracking through the real HTTPS Shopify storefront preview. Store passwords and unpublished/development theme access can require extra steps on the phone. No Shopify deployment was performed.
