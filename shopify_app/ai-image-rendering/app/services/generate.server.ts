import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import db from "../db.server";
import { getImageEditProvider } from "./ai/index.server";
import { OpenAIError } from "./ai/openai.server";
import { CloudflareImageError } from "./ai/cloudflare.server";
import { getJob, completeJob, failJob, type GenerationJob, type JobVariation } from "./jobs.server";
import { buildEditPrompt } from "./promptBuilder.server";
import { leatherSwatch } from "./materialReference.server";

const DATA_ROOT = path.resolve(process.env.GENERATION_DATA_DIR || ".data");
export const UPLOAD_FILENAME = "upload.png";

export function generationDir(id: string): string {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid generation id");
  return path.join(DATA_ROOT, id);
}

export function generationFilePath(id: string, filename: string): string {
  if (filename !== UPLOAD_FILENAME && !/^variation-[1-4]\.png$/.test(filename)) throw new Error("Invalid filename");
  return path.join(generationDir(id), filename);
}

// Removes image directories before rows so a failure never leaves unreferenced customer images.
export async function removeGenerations(where: Prisma.GenerationWhereInput, take?: number) {
  const jobs = await db.generation.findMany({ where, select: { id: true }, take });
  for (const job of jobs) await rm(generationDir(job.id), { recursive: true, force: true });
  if (jobs.length) await db.generation.deleteMany({ where: { AND: [where, { id: { in: jobs.map((job) => job.id) } }] } });
  return jobs.length;
}

export async function normalizeGeneratedImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error("Invalid provider image size");
  return sharp(bytes, { limitInputPixels: 16777216 }).png({ compressionLevel: 8 }).toBuffer();
}

export async function runGeneration(job: GenerationJob, workerId: string, signal?: AbortSignal) {
  try {
    await mkdir(generationDir(job.id), { recursive: true });
    // Older jobs always had a reference; do not silently ignore a missing upload.
    const imagePng = job.options.hasReferenceImage === false ? undefined
      : await readFile(generationFilePath(job.id, UPLOAD_FILENAME));
    const provider = getImageEditProvider(job.options.provider || "openai");
    const materialPng = provider.id === "cloudflare" ? await leatherSwatch(job.options.leather) : undefined;
    const variations: JobVariation[] = [];
    for (let i = 0; i < job.options.variationCount; i++) {
      const current = await getJob(job.id);
      if (!current || current.status !== "processing" || current.workerId !== workerId) return;
      const { bytes } = await provider.editImage({ imagePng, materialPng,
        prompt: buildEditPrompt(job.options, i, Boolean(materialPng)), variationIndex: i, signal });
      const afterEdit = await getJob(job.id);
      if (!afterEdit || afterEdit.status !== "processing" || afterEdit.workerId !== workerId) return;
      const filename = "variation-" + (i + 1) + ".png";
      await writeFile(generationFilePath(job.id, filename), await normalizeGeneratedImage(bytes));
      variations.push({ id: "v" + (i + 1), filename });
    }
    await completeJob(job.id, workerId, variations);
  } catch (error) {
    console.error("Leather Vision generation failed", { generationId: job.id,
      errorType: error instanceof Error ? error.name : "UnknownError",
      ...(error instanceof OpenAIError ? { provider: "openai", status: error.status,
        code: error.code, providerType: error.type, requestId: error.requestId } : {}),
      ...(error instanceof CloudflareImageError ? { provider: "cloudflare", status: error.status,
        code: error.code, requestId: error.requestId } : {}) });
    await failJob(job.id, workerId, error instanceof CloudflareImageError ? error.publicMessage : undefined);
  } finally {
    if (!(await getJob(job.id))) await rm(generationDir(job.id), { recursive: true, force: true });
  }
}
