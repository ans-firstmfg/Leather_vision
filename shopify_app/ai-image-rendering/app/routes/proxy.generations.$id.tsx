import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getOwnedJob, saveSelection } from "../services/jobs.server";
import { authenticateProxy, requestToken, proxyPath, privateHeaders, requireStorefrontAction } from "../services/proxy.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const owner = await authenticateProxy(request);
  const token = requestToken(request);
  const job = params.id && await getOwnedJob(params.id, owner, token);
  if (!job) return Response.json({ error: "Generation not found" }, { status: 404, headers: privateHeaders });
  const prefix = proxyPath(request);
  return Response.json({ generationId: job.id, status: job.status, error: job.error,
    demo: job.options.provider === "mock",
    expiresAt: job.expiresAt, selectedVariation: job.selectedVariation,
    variations: job.variations.map((v) => ({ ...v,
      url: prefix + "/images/" + job.id + "/" + v.filename,
    })) }, { headers: privateHeaders });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const owner = await authenticateProxy(request);
  requireStorefrontAction(request);
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: privateHeaders });
  const job = params.id && await getOwnedJob(params.id, owner, requestToken(request));
  if (!job) return Response.json({ error: "Generation not found" }, { status: 404, headers: privateHeaders });
  if (Number(request.headers.get("content-length")) > 1024) return Response.json({ error: "Request too large" }, { status: 413, headers: privateHeaders });
  // Selection bodies are small; bound the stream even when Content-Length is absent.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Missing selection" }, { status: 400, headers: privateHeaders });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024) { await reader.cancel(); return Response.json({ error: "Request too large" }, { status: 413, headers: privateHeaders }); }
    chunks.push(value);
  }
  let variationId: unknown;
  try { ({ variationId } = JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch { return Response.json({ error: "Invalid selection" }, { status: 400, headers: privateHeaders }); }
  const properties = typeof variationId === "string" && await saveSelection(job, variationId);
  if (!properties) return Response.json({ error: "Design is not available" }, { status: 400, headers: privateHeaders });
  return Response.json({ properties }, { headers: privateHeaders });
};
