# Open-front rider sample

The gallery contains **Open-front rider jacket (ID 8)** and **Brown open-front jacket (ID 9)**. All 3D samples, source models and the 3D renderer have been removed at the user's request. IDs 1–7 and 10 remain retired. Shopify product records are unchanged.

Input: the user's `Gemini_Generated_Image_mtzi43mtzi43mtzi.jfif` from the supplied network-share path, preserved unchanged. A local working copy lives in the ignored cache. The built-in image-generation tool prepared a real-alpha PNG, removed the red background, rear lining, rear neck bridge and rear waistband across the open center, then straightened the sleeves at the user's request. The edit follows the supplied padded leather design; generative editing can change fine details. It is a preview cutout, not approved production artwork or a 3D reconstruction.

Final project asset: `extensions/live-ar/assets/ar-sample-open-rider.png`. The complete center is transparent so the live shopper's neck and shirt remain visible. The `open` alignment profile uses the straight sleeve pose; it does not extend the original collar into a closed collar. Existing garment tracking and single-row thumbnails remain in use. Sample mode cannot add anything to the cart.

## Brown jacket addition

Input: the user's `Gemini_Generated_Image_w3f208w3f208w3f2.jfif` from the supplied network share. The original remains unchanged. The built-in image-generation tool removed the white background, gray rear lining, back collar bridge and rear waistband, with straight sleeves. Brown leather, shoulder panels, brass hardware and the single viewer-right chest zip pocket follow the supplied design; fine details can differ after generative editing. The center is genuinely transparent from top to bottom.

Asset: `extensions/live-ar/assets/ar-sample-open-brown.png`; ID 9 and alignment profile `open_brown`. Both black and brown images remain available. The numeric IDs of existing samples are unchanged.

The brown sample's body panel has additional vertical coverage following the user's marked camera screenshot: the hem drops by 6% of tracked torso height and the collar rises by 3.5% of shoulder span. These offsets follow shoulder tilt. Shoulder, elbow and cuff targets stay fixed, and the source artwork, transparent opening, width and black sample are unchanged.

Final brown edit prompt (built-in tool):

> Precise-object-edit: keep this EXACT brown jacket cutout, front panels, brown leather, shoulder pads, single viewer-right zip chest pocket, side pockets, brass hardware, straight sleeves and cuffs unchanged. Erase ONLY the horizontal rear collar bridge connecting the left and right collar at the very top. Keep the outer front collar sides. The center opening must be transparent continuously from the TOP EDGE to the BOTTOM EDGE: no rear collar strip, no lining and no rear waistband bridging it. Clean any tiny red edge artifacts and floating pixels. Add 4% transparent padding around the complete garment so neither collar nor cuffs touch the canvas edge; centered square composition, no crop. Genuine alpha transparency, no black/gray fill, checkerboard, person, mannequin, text or redesign. This is an open-front camera overlay; a wearer's real neck and shirt must be visible through the central opening.

## Black jacket final edit prompt (built-in tool)

> Precise-object-edit of the supplied alpha-transparent black OPEN FRONT leather jacket. Change ONLY the sleeve pose: straighten both sleeves into a symmetrical relaxed arms-down position, upper arms and forearms aligned without elbow bends, both cuffs level, sleeves hanging nearly vertically alongside the torso with a slight natural outward angle and a narrow transparent gap separating each sleeve from the torso. Preserve the exact existing padded ribbed shoulder and forearm bands, all stitching, chest zipper pockets, upper sleeve zip pocket, lower front zip pockets, silver snaps, side buckles, black leather texture and SAME front-panel silhouette and design. Keep the two front halves separated: the ENTIRE center opening from neck to bottom is TRUE TRANSPARENCY, with no inner lining, no rear horizontal collar bridge and no rear waistband bridging the opening. Keep only the front-facing outer jacket. NO person, mannequin, skin, shirt, hands, back lining, added text or new styling. Full collar and cuffs uncropped with small transparent margins on all sides. Square canvas, high-quality transparent PNG, genuine alpha=0 in background and all openings. Keep this exact jacket design rather than generating a different jacket.
