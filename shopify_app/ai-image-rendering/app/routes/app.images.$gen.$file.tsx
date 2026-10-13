import type { LoaderFunctionArgs } from "react-router";
import { readFile } from "node:fs/promises";
import { authenticate } from "../shopify.server";
import { getJob } from "../services/jobs.server";
import { generationFilePath } from "../services/generate.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const gen = params.gen, file = params.file;
  if (!gen || !file || !/^variation-[1-4]\.png$/.test(file)) return new Response("Not found", { status: 404 });
  const job = await getJob(gen);
  if (!job || job.shop !== session.shop || job.status !== "ready" ||
    job.expiresAt.getTime() <= Date.now() || !job.variations.some((v) => v.filename === file)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    return new Response(new Uint8Array(await readFile(generationFilePath(gen, file))), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" },
    });
  } catch { return new Response("Not found", { status: 404 }); }
};
