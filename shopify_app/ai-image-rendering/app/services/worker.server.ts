import { randomUUID } from "node:crypto";
import db from "../db.server";
import { generationLimits } from "./config.server";
import { claimJob } from "./jobs.server";
import { removeGenerations, runGeneration } from "./generate.server";

let running = false;
let timer: ReturnType<typeof setInterval> | undefined;
const workerId = randomUUID();

export async function maintainJobs() {
  const now = new Date();
  // Interrupted provider calls may already have been billed, so do not retry them.
  await db.generation.updateMany({ where: { OR: [
    { status: "processing", leaseUntil: { lt: now } },
    { status: "receiving_client", leaseUntil: { lt: now } },
    { status: "awaiting_client", updatedAt: { lt: new Date(now.getTime() - 30 * 60000) } },
    { status: "uploading", updatedAt: { lt: new Date(now.getTime() - 300000) } },
  ] }, data: { status: "failed", error: "This generation was interrupted. Please start a new generation.", workerId: null, leaseUntil: null } });
  await removeGenerations({ expiresAt: { lt: now }, status: { not: "processing" } }, 100);
}

export async function drainQueue() {
  if (running) return;
  running = true;
  try {
    await maintainJobs();
    const results = await Promise.allSettled(Array.from({ length: generationLimits().concurrency }, async () => {
      for (;;) {
        const job = await claimJob(workerId);
        if (!job) break;
        const controller = new AbortController();
        const heartbeat = setInterval(() => {
          void db.generation.updateMany({ where: { id: job.id, workerId, status: "processing" },
            data: { leaseUntil: new Date(Date.now() + 60000) } }).then((result) => {
            if (!result.count) controller.abort();
          }).catch(() => {
            console.error("Leather Vision worker heartbeat failed");
          });
        }, 15000);
        try { await runGeneration(job, workerId, controller.signal); } finally { clearInterval(heartbeat); }
      }
    }));
    if (results.some((result) => result.status === "rejected")) console.error("Leather Vision queue task failed");
  } finally { running = false; }
}

export function startWorker() {
  if (timer) return;
  const tick = () => { void drainQueue().catch(() => console.error("Leather Vision worker unavailable; check database and storage configuration")); };
  tick();
  timer = setInterval(tick, 3000);
  timer.unref();
}

export function stopWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
