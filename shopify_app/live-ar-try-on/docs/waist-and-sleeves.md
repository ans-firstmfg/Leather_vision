# Waist anchoring and independent image sleeves

Current default: straight front body with the same shoulder-derived width down to the hip-aligned hem. See `straight-sizing.md`. The tapered and adaptive approaches below are historical.

Current sizing behavior is documented in `dynamic-sizing.md`: reliable chest/hip measurements now update gradually, and the artwork hem maps directly to the hip line. The session-wide lock described below has been replaced. These notes retain the earlier development history.

Current update: at the user's request, the lower jacket now follows the actual hip center and hip silhouette width, replacing the estimated waist anchor. `hipFrame` provides the center; session calibration locks chest/hip width ratios. Independent sleeves and uniform lower-panel proportions remain. The current diagnostic marker is `hip-panel-v3`. The waist-based notes below record the earlier implementation.

The two current samples (`open` and `open_brown`) use separate body, left-sleeve and right-sleeve meshes. Armhole boundaries are calibrated to each PNG. Triangles stay inside their assigned part, and sleeves draw behind the body. Body points consume only shoulder, collar, chest, waist and hem anchors; elbows and wrists cannot pull the side panels or hem.

Each sleeve uses its own shoulder-to-elbow and elbow-to-wrist transforms. A smooth seven-percent texture-height band blends the elbow transforms; wrist motion does not affect vertices above that band. A short shoulder attachment band keeps the cap pinned to the body while the sleeve rotates. Original textures and transparent centers remain unchanged. Generic merchant uploads retain the generic warp and require garment-specific preparation for this level of part separation.

MediaPipe Pose has no native waist joint. `waistFrame` estimates its center 65% of the way from shoulders to hips, matching the silhouette reader's waist sampling row. Hip joints remain confidence-checked internal references. The hem now sits a small shoulder-scaled distance below this estimated waist (10% of shoulder span for black, 16% for brown), rather than at the hips. Accepted waist-mask width controls the hem; hip-mask width does not. If the mask row is unreliable, interpolated landmark width is used. Chest rows stay at 30% of the shoulder-to-hip reference length. Existing One-Euro filters smooth the references and accepted mask widths; the waist is derived from those smoothed points.

Tests exercise every mesh vertex with either arm and both arms raised, prove stationary body and opposite sleeve, check wrist-only upper-sleeve isolation, own elbow/cuff anchors, elbow continuity, waist-vs-hip widths, confidence fallback and translated/scaled/tilted bodies. `/fit-check` provides both jacket choices and four synthetic arm poses. The ignored `.cache/waist-sleeve-check.png` records production-renderer transforms on synthetic bodies; it is not a camera test.

This is an approximate 2D visual preview. Sharp bends, arms crossing the body, hidden joints, extreme turns and thick sleeves can still cause stretching or underarm gaps. No cloth simulation, inferred naked-body measurements or size prediction is provided. Real-camera and mobile performance still need device validation. Cropping out hip references can still stop pose tracking even though the visible garment ends at the waist.

## Lower-panel flare correction

The previous body warp treated anchors inside the front panels as the full outer width, then extrapolated the hem side pixels. This could produce a pinched belly and flared lower panels even with no arm influence. The two sample bodies now scale horizontally using their calibrated outer boundaries, interpolate row scale smoothly, and hold the waist scale constant through and below the hem. The vertical center remains waist/torso-anchored. Regression coverage checks straight lower-panel columns and actual mesh bounds at slim, standard and broad waist widths; arm-isolation checks remain in place.

## Stop mask-driven resizing during arm movement

Separate mesh weights alone were insufficient: arm movement could make a silhouette width disappear, causing a switch from measured width to landmark fallback. `BodyShapeLock` now captures chest/waist ratios on the first usable rendered pose and holds them for that tracking session. Fresh segmentation still supports hand occlusion and lighting, but cannot keep reshaping the front panels. Body position, shoulder orientation and scale remain live; the garment is not frozen in screen coordinates. Calibration resets on garment load, restart/disposal, tracking loss or a stale frame. It may initially use landmark proportions if no valid mask is available; restart with a clear, front-facing body view to recalibrate. This prioritizes visual stability over continuous silhouette reshaping.

Regression tests now exercise 40 sequential arm-motion frames with alternating wide, narrow, missing and partial body measurements through the smoother and calibration, then compare every body vertex. They also cover translation/distance and recalibration. Canvas `data-renderer-version="waist-lock-v1"` identifies this build for diagnostics. Physical-camera validation is still required.

## Preserve lower-panel proportions

The lower front from texture row 0.55 downward now uses one uniform scale on both axes, centered on the waist. Pocket shapes, zipper sections and hem texture cannot lengthen independently of their width. Above this area, the chest transitions to that scale; its vertical center connects monotonically to the pocket region, avoiding a folded join on short torso estimates. A short/broad-torso cap reduces both axes together when needed. The artwork's own hem offset replaces the earlier independently scaled vertical hem target for these two image samples. Sleeve behavior and session shape calibration remain separate. Tests check aspect ratio, no shear, waist anchoring and a non-folding transition across short/long and slim/broad synthetic torsos. The current diagnostic marker is `waist-panel-v2`.
