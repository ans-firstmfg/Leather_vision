import sharp from "sharp";
import { cloudflareConfiguration } from "./config.server";
import type { ImageEditProvider } from "./types";

const MAX_RESPONSE_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export class CloudflareImageError extends Error {
  constructor(public status: number, public code?: number, public requestId?: string) {
    super(`Cloudflare image request failed (${status})`);
    this.name = "CloudflareImageError";
  }

  get publicMessage() {
    if (this.status === 429) return "The design service allowance or rate limit was reached. Please try again later.";
    if (this.status === 401 || this.status === 403) return "The design service is unavailable. Please contact the store.";
    return "The design service could not complete this image. Please try again later.";
  }
}

async function payload(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new CloudflareImageError(502);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new CloudflareImageError(502);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new CloudflareImageError(502);
    }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new CloudflareImageError(response.ok ? 502 : response.status); }
}

export const cloudflareProvider: ImageEditProvider = {
  id: "cloudflare",
  async editImage({ imagePng, materialPng, prompt, signal }) {
    const config = cloudflareConfiguration();
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000);
    requestSignal.throwIfAborted();
    const form = new FormData();
    form.set("prompt", prompt);
    form.set("width", String(config.size));
    form.set("height", String(config.size));
    const inputs = [imagePng, materialPng].filter((input): input is Buffer => Boolean(input));
    for (const [index, input] of inputs.entries()) {
      // Klein accepts reference inputs below 512x512. Preserve aspect ratio at 448px.
      const reference = await sharp(input, { limitInputPixels: 16777216 })
        .rotate().resize(448, 448, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
      form.set(`input_image_${index}`, new File([new Uint8Array(reference)], `reference-${index}.png`, { type: "image/png" }));
    }
    requestSignal.throwIfAborted();
    // Fixed host, validated account/model, no redirects and no automatic generation retries.
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${config.model}`, {
      method: "POST", headers: { Authorization: `Bearer ${config.token}` },
      body: form, signal: requestSignal, redirect: "error",
    });
    const data = await payload(response) as {
      success?: boolean; result?: { image?: unknown }; errors?: Array<{ code?: unknown }>;
    } | null;
    if (!response.ok || data?.success === false) {
      const code = data?.errors?.[0]?.code;
      const ray = response.headers.get("cf-ray") || "";
      throw new CloudflareImageError(response.ok ? 502 : response.status,
        typeof code === "number" && Number.isSafeInteger(code) ? code : undefined,
        /^[a-zA-Z0-9-]{1,100}$/.test(ray) ? ray : undefined);
    }
    const base64 = data?.result?.image;
    if (typeof base64 !== "string" || !base64.length || base64.length % 4 !== 0 ||
      !/^[a-zA-Z0-9+/]+={0,2}$/.test(base64)) throw new CloudflareImageError(502);
    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new CloudflareImageError(502);
    // Validate actual pixels, not just a declared MIME type or a base64 envelope.
    await sharp(bytes, { limitInputPixels: 16777216 }).metadata();
    return { bytes };
  },
};
