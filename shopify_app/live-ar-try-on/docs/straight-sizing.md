# Straight default jacket body

Both open-front samples use the same shoulder-derived full width at every row from the shoulder seam to the hem. The source texture's calibrated outer boundaries are normalized at each row, removing the artificial waist pinch and hem flare. Centers lie on a straight line between the shoulder midpoint and tracked hip midpoint. Rotation, leaning, camera distance and shoulder-to-hip length remain live. Chest/waist/hip mask widths no longer change this front-body outline. Original collars, transparent openings, texture and articulated sleeves remain.

This replaces dynamic silhouette sizing at the user's request. The adaptive-size module has been removed from the active renderer. Segmentation remains available for existing hand occlusion and lighting. Sample body projection no longer adds row-dependent depth offsets that could bow the straight sides during modest turns. Generic uploaded garments retain their existing calibration path.

Tests verify equal left-to-right width on every actual body-mesh row across slim/broad mask values, shorter/taller torsos and leaning centers. Production draw transforms remain identical despite sustained mask changes and independent arm movement. This is a straight 2D visual overlay, not cloth simulation or physical size measurement. Real-camera alignment still needs checking. Diagnostic marker: `straight-body-v5`.
