# Live AR validation — 27 October 2026

## Verified

- `npm test`: 85 passing tests (68 existing generation/security/frontend tests and 17 live AR tests, including single-extension packaging and translation coverage).
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- Shopify AI Toolkit app-context Liquid validation: `live-ar.liquid` passed, artifact `firstmfg-live-ar-block`, revision 2; compacted `leather-catalog.liquid` passed.
- Packaging correction: Live AR is a block inside the existing `leather-vision` extension, preserving its UID. Combined Liquid: 37,642/100,000 bytes; storefront locale: 14,870/15,000 bytes and 250/250 keys. The earlier separate-extension approach was rejected by Shopify's one-theme-extension limit. A fresh Shopify dev preview remains to be verified.
- Real browser: the published MediaPipe 1.1.1 module, WASM runtime and Lite model initialized and processed a synthetic blank canvas; zero bodies detected, as expected. This test did not request camera permission.
- Browser preview: launch dialog, privacy/instruction copy, keyboard focus and close behavior; 390×844 portrait dimensions with no horizontal page overflow. Camera stage and controls occupy separate regions. Viewport emulation is not physical-device testing.
- Local calibration preview uses the production block structure and generated JavaScript/CSS. It has no cart button or purchase endpoint, uses AI-prepared cutouts of the three user-supplied sample jackets, and binds only to 127.0.0.1:3092.
- Original generation source, Liquid block, provider credentials, database schemas and Automation Recommendations project were not changed.

## Not yet accepted

| Acceptance item | Status |
|---|---|
| Real vest appearance and alignment | Pending pilot garment image and product/variant mapping |
| iPhone Safari / Android Chrome camera tracking | Pending physical devices and consented camera session |
| 24–30 FPS and thermal/battery behavior | Unmeasured; not guaranteed |
| Real-store cart behavior and theme integration | Pending draft-theme configuration with actual product |
| Existing photo-on-person service regression | Service not identified in this checkout; current generation regression passed |
| Jacket sleeves, arm occlusion and side views | Deferred beyond the first vest milestone |
| QR handoff, snapshots and multi-product switching | Deferred until the vest milestone passes |

The implementation is an experimental, front-view, image-overlay proof of concept. It does not establish realistic garment transfer, physical fit accuracy or production readiness.

Sample update: all three changed Liquid files passed validation; sample cart rejection passed without network calls. Local browser accessibility state confirmed the three-jacket gallery. Screenshot and interactive browser checks were unavailable in this session; physical-device camera testing remains pending.
