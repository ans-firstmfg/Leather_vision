# Body-aware preview milestone

## Implemented

- The existing pinned MediaPipe Pose Landmarker now returns person segmentation and world landmarks. No TensorFlow dependency was added. Masks are read and released inside each frame, including failures and tracking loss.
- Confidence-gated foreground runs across three nearby rows estimate chest, waist and hip silhouette widths. Rows with nearby arm intersections, missing arm joints, clipped edges, large asymmetry or implausible widths fall back to the previous landmark sizing. Widths describe the visible clothing silhouette, not naked-body measurements or centimeters.
- All image-jacket calibrations and the 3D sample share independent chest and waist anchors. Collar, shoulder and cuff anchors remain independent. Existing sample IDs and cart restrictions are preserved.
- One-Euro filters smooth screen-space joint positions, torso dimensions, yaw/pitch and accepted silhouette widths. Filters reset on missing joints, stale timestamps, long gaps, camera restart and garment changes.
- A world-landmark torso-plane normal supplies yaw and pitch when reliable. The garment surface receives a small depth-based projection offset, retaining the already projected landmark layout. This supports modest turns only; the 2D renderer suppresses yaw over 0.5 radians or pitch over 0.4, and the experimental 3D renderer retains its tighter yaw limit.
- The hand model loads after camera permission, without blocking pose startup. Failure keeps pose preview usable; models finishing after shutdown are closed. Each processed frame uses fresh hand detections, with hands skipped on frames where pose inference already costs 80 ms or more. Frame pacing includes rendering and targets a bounded 42–200 ms interval.
- Conservative hand occlusion uses a palm hull and finger capsules, intersected with current person segmentation. A hand must match a confident pose wrist and have a forward wrist-depth estimate. Only garment alpha is removed, exposing the original video beneath. No whole-person foreground overlay is used.
- Bounded torso color sampling and a soft collar-area shadow affect only existing garment alpha. Video stays unchanged. Camera frames and derived proportions remain in memory and are never uploaded or recorded.

## Limits and remaining work

Hand depth is approximate; the single person mask does not label skin, individual fingers or front/back body parts. This milestone does not restore complete forearms, which could expose the original shirt in place of virtual jacket sleeves. Small hand edges, crossed arms, loose clothes, side views, lighting extremes and mobile performance still need physical-device validation. Existing PNGs are still an anchored affine mesh, not professionally authored skeletal rigs. No absolute-scale calibration, measured garment dimensions, height-based size advice, cloth physics or commercial body-scanning service has been added. Artist-approved garment anchors, proper sleeve skinning and real size charts are subsequent work.

## Local verification

Run `npm run demo:ar` and visit `/perception-check`. The first section compares synthetic body widths with identical shoulder landmarks and demonstrates the conservative hand layer. The actual-runtime button analyzes the previously supplied reference-person image locally; it neither opens the camera nor uploads the image. This fixture is copied to `.cache/perception-reference.png`, not packaged with the extension. If absent, copy the reference image there to run that check. The sample can have no detectable hands; hand-model load success is reported independently of detection count.

Canvas diagnostic attributes `data-body-sizing` and `data-hand-occlusion` report whether silhouette sizing is accepted and how many fresh hands are used. These diagnostics are not size recommendations. The normal storefront keeps its current product row, QR handoff and camera controls.

Source references: MediaPipe Pose Landmarker and Hand Landmarker web documentation, and the original One-Euro filter description at https://gery.casiez.net/1euro/. No production deployment is included.
