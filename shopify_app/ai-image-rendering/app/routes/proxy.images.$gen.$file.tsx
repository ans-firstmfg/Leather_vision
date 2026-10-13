import type { LoaderFunctionArgs } from "react-router";
import { readFile } from "node:fs/promises";
import { getOwnedJob } from "../services/jobs.server";
import { generationFilePath } from "../services/generate.server";
import { authenticateProxy, requestToken, privateHeaders } from "../services/proxy.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const owner = await authenticateProxy(request);
  const gen = params.gen, file = params.file;
  if (!gen || !file || !/^variation-[1-4]\.png$/.test(file)) return new Response("Not found", { status: 404 });
  const job = await getOwnedJob(gen, owner, requestToken(request));
  if (!job || job.status !== "ready" || !job.variations.some((v) => v.filename === file)) {
    return new Response("Not found", { status: 404, headers: privateHeaders });
  }
  try {
    return new Response(new Uint8Array(await readFile(generationFilePath(gen, file))), {
      headers: { ...privateHeaders, "Content-Type": "image/png", "X-Content-Type-Options": "nosniff" },
    });
  } catch { return new Response("Not found", { status: 404, headers: privateHeaders }); }
};
