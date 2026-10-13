import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import db from "../db.server";
import { getJob, getOwnedJob } from "../services/jobs.server";
import { generationDir, generationFilePath } from "../services/generate.server";
import { authenticateProxy, privateHeaders, requestToken, requireStorefrontAction } from "../services/proxy.server";
import { MAX_BYTES, processReferenceImage, readGenerationForm, UploadError } from "../services/upload.server";

const reply = (body: object, status = 200) => Response.json(body, { status, headers: privateHeaders });

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const owner = await authenticateProxy(request);
  requireStorefrontAction(request);
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const job = params.id && await getOwnedJob(params.id, owner, requestToken(request));
  if (!job || job.options.provider !== "puter") return reply({ error: "Generation not found" }, 404);
  let form: FormData;
  try { form = await readGenerationForm(request); } catch (error) {
    return reply({ error: error instanceof UploadError ? error.message : "Invalid result upload" }, error instanceof UploadError ? error.status : 400);
  }
  if (form.get("action") === "cancel") {
    await db.generation.updateMany({ where: { id: job.id, status: "awaiting_client" },
      data: { status: "failed", error: "Puter generation was interrupted. It was not retried automatically." } });
    return reply({ status: (await getJob(job.id))?.status });
  }
  const variationId = form.get("variationId");
  if (typeof variationId !== "string" || !/^v[1-4]$/.test(variationId)) return reply({ error: "Invalid variation" }, 400);
  // Repeated uploads are acknowledged without overwriting a saved image or calling AI again.
  if (["awaiting_client", "ready"].includes(job.status) && job.variations.some((v) => v.id === variationId)) {
    return reply({ status: job.status });
  }
  if (job.status !== "awaiting_client" || variationId !== "v" + (job.variations.length + 1) ||
    job.variations.length >= job.options.variationCount) return reply({ error: "This generation cannot accept that result" }, 409);
  const image = form.get("image");
  // Accept bytes only. The backend never fetches a customer-supplied URL.
  if (!(image instanceof File) || !image.size || image.size > MAX_BYTES) return reply({ error: "Upload a generated image of 8 MB or smaller" }, 400);
  let png: Buffer;
  try { png = await processReferenceImage(Buffer.from(await image.arrayBuffer())); }
  catch { return reply({ error: "The generated result must be a valid still PNG, JPG, or WebP image" }, 400); }
  const lease = randomUUID();
  const claimed = await db.generation.updateMany({ where: { id: job.id, status: "awaiting_client",
    variations: JSON.stringify(job.variations), expiresAt: { gt: new Date() } },
    data: { status: "receiving_client", workerId: lease, leaseUntil: new Date(Date.now() + 60000) } });
  if (!claimed.count) return reply({ error: "This generation is no longer accepting results" }, 409);
  try {
    const filename = "variation-" + (job.variations.length + 1) + ".png";
    await mkdir(generationDir(job.id), { recursive: true });
    await writeFile(generationFilePath(job.id, filename), png);
    const variations = [...job.variations, { id: variationId, filename }];
    const status = variations.length === job.options.variationCount ? "ready" : "awaiting_client";
    const saved = await db.generation.updateMany({ where: { id: job.id, status: "receiving_client", workerId: lease,
      expiresAt: { gt: new Date() } }, data: { status, variations: JSON.stringify(variations), workerId: null, leaseUntil: null } });
    return saved.count ? reply({ status }) : reply({ error: "This generation is no longer available" }, 409);
  } catch {
    await db.generation.updateMany({ where: { id: job.id, status: "receiving_client", workerId: lease },
      data: { status: "failed", error: "The generated image could not be saved. Please try again later.", workerId: null, leaseUntil: null } });
    return reply({ error: "The generated image could not be saved" }, 503);
  } finally {
    if (!(await getJob(job.id))) await rm(generationDir(job.id), { recursive: true, force: true });
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateProxy(request);
  return reply({ error: "Use POST to save a generated image" }, 405);
};
