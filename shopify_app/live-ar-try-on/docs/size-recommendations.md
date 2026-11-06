# Live size preview and suggestions

## Shopper flow

Open the camera, then expand **Find my size**. Samples start at **M**.
Selecting S, M, L, XL, XXL or 3XL changes jacket width, body length and cuff reach.
The preview uses relative garment proportions; it does not prove physical fit.
Straight body panels remain independent of sleeves and the collar stays neck-anchored.
Different size lengths can place the hem above or below the reference hip position.

For an optional suggestion, enter height in centimeters (120–220), choose
**Suggest my size**, and follow the front/side instructions. Keep your full head
and heels visible, stand upright in close-fitting clothes, keep arms slightly
apart in front view, and hold forearms forward away from the torso in side view.
Each capture needs at least 15 consecutive valid observations spanning 1.2 seconds.
The capture window supports inference down to five frames per second. Cropping,
poor confidence, arm crossings, unstable frames and timeouts produce guidance,
not a guessed size. If all three estimated circumferences cannot fit one chart
row, no single size is suggested. Shared boundaries favour the larger row.

A successful scan sets the reference size for the body-aligned jacket. Before a
manual choice, it also selects the suggestion. After a manual choice, it preserves
that selection; **Use suggested size** restores automatic selection. An unavailable
real-product suggestion never silently changes the cart variant.

## Demo measurements only

These fixtures are illustrative and are NOT First MFG measurements. They apply
only to sample products, which cannot be purchased.

| Size | Chest circumference | Shoulder width | Body length | Sleeve length |
|---|---:|---:|---:|---:|
| S | 96 | 44 | 64 | 62 |
| M | 104 | 46 | 66 | 64 |
| L | 112 | 48 | 68 | 66 |
| XL | 120 | 50 | 70 | 68 |
| XXL | 128 | 52 | 72 | 70 |
| 3XL | 136 | 54 | 74 | 72 |

All values are cm. S body ranges are chest 84–92, waist 72–80 and hips 88–96;
add 8 cm to each range for every subsequent size.

The stable silhouette/body fit is the baseline. Width uses the average selected/
reference chest and shoulder ratios; body length and sleeve reach use their own
ratios. Cuffs extend along the forearm while elbows stay tracked. The collar is
not stretched onto the face. This is approximate 2D grading, not cloth simulation.

## Real product configuration

In the Live AR block, **Approved product size chart (JSON, cm)** accepts a chart
with the matching Shopify product ID, body circumference ranges and garment
dimensions. Labels must be among S/M/L/XL/XXL/3XL. Only available variants explicitly
mapped to the current garment/color can be selected. Missing chart data disables
size-dependent previews and scanning; existing variant selection still works.
There is no demo-chart fallback for real products.

Shape example only (replace all numbers with approved product measurements):

```json
{
  "productId": "REPLACE_WITH_NUMERIC_SHOPIFY_PRODUCT_ID",
  "kind": "body_cm",
  "sizes": [
    {
      "label": "M",
      "chest": [92, 100],
      "waist": [80, 88],
      "hips": [96, 104],
      "garment": {"chest": 104, "shoulder": 46, "length": 66, "sleeve": 64}
    }
  ]
}
```

Body chart numbers are full circumferences, not flat widths. Garment chest is
also circumference; shoulder, body length and sleeve are linear dimensions.
Body charts already describe the intended fit range: no extra ease is added by
the recommendation calculation. Add every supported size as its own row. Charts
with the wrong product ID, unsupported units, missing dimensions, invalid ranges
or duplicate labels are refused.

## State, privacy and validation

Size selection and the reference persist through camera restart and garment
loading within the block session. Same-artwork size changes reuse the decoded
image and accepted silhouette calibration. Late asset loads cannot replace newer
artwork. Tracking loss still clears pose calibration as before. Restarting or
backgrounding cancels an unfinished scan while keeping the size choice. Closing
the camera clears the height field and unfinished capture; removing the block
disposes its listeners. No camera frames, body measurements or height are uploaded
or persisted. The selected size label/reference remain in session memory.

The existing on-device tracker provides the masks and landmarks. No new external
AI model, measurement API, backend or paid service is introduced. Full-body height
calibration and front/side ellipse circumference estimation are experimental.
Perspective, hair, footwear, loose clothes and tracking errors can bias the result.
The tests check UI state, synthetic geometry, scan gates and chart matching; they
do not establish real-world measurement accuracy. Benchmark against tape measures
and actual jacket outcomes across bodies, cameras and lighting before production
accuracy claims. Leather Vision is unchanged.
