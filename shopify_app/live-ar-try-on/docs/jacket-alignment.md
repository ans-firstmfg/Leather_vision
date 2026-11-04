# Jacket alignment — 28 October 2026

Current update: the two open-front samples now use independent sleeve meshes and waist-anchored hems. See `waist-and-sleeves.md` for current behavior and checks; the notes below describe the earlier generic warp.

The old renderer fitted the entire PNG (including sleeves and transparent margins) into a torso rectangle. Consequently the actual jacket body was much narrower than the wearer's shoulders, the collar floated over the chest, and sleeves stayed straight.

Sample jackets now use individual normalized garment-joint profiles. A weighted local affine mesh maps shoulders, hips, elbows and wrists to smoothed body landmarks. Additional collar anchors keep neckline height proportional to shoulder width instead of torso length. Body width includes a small ease allowance and a minimum waist width. Low-confidence joints are discarded immediately; the UI requests visible elbows/wrists while using a neutral sleeve fallback. Inverted mesh patches are suppressed in unsupported poses.

The current black and brown open-front image samples select their profiles automatically. Earlier image samples have been retired; all 3D samples have also been removed. For a merchant-uploaded garment, choose **Uploaded garment type → Jacket** for the generic sample-shaped calibration, or **Vest** for the original rigid overlay. Generic jacket calibration expects a tightly cropped, transparent, front-view garment with arms down; different photography needs individual anchor calibration.

All image-based jackets now share shoulder/chest stabilization through `garment-shape.ts`: the upper panel follows shoulder/collar anchors, the central body follows shoulders/hips, and sleeve motion blends in near the arm seams. Cafe racer and brown biker images receive a modest stand-collar lift; trucker and generic uploaded jackets retain their original collar styles. Image rendering adds no invented 3D depth or replacement material. Vest rendering remains the sleeveless overlay. These changes affect all existing mapped jacket variants automatically; no Shopify product records are modified.

Shoulder-coverage correction: garment shoulder seams are lifted by 10% of tracked shoulder span, with neckline anchors 30% of span above the shoulder-joint midpoint and a smaller 3.5% lift at the hem. All offsets follow shoulder tilt and scale with camera distance. Visible elbows and wrists stay attached to their original landmarks. This is an alignment correction rather than additional collar stretching. Real-camera validation of neck placement and shoulder coverage remains required.

Verification: 26 tests pass, including landmark-to-texture alignment, collar placement, bent wrists with stable body anchors, uncertainty handling and finite/bounded canvas transforms. Typechecking and Shopify Liquid validation pass. Browser checked a before/after technical illustration using the actual renderer at `/fit-check` on the loopback demo. This illustration is not a camera or photo-quality test. No image assets were regenerated or altered.

Remaining limits: no cloth physics, learned garment transfer, depth-aware hand/arm masking or reliable side/crossed-arm views. Performance, proportions and appearance still need real-camera testing on the pilot wearer/devices. Changes are local; no production deployment was performed.
