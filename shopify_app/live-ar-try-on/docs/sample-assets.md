# Sample jackets

User supplied Sample3Diamge.png, brown-biker-jacket-mens__82016_thumb.webp and trucker-jacket-mens-black__95015_thumb.webp on 27 October 2026.

Prepared with the built-in image-generation editor, using each original as the edit target. Prompt for each: remove only the pale background, including sleeve/body gaps; preserve garment design, silhouette, proportions, sleeves, collar, fasteners, pockets, labels, color and texture; full front view with a small transparent margin; genuine alpha transparency; no person, shadow, text or redesign. These are AI-prepared sample cutouts, not verified product imagery; fine details can differ from the originals.

Saved project assets:
- `extensions/leather-vision/assets/ar-sample-cafe.png`
- `extensions/leather-vision/assets/ar-sample-brown.png`
- `extensions/leather-vision/assets/ar-sample-trucker.png`

All three contain alpha transparency. They are flat images, not rigged 3D garments. Sleeves do not articulate with the wearer's arms. Actual garment alignment and mobile performance remain unvalidated.

The Live AR block shows a dark sample gallery when no real variants are mapped and **Show sample jackets when unconfigured** is enabled. Mapping a real product takes priority. Sample mode hides purchasing controls and is rejected by the cart helper before any network request. The same three assets are served in the loopback preview.

The user confirmed removing Automation Recommendations from Shopify admin and the Dev Dashboard. Its unused local project was subsequently removed at the user's request. The two active projects are `ai-image-rendering` (Leather Vision) and `live-ar-try-on`, with independent app IDs, extensions, dependencies and build commands.
