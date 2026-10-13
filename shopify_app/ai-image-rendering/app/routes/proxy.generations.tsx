import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createJob, enqueueJob, failUpload, QuotaError, ShopUnavailableError } from "../services/jobs.server";
import { generationDir, generationFilePath, UPLOAD_FILENAME } from "../services/generate.server";
import { parseGenerationFormData, processReferenceImage, readGenerationForm, UploadError } from "../services/upload.server";
import { authenticateProxy, requireStorefrontAction, privateHeaders, proxyPath } from "../services/proxy.server";
import { validateProviderConfiguration } from "../services/ai/index.server";
import { startWorker } from "../services/worker.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const requestId = randomUUID();
  const started = performance.now();
  const trace = (stage: string) => console.info("Leather Vision upload", {
    requestId, stage, elapsedMs: Math.round(performance.now() - started),
  });
  trace("received");
  const owner = await authenticateProxy(request);
  trace("authenticated");
  requireStorefrontAction(request);
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  try { validateProviderConfiguration(); } catch {
    trace("provider-not-configured");
    return Response.json({ error: "Image generation is not configured. Please contact the store." }, { status: 503, headers: privateHeaders });
  }
  const prefix = proxyPath(request);
  let formData: FormData;
  try { formData = await readGenerationForm(request); } catch (error) {
    return Response.json({ error: error instanceof UploadError ? error.message : "Expected multipart form data" },
      { status: error instanceof UploadError ? error.status : 400, headers: privateHeaders });
  }
  const parsed = await parseGenerationFormData(formData);
  trace("upload-read");
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: privateHeaders });

  const { image, variationCount, ...options } = parsed.data;
  const generationId = randomUUID();
  let token: string;
  try {
    ({ token } = await createJob(generationId, owner, { ...options, variationCount, hasReferenceImage: Boolean(image) }));
    trace("reserved");
  } catch (error) {
    if (error instanceof ShopUnavailableError) return Response.json({ error: error.message }, { status: 403, headers: privateHeaders });
    if (error instanceof QuotaError) return Response.json({ error: error.message },
      { status: 429, headers: { ...privateHeaders, "Retry-After": "3600" } });
    console.error("Leather Vision job reservation failed");
    return Response.json({ error: "Generation is temporarily unavailable." }, { status: 503, headers: privateHeaders });
  }
  try {
    await mkdir(generationDir(generationId), { recursive: true });
    if (image) {
      const png = await processReferenceImage(Buffer.from(await image.arrayBuffer()));
      await writeFile(generationFilePath(generationId, UPLOAD_FILENAME), png);
    }
    await enqueueJob(generationId);
    trace("queued");
  } catch {
    await failUpload(generationId);
    await rm(generationDir(generationId), { recursive: true, force: true }).catch(() => {});
    return Response.json({ error: "The upload could not be processed. Please use a valid PNG, JPG, or WebP image." },
      { status: 400, headers: privateHeaders });
  }
  startWorker();
  return Response.json({ generationId, token, status: "pending",
    pollUrl: prefix + "/generations/" + generationId }, { status: 202, headers: privateHeaders });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateProxy(request);
  return Response.json({ error: "Use POST to start a generation" }, { status: 405, headers: privateHeaders });
};
