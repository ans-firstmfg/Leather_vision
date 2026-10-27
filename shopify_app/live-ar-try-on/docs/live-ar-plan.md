# Live AR try-on: investigation and first milestone

## Repository findings

- The application is React Router 7 / React 19 with Shopify's official adapter, Prisma sessions and a signed app proxy.
- `storefront/leather-vision.js` and `extensions/leather-vision/blocks/leather-vision.liquid` own the current image generation/reference upload and design-to-cart flow. `scripts/build-storefront.mjs` produces minified extension assets; Node tests use esbuild and jsdom.
- This checkout contains design generation, not an identifiable photo-on-person try-on. The existing module, provider calls and private image handling remain independent of live AR.
- The theme is a separate Horizon checkout. Integrate through an additional theme app block rather than modifying theme templates or the existing generation block. Live AR shares the existing theme extension because Shopify permits only one for this app. Generated catalogue whitespace is compacted and unused translations are removed to fit the combined limits.
- Extension JavaScript assets must each remain below the existing 10 KB build limit. Heavy vision code and its WASM/model are downloaded only after an explicit camera action. HTTPS or localhost is required.

## Approach and sequence

1. Implement a separate, opt-in Live AR app block, TypeScript camera lifecycle, on-device MediaPipe Pose adapter, confidence-gated torso geometry, time-based smoothing and Canvas 2D rendering. Provide a loopback preview using an explicitly labelled calibration vest.
2. Supply one real, transparent vest asset and exact product/variant mapping, calibrate shoulder/torso anchors and test tracking on actual iPhone Safari and Android Chrome. The user will provide pilot garments later. Do not claim this milestone passed on physical devices before that test.
3. Compare the prepared-image approach with a rigged, optimized 3D garment on the same devices and movements. The initial overlay is not generative garment transfer or cloth simulation. It cannot prove realistic drape, fit, side views or arm occlusion. Hide uncertain tracking rather than drawing a frozen garment.
4. After the vest milestone passes, expand to jacket/sleeve rendering, color-specific assets, product switching, QR mobile handoff and snapshots. QR links carry product/variant configuration, never camera data or generation access tokens.

## Initial integration contract

Use a merchant-selected product and a prepared transparent PNG/WebP via an image picker. An explicit comma-separated allowlist of variant IDs binds that image to real variants; never display one color asset for an unmapped color. The picker shows Shopify variant labels and formatted prices. Reject selling-plan-only products. Shopify validates inventory at cart mutation time. Refresh public product data before cart submission and use locale-aware cart endpoints. Production use requires assets and merchant mapping; an unconfigured block provides editor guidance and no shopper launch.

Camera frames and landmarks stay in memory on-device. Only public runtime/model/asset downloads and explicit cart requests are permitted. No video recording, landmark persistence or analytics events containing camera data. Stop media tracks on close, disconnect, page navigation and backgrounding; require a user action to resume. No snapshots in the first milestone.

## Validation and remaining inputs

- Automated tests: late camera permission after close; restart/cleanup; denied permissions; invalid/low-confidence poses; smoothing reset; mapped variants only; stale/failed cart requests; existing generation regression.
- Build, lint and typecheck; validate the new Liquid app block through Shopify AI Toolkit.
- UI checks: narrow portrait, desktop, error/setup states, keyboard close/focus, no asset/model requests before consent.
- Pending: pilot vest and jacket product/variant IDs, transparent front-view images with known anchors (or rigged GLBs for comparison), location of the existing photo-on-person service, and physical-device test sessions. No production deployment until the milestone is validated.

References: [MediaPipe web Pose](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [Shopify Ajax cart](https://shopify.dev/docs/api/ajax/reference/cart), [theme performance](https://shopify.dev/docs/storefronts/themes/best-practices/performance).
