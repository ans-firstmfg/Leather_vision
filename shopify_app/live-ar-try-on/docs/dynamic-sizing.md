# Dynamic visual sizing

Superseded by the user's requested straight default. See `straight-sizing.md` for current behavior. The dynamic sizing module described below has been removed; these notes record the earlier experiment.

The two current image jackets use `AdaptiveBodySize` (`storefront/live-ar/body-sizing.ts`) instead of the former session-wide width lock. Initial proportions come from reliable measurements or landmark fallback. Accepted chest and hip widths can then increase or decrease without restarting the camera.

Updates require a frontal, steady torso with visible lowered arms, reliable silhouette rows and five consistent samples. Ratios are normalized to shoulder span, reject implausible values, include a small deadband, and move gradually with elapsed time and a bounded rate. Missing rows, rapid arm movement, raised arms and unsupported turns hold the previous accepted ratios. Each row updates independently. The existing mask reader also rejects row intersections with arms and clipped/asymmetric silhouettes. Thus a single bad measurement cannot immediately reshape the front panels. It can take several seconds of a clear relaxed pose to settle; upper-body clothing is part of the measured silhouette.

Position, rotation and distance scaling remain live. Height follows shoulder-to-hip landmarks; the source artwork's hem row now maps to the hip line itself, correcting the previous extra length below the hips. Lower pockets/zipper sections retain uniform scale on both texture axes, with the upper torso providing the transition. This is adaptive 2D rendering, not measured clothing fit, a body scan or physical cloth simulation. Individual sleeve thickness and hidden body contours are not reconstructed.

Tests cover sustained widening/narrowing, bounded update speed, outliers, missing/partial masks, raised arms, resumed clear measurements, production draw transforms, distance changes, shorter/taller torsos, hem alignment and lower-panel proportions. State resets on tracking loss, camera/garment changes and stale timestamps. Canvas marker: `dynamic-body-v4`. Device-camera appearance and frame rate still require physical validation.
