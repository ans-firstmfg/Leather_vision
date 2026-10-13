import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Generation } from "@prisma/client";
import db from "../db.server";
import { generationLimits } from "./config.server";
import { configuredProvider, puterConfiguration, type ImageProviderId } from "./ai/config.server";

export type JobStatus = "uploading" | "awaiting_client" | "receiving_client" | "pending" | "processing" | "ready" | "failed";
export type JobVariation = { id: string; filename: string };
export type JobOptions = {
  provider?: ImageProviderId;
  hasReferenceImage?: boolean;
  puter?: ReturnType<typeof puterConfiguration>;
  productType?: string; leather?: string; color?: string; stitching?: string;
  hardware?: string; instructions?: string; variationCount: number;
};
export type GenerationJob = Omit<Generation, "options" | "variations" | "status"> & {
  status: JobStatus; options: JobOptions; variations: JobVariation[];
};
export type JobOwner = { shop: string; customerId: string | null; actorHash: string };
export class QuotaError extends Error {}
export class ShopUnavailableError extends Error {}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseStored<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function hydrate(row: Generation): GenerationJob {
  return { ...row, status: row.status as JobStatus,
    options: parseStored<JobOptions>(row.options, { variationCount: row.variationCount }),
    variations: parseStored<JobVariation[]>(row.variations, []) };
}

// SQLite cannot upgrade concurrent read transactions to writes, so this single
// app instance runs its read-then-write transactions one at a time.
let transactionQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const result = transactionQueue.then(work);
  transactionQueue = result.catch(() => undefined);
  return result;
}

export async function createJob(id: string, owner: JobOwner, options: JobOptions) {
  const limits = generationLimits();
  const now = new Date();
  const since = new Date(now.getTime() - 86400000);
  const token = randomBytes(32).toString("hex");
  const provider = configuredProvider();
  const storedOptions = { ...options, provider, puter: provider === "puter" ? puterConfiguration() : undefined };
  const row = await serialized(() => db.$transaction(async (tx) => {
    if (!(await tx.session.findFirst({ where: { shop: owner.shop } }))) {
      throw new ShopUnavailableError("This shop is not connected to Leather Vision.");
    }
    const active = await tx.generation.count({ where: {
      shop: owner.shop, status: { in: ["uploading", "awaiting_client", "receiving_client", "pending", "processing"] },
    } });
    const shopUsage = await tx.generation.aggregate({ where: { shop: owner.shop, createdAt: { gte: since } }, _sum: { variationCount: true } });
    const actorUsage = await tx.generation.aggregate({ where: { shop: owner.shop, actorHash: owner.actorHash, createdAt: { gte: since } }, _sum: { variationCount: true } });
    if (active >= limits.activePerShop ||
      (shopUsage._sum.variationCount ?? 0) + options.variationCount > limits.dailyPerShop ||
      (actorUsage._sum.variationCount ?? 0) + options.variationCount > limits.dailyPerActor) {
      throw new QuotaError("Generation limit reached. Please try again later.");
    }
    return tx.generation.create({ data: {
      id, ...owner, tokenHash: hashToken(token), options: JSON.stringify(storedOptions),
      variationCount: options.variationCount,
      expiresAt: new Date(now.getTime() + limits.retentionDays * 86400000),
    } });
  }));
  return { job: hydrate(row), token };
}

export async function getJob(id: string): Promise<GenerationJob | undefined> {
  const row = await db.generation.findUnique({ where: { id } });
  return row ? hydrate(row) : undefined;
}

export function canAccessJob(job: GenerationJob, owner: Pick<JobOwner, "shop" | "customerId">, token: string) {
  if (job.shop !== owner.shop || job.customerId !== owner.customerId ||
    job.expiresAt.getTime() <= Date.now() || !/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(job.tokenHash, "hex"), Buffer.from(hashToken(token), "hex"));
}

export async function getOwnedJob(id: string, owner: Pick<JobOwner, "shop" | "customerId">, token: string) {
  const job = await getJob(id);
  return job && canAccessJob(job, owner, token) ? job : undefined;
}

export async function enqueueJob(id: string, client = false) {
  return db.generation.updateMany({ where: { id, status: "uploading" }, data: { status: client ? "awaiting_client" : "pending" } });
}

export async function failUpload(id: string) {
  return db.generation.updateMany({ where: { id, status: "uploading" },
    data: { status: "failed", error: "The upload could not be processed. Please use a valid PNG, JPG, or WebP image." } });
}

export async function cancelQueuedJobs(shop: string) {
  return db.generation.updateMany({ where: { shop, status: { in: ["uploading", "awaiting_client", "receiving_client", "pending"] } },
    data: { status: "failed", error: "This store is no longer connected to Leather Vision." } });
}

export async function claimJob(workerId: string): Promise<GenerationJob | undefined> {
  return serialized(() => db.$transaction(async (tx) => {
    const active = await tx.generation.count({ where: { status: "processing" } });
    if (active >= generationLimits().concurrency) return undefined;
    const row = await tx.generation.findFirst({ where: { status: "pending", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "asc" } });
    if (!row) return undefined;
    const leaseUntil = new Date(Date.now() + 60000);
    const result = await tx.generation.updateMany({ where: { id: row.id, status: "pending" },
      data: { status: "processing", workerId, leaseUntil } });
    return result.count ? hydrate({ ...row, status: "processing", workerId, leaseUntil }) : undefined;
  }));
}

export async function completeJob(id: string, workerId: string, variations: JobVariation[]) {
  return db.generation.updateMany({ where: { id, status: "processing", workerId },
    data: { status: "ready", variations: JSON.stringify(variations), workerId: null, leaseUntil: null } });
}

export async function failJob(id: string, workerId: string) {
  return db.generation.updateMany({ where: { id, status: "processing", workerId }, data: {
    status: "failed", error: "Generation failed. Please try again later.", workerId: null, leaseUntil: null,
  } });
}

export async function saveSelection(job: GenerationJob, variationId: string) {
  const variation = job.variations.find((v) => v.id === variationId);
  if (job.status !== "ready" || !variation) return undefined;
  const updated = await db.generation.updateMany({ where: {
    id: job.id, shop: job.shop, status: "ready", expiresAt: { gt: new Date() },
  }, data: { selectedVariation: variation.id,
    expiresAt: new Date(Date.now() + generationLimits().retentionDays * 86400000) } });
  if (!updated.count) return undefined;
  return { "Design reference": job.id + " / " + variation.id,
    ...(job.options.provider === "mock" || job.options.puter?.testMode ? { "Design mode": "Demo - AI editing disabled" } : {}),
    ...(job.options.provider === "puter" ? { "Design source": "Puter - customer supplied" } : {}),
    _leather_vision_generation: job.id, _leather_vision_variation: variation.id };
}
