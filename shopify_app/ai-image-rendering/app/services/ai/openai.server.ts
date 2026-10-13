import type { ImageEditProvider, ImageEditRequest, ImageEditResult } from "./types";

const OPENAI_EDITS_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_429_RETRIES = 3;

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return key;
}

function modelName(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
}

const BILLING_CODES = new Set(["insufficient_quota", "credit_balance_exhausted",
  "organization_spend_limit_exceeded", "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded"]);

export class OpenAIError extends Error {
  constructor(public status: number, public code?: string, public type?: string,
    public requestId?: string) {
    super(`OpenAI ${status}${code ? ": " + code : ""}`);
    this.name = "OpenAIError";
  }

  get billingBlocked() {
    return BILLING_CODES.has(this.code || "") || this.type === "insufficient_quota";
  }
}

async function openaiError(res: Response): Promise<OpenAIError> {
  const identifier = (value: unknown) => typeof value === "string" &&
    /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : undefined;
  const json = await res.json().catch(() => null) as {
    error?: { code?: unknown; type?: unknown };
  } | null;
  const requestId = res.headers.get("x-request-id") || "";
  // Never retain raw provider messages: they can contain keys, prompts or uploads.
  return new OpenAIError(res.status, identifier(json?.error?.code), identifier(json?.error?.type),
    /^req_[a-zA-Z0-9_-]{1,100}$/.test(requestId) ? requestId : undefined);
}

function buildForm(model: string, request: ImageEditRequest): FormData {
  if (!request.imagePng) throw new Error("An image is required for an edit");
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", request.prompt);
  form.append("n", "1");
  form.append("size", "1024x1024");
  // input_fidelity is accepted by gpt-image-1 generation models; omit for unknown models.
  if (model === "gpt-image-1" || model === "gpt-image-1.5") form.append("input_fidelity", "high");
  if (model === "gpt-image-1-mini") form.append("input_fidelity", "low");
  form.append(
    "image",
    new File([new Uint8Array(request.imagePng)], "reference.png", {
      type: "image/png",
    }),
  );
  return form;
}

function retryDelay(res: Response, attempt: number): number {
  const header = Number(res.headers.get("retry-after") || "0");
  return header > 0 ? header * 1000 : Math.min(30_000, 2_000 * (attempt + 1));
}

export const openaiProvider: ImageEditProvider = {
  id: "openai",

  async editImage(request: ImageEditRequest): Promise<ImageEditResult> {
    const key = requireApiKey();
    const model = modelName();

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const editing = Boolean(request.imagePng);
        const res = await fetch(editing ? OPENAI_EDITS_URL : OPENAI_GENERATIONS_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, ...(!editing ? { "Content-Type": "application/json" } : {}) },
          body: editing ? buildForm(model, request)
            : JSON.stringify({ model, prompt: request.prompt, n: 1, size: "1024x1024" }),
          signal: request.signal ? AbortSignal.any([controller.signal, request.signal]) : controller.signal,
        });

        const providerError = !res.ok ? await openaiError(res) : undefined;
        if (res.status === 429 && !providerError?.billingBlocked && attempt < MAX_429_RETRIES) {
          const delay = retryDelay(res, attempt);
          clearTimeout(timer);
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, delay);
            request.signal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("OpenAI request timed out")); }, { once: true });
          });
          continue;
        }

        if (!res.ok) {
          throw providerError;
        }

        const payload = (await res.json()) as {
          data?: Array<{ b64_json?: string }>;
        };
        const b64 = payload.data?.[0]?.b64_json;
        if (!b64) {
          throw new Error("OpenAI response did not include an image");
        }
        return { bytes: Buffer.from(b64, "base64") };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("OpenAI request timed out");
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
  },
};
