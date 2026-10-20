import sharp from "sharp";
import { isLeather } from "./materials.server";

export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_REQUEST_BYTES = MAX_BYTES + 64 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/pjpeg", "image/webp"]);
const ALLOWED_EXTS = new Set([".png", ".jpg", ".jpeg", ".jfif", ".webp"]);

export class UploadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function readGenerationForm(request: Request): Promise<FormData> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new UploadError("Expected multipart form data");
  }
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    throw new UploadError("Upload request is too large", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError("Missing upload");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new UploadError("Upload request is too large", 413);
    }
    chunks.push(value);
  }
  return new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) }).formData();
}

export type ParsedGenerationInput = {
  image?: File; productType?: string; leather?: string; color?: string;
  stitching?: string; hardware?: string; instructions?: string; variationCount: number;
};

function text(value: FormDataEntryValue | null, max = 100): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, max) || undefined;
}

export async function parseGenerationFormData(form: FormData):
  Promise<{ ok: true; data: ParsedGenerationInput } | { ok: false; error: string }> {
  const entry = form.get("image");
  // Browsers serialize an unselected file input as an empty, unnamed File.
  const image = entry === null || (entry instanceof File && !entry.name && !entry.size) ? undefined : entry;
  if (image !== undefined && (!(image instanceof File) || !image.size)) {
    return { ok: false, error: "Please upload a valid sample image or leave it empty." };
  }
  if (image instanceof File) {
    if (image.size > MAX_BYTES) return { ok: false, error: "Image must be 8 MB or smaller." };
    // Either identifier may be missing, but whatever is present must be allowed.
    // processReferenceImage verifies the decoded format before the job is queued.
    const dot = image.name.lastIndexOf(".");
    const ext = dot > 0 ? image.name.slice(dot).toLowerCase() : "";
    const type = image.type.toLowerCase() === "application/octet-stream" ? "" : image.type.toLowerCase();
    if ((ext && !ALLOWED_EXTS.has(ext)) || (type && !ALLOWED_TYPES.has(type)) || (!ext && !type)) {
      return { ok: false, error: "Only PNG, JPG, and WebP images are allowed." };
    }
  }
  const productType = text(form.get("productType")), leather = text(form.get("leather"));
  if (productType && !["briefcase", "wallet", "belt", "bag", "jacket", "other"].includes(productType)) {
    return { ok: false, error: "Invalid product type." };
  }
  if (leather && !isLeather(leather)) {
    return { ok: false, error: "Invalid leather type." };
  }
  const variationCount = Number(form.get("variationCount") ?? 1);
  if (!Number.isInteger(variationCount) || variationCount < 1 || variationCount > 4) {
    return { ok: false, error: "Choose between 1 and 4 variations." };
  }
  const instructions = text(form.get("instructions"), 500);
  if (!image && !productType && !instructions && !(leather && text(form.get("color")))) {
    return { ok: false, error: "Choose leather and color, or describe the product you want to create." };
  }
  return { ok: true, data: { image: image as File | undefined, productType, leather, variationCount,
    color: text(form.get("color")), stitching: text(form.get("stitching")),
    hardware: text(form.get("hardware")), instructions } };
}

export async function processReferenceImage(bytes: Buffer): Promise<Buffer> {
  const image = sharp(bytes, { limitInputPixels: 16777216 });
  const metadata = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(metadata.format || "") || (metadata.pages ?? 1) > 1) {
    throw new UploadError("Only still PNG, JPG, and WebP images are allowed.");
  }
  return image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 8 }).toBuffer();
}
