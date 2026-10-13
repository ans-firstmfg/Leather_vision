import sharp from "sharp";
import type { ImageEditProvider } from "./types";

// This exercises the app pipeline without claiming to apply the AI prompt.
export const mockProvider: ImageEditProvider = {
  id: "mock",
  async editImage({ imagePng, variationIndex = 0, signal }) {
    signal?.throwIfAborted();
    const label = Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      ${!imagePng ? '<text x="512" y="470" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#374151">No reference image</text><text x="512" y="525" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#374151">Demo placeholder - connect AI for a product design</text>' : ''}
      <rect y="924" width="1024" height="100" fill="#111827"/>
      <text x="512" y="965" text-anchor="middle" font-family="sans-serif" font-size="30" fill="white">DEMO - AI editing disabled</text>
      <text x="512" y="1000" text-anchor="middle" font-family="sans-serif" font-size="22" fill="white">Preview ${variationIndex + 1} - requested changes are not applied</text>
    </svg>`);
    const canvas = imagePng ? sharp(imagePng, { limitInputPixels: 16777216 })
      : sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#f3f4f6" } });
    const bytes = await canvas
      .resize(1024, 1024, { fit: "contain", background: "#f3f4f6" })
      .composite([{ input: label }]).png().toBuffer();
    signal?.throwIfAborted();
    return { bytes };
  },
};
