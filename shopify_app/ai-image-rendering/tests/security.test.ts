import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import db from "../app/db.server";
import { createJob, getJob, getOwnedJob, enqueueJob, claimJob, completeJob, QuotaError, saveSelection } from "../app/services/jobs.server";
import { readGenerationForm, MAX_REQUEST_BYTES, processReferenceImage, parseGenerationFormData } from "../app/services/upload.server";
import { normalizeGeneratedImage, generationDir, generationFilePath, runGeneration, removeGenerations } from "../app/services/generate.server";
import { maintainJobs, stopWorker } from "../app/services/worker.server";
import { validateProviderConfiguration, getImageEditProvider } from "../app/services/ai/index.server";
import { OpenAIError } from "../app/services/ai/openai.server";
import { CloudflareImageError } from "../app/services/ai/cloudflare.server";
import { buildEditPrompt } from "../app/services/promptBuilder.server";
import { authenticate } from "../app/shopify.server";
import { authenticateProxy, clientAddress, requireStorefrontAction, proxyPath } from "../app/services/proxy.server";
import { action as uninstalled } from "../app/routes/webhooks.app.uninstalled";
import { action as compliance } from "../app/routes/webhooks.compliance";
import { loader as statusLoader, action as selectionAction } from "../app/routes/proxy.generations.$id";
import { loader as imageLoader } from "../app/routes/proxy.images.$gen.$file";
import { action as startGeneration } from "../app/routes/proxy.generations";
import { action as saveClientResult } from "../app/routes/proxy.generations.$id.result";
import { loader as providerConfig } from "../app/routes/proxy.config";
import { puterConfiguration, cloudflareConfiguration } from "../app/services/ai/config.server";
import catalogue from "../catalog/leathers.json";
import { isLeather, leatherLabel } from "../app/services/materials.server";

const owner = { shop: "test.myshopify.com", customerId: null, actorHash: "visitor" };
const options = { variationCount: 2 };

test("supplied leather categories are accepted and described in generation prompts", async () => {
  for (const [slug, label] of [
    ["atlas-full-grain", "Atlas full-grain leather"],
    ["buffalo-pebble", "Buffalo pebble leather"],
    ["sassari-embossed", "Sassari embossed leather"],
    ["stardust-glitter-cow", "Stardust glitter cow leather"],
    ["tennessee-italian", "Tennessee Italian leather"],
  ]) {
    const form = new FormData();
    form.set("leather", slug); form.set("color", "Red"); form.set("productType", "other");
    const parsed = await parseGenerationFormData(form);
    assert.equal(parsed.ok, true);
    assert.ok(buildEditPrompt({ ...parsed.data, hasReferenceImage: false }, 0).includes(label));
  }
});
let png: Buffer;

test("every imported leather has a valid local thumbnail and can be submitted for generation", async () => {
  assert.equal(catalogue.groups.length, 7);
  assert.equal(catalogue.articles.length, 165);
  assert.equal(new Set(catalogue.articles.map((article) => article.slug)).size, 165);
  for (const article of catalogue.articles) {
    assert.equal(isLeather(article.slug), true, article.slug);
    assert.ok(article.groups.every((group) => catalogue.groups.includes(group)));
    const form = new FormData();
    form.set("leather", article.slug); form.set("color", "Red");
    const parsed = await parseGenerationFormData(form);
    assert.equal(parsed.ok, true, article.slug);
    if (parsed.ok) assert.ok(buildEditPrompt({ ...parsed.data, hasReferenceImage: false }, 0).includes(leatherLabel(article.slug)!));
    const metadata = await sharp(`extensions/leather-vision/assets/lv-catalog-${article.slug}.jpg`).metadata();
    assert.equal(metadata.width, 240); assert.equal(metadata.height, 240);
    assert.equal(metadata.format, "jpeg");
  }
  assert.equal(isLeather("not-a-catalogue-leather"), false);
});

function clientArgs(id: string, token: string, form: FormData, shop = owner.shop) {
  const url = new URL(request(id, token, shop).url);
  url.pathname += "/result";
  const resultRequest = new Request(url, {
    method: "POST", headers: { Authorization: "Bearer " + token, "X-Leather-Vision": "1" }, body: form,
  });
  return { request: resultRequest, params: { id }, context: {}, url, pattern: "/proxy/generations/:id/result" };
}

function clientImage(variationId = "v1") {
  const form = new FormData();
  form.set("variationId", variationId);
  form.set("image", new File([new Uint8Array(png)], "result.png", { type: "image/png" }));
  return form;
}

test("Puter configuration needs no API key and rejects unsupported model/size combinations", () => {
  const saved = { model: process.env.PUTER_IMAGE_MODEL, quality: process.env.PUTER_IMAGE_QUALITY, mode: process.env.IMAGE_PROVIDER, test: process.env.PUTER_TEST_MODE };
  try {
    process.env.IMAGE_PROVIDER = "puter";
    delete process.env.PUTER_IMAGE_MODEL; delete process.env.PUTER_IMAGE_QUALITY; delete process.env.PUTER_TEST_MODE;
    assert.doesNotThrow(validateProviderConfiguration);
    assert.deepEqual(puterConfiguration(), { model: "gemini-3.1-flash-image", quality: "512", testMode: false });
    assert.throws(() => getImageEditProvider(), /customer's browser/);
    process.env.PUTER_IMAGE_MODEL = "gemini-3.1-flash-lite-image";
    assert.throws(puterConfiguration, /Unsupported/);
    process.env.PUTER_IMAGE_QUALITY = "1K";
    assert.equal(puterConfiguration().quality, "1K");
    process.env.PUTER_TEST_MODE = "maybe";
    assert.throws(puterConfiguration, /true or false/);
  } finally {
    for (const [name, value] of Object.entries({ PUTER_IMAGE_MODEL: saved.model, PUTER_IMAGE_QUALITY: saved.quality, IMAGE_PROVIDER: saved.mode, PUTER_TEST_MODE: saved.test })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test("Puter reservation, protected result uploads and cart selection work without a server AI call", async () => {
  const mode = process.env.IMAGE_PROVIDER, originalFetch = globalThis.fetch;
  const ids: string[] = [];
  globalThis.fetch = async () => { throw new Error("Backend must never call Puter or fetch result URLs"); };
  try {
    process.env.IMAGE_PROVIDER = "puter";
    const configReq = request(randomUUID(), "");
    const config = await (await providerConfig({ request: configReq, params: {}, context: {}, url: new URL(configReq.url), pattern: "/proxy/config" })).json();
    assert.equal(config.provider, "puter");
    assert.equal(config.puter.quality, "512");
    assert.ok(!JSON.stringify(config).includes("API_KEY"));
    for (const reference of [false, true]) {
      const form = new FormData(); form.set("productType", "jacket"); form.set("leather", "suede"); form.set("color", "Brown"); form.set("variationCount", "2");
      if (reference) form.set("image", new File([new Uint8Array(png)], "sample.png", { type: "image/png" }));
      const req = new Request(configReq.url, { method: "POST", headers: { "X-Leather-Vision": "1" }, body: form });
      const response = await startGeneration({ request: req, params: {}, context: {}, url: new URL(req.url), pattern: "/proxy/generations" });
      assert.equal(response.status, 202);
      const result = await response.json(); const id = result.generationId; ids.push(id);
      assert.equal(result.status, "awaiting_client");
      assert.equal(Boolean(result.clientGeneration.referenceImage), reference);
      assert.equal(result.clientGeneration.prompts.length, 2);
      assert.equal(result.clientGeneration.model, "gemini-3.1-flash-image");
      assert.equal((await getJob(id))!.options.hasReferenceImage, reference);
      assert.equal(await claimJob("must-not-claim-puter"), undefined);
      assert.equal((await saveClientResult(clientArgs(id, "wrong", clientImage()))).status, 404);
      assert.equal((await saveClientResult(clientArgs(id, result.token, clientImage(), "other.myshopify.com"))).status, 404);
      assert.equal((await saveClientResult(clientArgs(id, result.token, clientImage("v2")))).status, 409);
      const arbitraryUrl = new FormData(); arbitraryUrl.set("variationId", "v1"); arbitraryUrl.set("image", "http://127.0.0.1/private");
      assert.equal((await saveClientResult(clientArgs(id, result.token, arbitraryUrl))).status, 400);
      const corrupt = new FormData(); corrupt.set("variationId", "v1"); corrupt.set("image", new File(["not an image"], "result.png"));
      assert.equal((await saveClientResult(clientArgs(id, result.token, corrupt))).status, 400);
      assert.equal((await saveClientResult(clientArgs(id, result.token, clientImage()))).status, 200);
      assert.equal((await getJob(id))!.status, "awaiting_client");
      const statusReq = request(id, result.token);
      const statusArgs = { request: statusReq, params: { id }, context: {}, url: new URL(statusReq.url), pattern: "/proxy/generations/:id" };
      assert.deepEqual((await (await statusLoader(statusArgs)).json()).variations, []);
      assert.equal((await saveClientResult(clientArgs(id, result.token, clientImage()))).status, 200);
      assert.equal((await getJob(id))!.variations.length, 1);
      assert.equal((await saveClientResult(clientArgs(id, result.token, clientImage("v2")))).status, 200);
      const job = (await getJob(id))!;
      assert.equal(job.status, "ready");
      const status = await (await statusLoader(statusArgs)).json();
      assert.equal(status.variations.length, 2);
      assert.equal(status.demo, false);
      assert.ok(!JSON.stringify(status).includes(result.token));
      const properties = await saveSelection(job, "v2");
      assert.equal(properties?.["Design source"], "Puter - customer supplied");
      assert.equal(properties?._leather_vision_variation, "v2");
      assert.equal((await sharp(await readFile(generationFilePath(id, "variation-2.png"))).metadata()).format, "png");
      assert.equal((await saveClientResult(clientArgs(id, result.token, clientImage("v3")))).status, 409);
      const cancel = new FormData(); cancel.set("action", "cancel");
      await saveClientResult(clientArgs(id, result.token, cancel));
      assert.equal((await getJob(id))!.status, "ready");
      await removeGenerations({ id });
    }
  } finally {
    globalThis.fetch = originalFetch; process.env.IMAGE_PROVIDER = mode;
    for (const id of ids) await removeGenerations({ id });
  }
});

test("Puter jobs count against active quotas, expire without replay, and label SDK test samples", async () => {
  const mode = process.env.IMAGE_PROVIDER, active = process.env.GENERATION_ACTIVE_PER_SHOP, testMode = process.env.PUTER_TEST_MODE;
  const ids: string[] = [];
  try {
    process.env.IMAGE_PROVIDER = "puter"; process.env.GENERATION_ACTIVE_PER_SHOP = "1"; process.env.PUTER_TEST_MODE = "true";
    const id = randomUUID(); ids.push(id);
    const { token } = await createJob(id, owner, { variationCount: 1, productType: "bag" });
    await enqueueJob(id, true);
    await assert.rejects(createJob(randomUUID(), owner, options), QuotaError);
    await saveClientResult(clientArgs(id, token, clientImage()));
    const job = (await getJob(id))!;
    assert.equal((await saveSelection(job, "v1"))?.["Design mode"], "Demo - AI editing disabled");
    const waitingId = randomUUID(); ids.push(waitingId);
    await createJob(waitingId, owner, { variationCount: 1 }); await enqueueJob(waitingId, true);
    await db.generation.update({ where: { id: waitingId }, data: { updatedAt: new Date(Date.now() - 31 * 60000) } });
    await maintainJobs();
    assert.equal((await getJob(waitingId))!.status, "failed");
    const receivingId = randomUUID(); ids.push(receivingId);
    await createJob(receivingId, owner, { variationCount: 1 });
    await db.generation.update({ where: { id: receivingId }, data: { status: "receiving_client", workerId: "expired-upload", leaseUntil: new Date(Date.now() - 1000) } });
    await maintainJobs();
    assert.equal((await getJob(receivingId))!.status, "failed");
  } finally {
    process.env.IMAGE_PROVIDER = mode;
    if (active === undefined) delete process.env.GENERATION_ACTIVE_PER_SHOP; else process.env.GENERATION_ACTIVE_PER_SHOP = active;
    if (testMode === undefined) delete process.env.PUTER_TEST_MODE; else process.env.PUTER_TEST_MODE = testMode;
    for (const id of ids) await removeGenerations({ id });
  }
});

before(async () => {
  for (const file of ["prisma/migrations/20240530213853_create_session_table/migration.sql", "prisma/migrations/20261009000000_generation_queue/migration.sql"]) {
    const sql = await readFile(file, "utf8");
    for (const statement of sql.split(";").filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
  }
  png = await sharp({ create: { width: 40, height: 20, channels: 3, background: "brown" } }).png().toBuffer();
  await db.session.create({ data: { id: "offline_test", shop: owner.shop, state: "test", accessToken: "test-only" } });
  authenticate.public.appProxy = async (request: Request) => ({
    session: { shop: new URL(request.url).searchParams.get("shop") },
  }) as Awaited<ReturnType<typeof authenticate.public.appProxy>>;
});
after(async () => { stopWorker(); await db.$disconnect(); });

function request(id: string, token: string, shop = owner.shop) {
  return new Request("https://test.example/proxy/generations/" + id + "?shop=" + shop + "&path_prefix=/apps/custom-design",
    { headers: { Authorization: "Bearer " + token } });
}

test("proxy requires an installed shop and protects storefront actions", async () => {
  assert.throws(() => requireStorefrontAction(new Request("https://test.example")), (e) => e instanceof Response && e.status === 403);
  const original = authenticate.public.appProxy;
  authenticate.public.appProxy = async () => ({ session: undefined }) as Awaited<ReturnType<typeof original>>;
  await assert.rejects(authenticateProxy(request(randomUUID(), "")), (e) => e instanceof Response && e.status === 403);
  authenticate.public.appProxy = original;
  assert.equal(proxyPath(request(randomUUID(), "")), "/apps/custom-design");
});

test("Shopify session refresh failures return useful JSON and signature failures stay rejected", async () => {
  const original = authenticate.public.appProxy;
  try {
    authenticate.public.appProxy = async () => { throw new Response(null, { status: 500 }); };
    const error: unknown = await authenticateProxy(request(randomUUID(), "")).catch((failure: unknown) => failure);
    assert.ok(error instanceof Response);
    assert.equal(error.status, 503);
    assert.match((await error.json()).error, /store connection/);
    authenticate.public.appProxy = async () => { throw new Response(null, { status: 400 }); };
    await assert.rejects(authenticateProxy(request(randomUUID(), "")), (error) => error instanceof Response && error.status === 400);
  } finally { authenticate.public.appProxy = original; }
});

test("upload stream is bounded without Content-Length", async () => {
  let cancelled = false;
  const req = new Request("https://test.example", {
    method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES + 1)); },
      cancel() { cancelled = true; } }), duplex: "half",
  } as RequestInit);
  await assert.rejects(readGenerationForm(req), (e: Error & { status?: number }) => e.status === 413);
  assert.equal(cancelled, true);
});

test("invalid file type and variation counts are rejected", async () => {
  const form = new FormData();
  form.set("image", new File([new Uint8Array(png)], "test.png", { type: "image/png" }));
  form.set("variationCount", "99");
  assert.equal((await parseGenerationFormData(form)).ok, false);
  form.set("variationCount", "2");
  assert.equal((await parseGenerationFormData(form)).ok, true);
  form.set("image", new File(["abc"], "test.png", { type: "text/plain" }));
  assert.equal((await parseGenerationFormData(form)).ok, false);
});

test("reference images are optional but empty designs and invalid supplied files are rejected", async () => {
  const form = new FormData();
  assert.equal((await parseGenerationFormData(form)).ok, false);
  form.set("productType", "jacket");
  let parsed = await parseGenerationFormData(form);
  assert.ok(parsed.ok);
  assert.equal(parsed.data.image, undefined);
  form.set("image", new File([], ""));
  parsed = await parseGenerationFormData(form);
  assert.ok(parsed.ok);
  assert.equal(parsed.data.image, undefined);
  form.set("image", new File([], "empty.png", { type: "image/png" }));
  assert.equal((await parseGenerationFormData(form)).ok, false);
  form.set("image", "not-a-file");
  assert.equal((await parseGenerationFormData(form)).ok, false);
  form.delete("image");
  form.delete("productType");
  form.set("instructions", "A small suede travel bag with brass buckles");
  assert.equal((await parseGenerationFormData(form)).ok, true);
  form.delete("instructions");
  form.set("leather", "atlas-full-grain");
  assert.equal((await parseGenerationFormData(form)).ok, false);
  form.set("color", "Red");
  const choicesOnly = await parseGenerationFormData(form);
  assert.ok(choicesOnly.ok);
  assert.equal(choicesOnly.data.productType, undefined);
  form.set("instructions", "Make a jacket with brass buttons");
  const fromNotes = await parseGenerationFormData(form);
  assert.ok(fromNotes.ok);
  assert.match(buildEditPrompt({ ...fromNotes.data, hasReferenceImage: false }, 0), /Make a jacket with brass buttons/);
});

test("prompts create from specifications without a reference and preserve uploaded designs otherwise", () => {
  const details = { variationCount: 1, productType: "jacket", leather: "suede", color: "Brown", instructions: "Add brass buttons" };
  const generated = buildEditPrompt({ ...details, hasReferenceImage: false }, 0);
  assert.match(generated, /Create a photorealistic catalog photo/);
  assert.match(generated, /Brown/);
  assert.match(generated, /Add brass buttons/);
  assert.doesNotMatch(generated, /uploaded|this reference|Preserve the exact silhouette/);
  assert.match(buildEditPrompt(details, 0), /Preserve the exact silhouette/);
});

test("pasted or extensionless images are accepted only when what is present identifies an allowed image", async () => {
  const accepts = async (name: string, type: string) => {
    const form = new FormData();
    form.set("image", new File([new Uint8Array(png)], name, { type }));
    return (await parseGenerationFormData(form)).ok;
  };
  assert.equal(await accepts("image", "image/png"), true);
  assert.equal(await accepts("photo.JFIF", "image/jpeg"), true);
  assert.equal(await accepts("photo.jpg", ""), true);
  assert.equal(await accepts("photo.jpg", "application/octet-stream"), true);
  assert.equal(await accepts("image", "application/octet-stream"), false);
  assert.equal(await accepts("image", ""), false);
  assert.equal(await accepts("photo.heic", "image/heic"), false);
  assert.equal(await accepts("photo.png", "image/heic"), false);
  assert.equal(await accepts("script.svg", "image/png"), false);
});

test("corrupt reference and provider images never become valid PNGs", async () => {
  await assert.rejects(processReferenceImage(Buffer.from("not an image")));
  await assert.rejects(normalizeGeneratedImage(Buffer.from("provider returned garbage")));
  const result = await processReferenceImage(png);
  assert.equal((await sharp(result).metadata()).format, "png");
});

test("ownership requires the correct shop, customer and capability", async () => {
  const id = randomUUID();
  const { token } = await createJob(id, owner, options);
  assert.ok(await getOwnedJob(id, owner, token));
  assert.equal(await getOwnedJob(id, { ...owner, shop: "other.myshopify.com" }, token), undefined);
  assert.equal(await getOwnedJob(id, { ...owner, customerId: "42" }, token), undefined);
  assert.equal(await getOwnedJob(id, owner, "f".repeat(64)), undefined);
  assert.equal(await getOwnedJob(id, owner, ""), undefined);
  await db.generation.delete({ where: { id } });
});

test("daily quotas and active reservations cannot be bypassed", async () => {
  process.env.GENERATION_DAILY_IMAGES_PER_ACTOR = "2";
  const id = randomUUID();
  await createJob(id, owner, options);
  await assert.rejects(createJob(randomUUID(), owner, options), QuotaError);
  delete process.env.GENERATION_DAILY_IMAGES_PER_ACTOR;
  process.env.GENERATION_ACTIVE_PER_SHOP = "1";
  await assert.rejects(createJob(randomUUID(), { ...owner, actorHash: "new-visitor" }, options), QuotaError);
  delete process.env.GENERATION_ACTIVE_PER_SHOP;
  await db.generation.delete({ where: { id } });
});

test("persisted jobs survive a new Prisma connection and only one worker can claim them", async () => {
  const id = randomUUID();
  await createJob(id, owner, options);
  await enqueueJob(id);
  await db.$disconnect();
  assert.equal((await getJob(id))?.status, "pending");
  const first = await claimJob("worker-one"), second = await claimJob("worker-two");
  assert.equal(first?.id, id);
  assert.equal(second, undefined);
  await db.generation.delete({ where: { id } });
});

test("worker claims respect the global provider concurrency limit", async () => {
  process.env.GENERATION_CONCURRENCY = "1";
  const firstId = randomUUID(), secondId = randomUUID();
  try {
    await createJob(firstId, owner, options); await enqueueJob(firstId);
    await createJob(secondId, owner, options); await enqueueJob(secondId);
    const first = await claimJob("worker-one");
    assert.ok(first);
    assert.equal(await claimJob("worker-two"), undefined);
    await completeJob(first.id, "worker-one", [{ id: "v1", filename: "variation-1.png" }]);
    assert.ok(await claimJob("worker-two"));
  } finally {
    delete process.env.GENERATION_CONCURRENCY;
    await db.generation.deleteMany({ where: { id: { in: [firstId, secondId] } } });
  }
});

test("status and image routes hide foreign jobs and honor custom proxy paths", async () => {
  const id = randomUUID();
  const { token } = await createJob(id, owner, options);
  await enqueueJob(id); await claimJob("worker");
  await completeJob(id, "worker", [{ id: "v1", filename: "variation-1.png" }]);
  await mkdir(generationDir(id), { recursive: true });
  await writeFile(generationFilePath(id, "variation-1.png"), png);
  const args = { request: request(id, token), params: { id }, context: {}, url: new URL(request(id, token).url), pattern: "/proxy/generations/:id" };
  const status = await statusLoader(args);
  const body = await status.json();
  assert.ok(body.variations[0].url.startsWith("/apps/custom-design/images/"));
  assert.ok(!JSON.stringify(body).includes(token), "status responses never put the token in image URLs");
  assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal((await statusLoader({ ...args, request: request(id, token, "other.myshopify.com") })).status, 404);
  const imageArgs = { ...args, params: { gen: id, file: "variation-1.png" } };
  assert.equal((await imageLoader(imageArgs)).status, 200);
  assert.equal((await imageLoader({ ...imageArgs, request: request(id, "") })).status, 404);
  assert.equal((await imageLoader({ ...imageArgs, params: { gen: id, file: "../upload.png" } })).status, 404);
  const queryToken = new Request(request(id, "").url + "&token=" + token);
  assert.equal((await imageLoader({ ...imageArgs, request: queryToken })).status, 404, "URL tokens are not accepted");
  await db.generation.delete({ where: { id } });
});

test("only ready variations produce cart properties and secrets are never attached", async () => {
  const id = randomUUID();
  const { token } = await createJob(id, owner, options);
  assert.equal(await saveSelection((await getJob(id))!, "v1"), undefined);
  await enqueueJob(id); await claimJob("worker");
  await completeJob(id, "worker", [{ id: "v1", filename: "variation-1.png" }]);
  const res = await selectionAction({ request: new Request(request(id, token), { method: "POST",
    headers: { Authorization: "Bearer " + token, "X-Leather-Vision": "1", "Content-Type": "application/json" },
    body: JSON.stringify({ variationId: "v1" }) }), params: { id }, context: {}, url: new URL(request(id, token).url), pattern: "/proxy/generations/:id" });
  const result = await res.json();
  assert.equal(result.properties._leather_vision_generation, id);
  assert.equal(result.properties._leather_vision_variation, "v1");
  assert.ok(!JSON.stringify(result).includes(token));
  assert.equal((await getJob(id))?.selectedVariation, "v1");
  await db.generation.delete({ where: { id } });
});

test("invalid provider output fails the job with a safe error", async () => {
  process.env.OPENAI_API_KEY = "test-only";
  const id = randomUUID();
  await createJob(id, owner, { variationCount: 1 }); await enqueueJob(id);
  const job = (await claimJob("worker"))!;
  await mkdir(generationDir(id), { recursive: true });
  await writeFile(generationFilePath(id, "upload.png"), png);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: [{ b64_json: Buffer.from("bad image").toString("base64") }] });
  try { await runGeneration(job, "worker"); } finally { globalThis.fetch = originalFetch; }
  const failed = (await getJob(id))!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "Generation failed. Please try again later.");
  assert.deepEqual(failed.variations, []);
  await db.generation.delete({ where: { id } });
});

test("worker recovery fails interrupted paid requests instead of charging again", async () => {
  const id = randomUUID();
  await createJob(id, owner, options); await enqueueJob(id); await claimJob("dead-worker");
  await db.generation.update({ where: { id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
  await maintainJobs();
  assert.equal((await getJob(id))?.status, "failed");
  await db.generation.delete({ where: { id } });
});

test("expired designs are inaccessible and cleaned without touching retained designs", async () => {
  const id = randomUUID(), keptId = randomUUID();
  const { token } = await createJob(id, owner, options);
  await createJob(keptId, owner, options);
  await db.generation.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await getOwnedJob(id, owner, token), undefined);
  await maintainJobs();
  assert.equal(await getJob(id), undefined);
  assert.ok(await getJob(keptId));
  await db.generation.delete({ where: { id: keptId } });
});

test("OpenAI configuration requires an API key", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  try {
    delete process.env.OPENAI_API_KEY;
    assert.throws(validateProviderConfiguration, /OPENAI_API_KEY is required/);
    process.env.OPENAI_API_KEY = "test-only";
    assert.doesNotThrow(validateProviderConfiguration);
  } finally { process.env.OPENAI_API_KEY = originalKey; }
});

test("mock mode needs no key, rejects production and unknown providers", () => {
  const key = process.env.OPENAI_API_KEY, mode = process.env.IMAGE_PROVIDER, nodeEnv = process.env.NODE_ENV;
  try {
    delete process.env.OPENAI_API_KEY;
    process.env.IMAGE_PROVIDER = "mock";
    assert.doesNotThrow(validateProviderConfiguration);
    assert.equal(getImageEditProvider().id, "mock");
    process.env.NODE_ENV = "production";
    assert.throws(() => getImageEditProvider(), /development only/);
    process.env.NODE_ENV = "test";
    process.env.IMAGE_PROVIDER = "invalid";
    assert.throws(() => getImageEditProvider(), /must be openai, mock, puter or cloudflare/);
  } finally {
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
    process.env.IMAGE_PROVIDER = mode;
    process.env.NODE_ENV = nodeEnv;
  }
});

test("queued mock edits produce private previews and demo cart properties without network calls", async () => {
  const id = randomUUID(), originalFetch = globalThis.fetch;
  const mode = process.env.IMAGE_PROVIDER, key = process.env.OPENAI_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Network must not be used by mock edits"); };
  try {
    process.env.IMAGE_PROVIDER = "mock";
    delete process.env.OPENAI_API_KEY;
    const { token } = await createJob(id, owner, { variationCount: 2, instructions: "Make it blue" });
    await mkdir(generationDir(id), { recursive: true });
    await writeFile(generationFilePath(id, "upload.png"), png);
    await enqueueJob(id);
    process.env.IMAGE_PROVIDER = "openai";
    const job = (await claimJob("mock-worker"))!;
    assert.equal(job.options.provider, "mock");
    await runGeneration(job, "mock-worker");
    const ready = (await getJob(id))!;
    assert.equal(ready.status, "ready");
    assert.equal(ready.variations.length, 2);
    const first = await readFile(generationFilePath(id, "variation-1.png"));
    const second = await readFile(generationFilePath(id, "variation-2.png"));
    assert.equal((await sharp(first).metadata()).width, 1024);
    assert.notDeepEqual(first, second);
    const args = { request: request(id, token), params: { id }, context: {}, url: new URL(request(id, token).url), pattern: "/proxy/generations/:id" };
    const status = await (await statusLoader(args)).json();
    assert.equal(status.demo, true);
    assert.ok(!JSON.stringify(status).includes(token));
    assert.equal((await imageLoader({ ...args, params: { gen: id, file: "variation-1.png" } })).status, 200);
    assert.equal((await imageLoader({ ...args, request: request(id, ""), params: { gen: id, file: "variation-1.png" } })).status, 404);
    const cart = await saveSelection(ready, "v2");
    assert.equal(cart?.["Design mode"], "Demo - AI editing disabled");
    assert.equal(cart?._leather_vision_variation, "v2");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.IMAGE_PROVIDER = mode;
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
    await removeGenerations({ id });
  }
});

test("OpenAI sends the uploaded image and modification prompt to the edits API", async () => {
  process.env.OPENAI_API_KEY = "test-only";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.ok(init?.body instanceof FormData);
    assert.equal(init.body.get("prompt"), "Make the leather brown");
    assert.equal(init.body.get("n"), "1");
    const image = init.body.get("image");
    assert.ok(image instanceof File);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    return Response.json({ data: [{ b64_json: png.toString("base64") }] });
  };
  try {
    const provider = getImageEditProvider();
    assert.equal(provider.id, "openai");
    const result = await provider.editImage({ imagePng: png, prompt: "Make the leather brown" });
    assert.deepEqual(result.bytes, png);
  } finally { globalThis.fetch = originalFetch; }
});

test("no-reference OpenAI requests use the generations API with JSON rather than an empty edit", async () => {
  process.env.OPENAI_API_KEY = "test-only";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/images/generations");
    assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
    const body = JSON.parse(init?.body as string);
    assert.equal(body.prompt, "Create a brown leather jacket");
    assert.equal(body.size, "1024x1024");
    assert.equal(body.image, undefined);
    assert.equal(body.input_fidelity, undefined);
    return Response.json({ data: [{ b64_json: png.toString("base64") }] });
  };
  try {
    const result = await getImageEditProvider().editImage({ prompt: "Create a brown leather jacket" });
    assert.deepEqual(result.bytes, png);
  } finally { globalThis.fetch = originalFetch; }
});

test("no-reference jobs finish with private mock placeholders without any uploaded file or API call", async () => {
  const id = randomUUID(), originalFetch = globalThis.fetch, mode = process.env.IMAGE_PROVIDER;
  globalThis.fetch = async () => { throw new Error("Mock mode must not use the network"); };
  try {
    process.env.IMAGE_PROVIDER = "mock";
    const { token } = await createJob(id, owner, {
      variationCount: 1, productType: "jacket", leather: "suede", color: "Brown", hasReferenceImage: false,
    });
    await enqueueJob(id);
    const job = (await claimJob("no-reference-worker"))!;
    assert.equal(job.id, id);
    await runGeneration(job, "no-reference-worker");
    const ready = (await getJob(id))!;
    assert.equal(ready.status, "ready");
    await assert.rejects(readFile(generationFilePath(id, "upload.png")), { code: "ENOENT" });
    assert.equal((await sharp(await readFile(generationFilePath(id, "variation-1.png"))).metadata()).format, "png");
    const req = request(id, token);
    const args = { request: req, params: { gen: id, file: "variation-1.png" }, context: {}, url: new URL(req.url), pattern: "/proxy/images/:gen/:file" };
    assert.equal((await imageLoader(args)).status, 200);
    assert.equal((await saveSelection(ready, "v1"))?.["Design mode"], "Demo - AI editing disabled");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.IMAGE_PROVIDER = mode;
    await removeGenerations({ id });
  }
});

test("OpenAI 429 responses are retried up to 3 times before failing", async () => {
  process.env.OPENAI_API_KEY = "test-only";
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls < 3) return new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), {
      status: 429, headers: { "retry-after": "0" },
    });
    return Response.json({ data: [{ b64_json: png.toString("base64") }] });
  };
  try {
    const provider = getImageEditProvider();
    const result = await provider.editImage({ imagePng: png, prompt: "test" });
    assert.deepEqual(result.bytes, png);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenAI 429 exhausted retries surface the error", async () => {
  process.env.OPENAI_API_KEY = "test-only";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "Rate limit exceeded" } }), {
    status: 429, headers: { "retry-after": "0" },
  });
  try {
    await assert.rejects(
      getImageEditProvider().editImage({ imagePng: png, prompt: "test" }),
      /OpenAI 429/,
    );
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenAI credit exhaustion fails once with safe structured diagnostics", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: { code: "credit_balance_exhausted", type: "insufficient_quota",
      message: "Private prompt and sk-secret-must-not-be-logged" } },
    { status: 429, headers: { "x-request-id": "req_test123" } });
  };
  try {
    await assert.rejects(getImageEditProvider().editImage({ imagePng: png, prompt: "test" }), (error: unknown) => {
      assert.ok(error instanceof OpenAIError);
      assert.equal(error.status, 429);
      assert.equal(error.code, "credit_balance_exhausted");
      assert.equal(error.requestId, "req_test123");
      assert.equal(error.billingBlocked, true);
      assert.ok(!error.message.includes("Private prompt"));
      assert.ok(!JSON.stringify(error).includes("sk-secret"));
      return true;
    });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("concurrent reservations neither fail on SQLite locks nor exceed the active limit", async () => {
  const shop = "race.myshopify.com";
  await db.session.create({ data: { id: "offline_race", shop, state: "test", accessToken: "test-only" } });
  process.env.GENERATION_ACTIVE_PER_SHOP = "5";
  try {
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) =>
      createJob(randomUUID(), { shop, customerId: null, actorHash: "racer-" + i }, { variationCount: 1 })));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 5);
    for (const result of results) {
      if (result.status === "rejected") assert.ok(result.reason instanceof QuotaError, String(result.reason));
    }
  } finally {
    delete process.env.GENERATION_ACTIVE_PER_SHOP;
    await db.generation.deleteMany({ where: { shop } });
    await db.session.deleteMany({ where: { shop } });
  }
});

test("guest quotas use the shopper IP that Shopify forwards, not the proxy hop", async () => {
  const guest = (forwardedFor: string) => new Request(request(randomUUID(), "").url, { headers: { "X-Forwarded-For": forwardedFor } });
  assert.equal(clientAddress(guest("203.0.113.5, 198.51.100.1")), "203.0.113.5");
  assert.equal(clientAddress(guest("203.0.113.5")), "203.0.113.5");
  const first = await authenticateProxy(guest("203.0.113.5, 198.51.100.1"));
  const second = await authenticateProxy(guest("203.0.113.6, 198.51.100.1"));
  assert.notEqual(first.actorHash, second.actorHash);
  process.env.TRUSTED_PROXY_HOPS = "0";
  try { assert.equal(clientAddress(guest("203.0.113.5, 198.51.100.1")), "198.51.100.1"); }
  finally { delete process.env.TRUSTED_PROXY_HOPS; }
});

test("corrupt stored JSON does not break job reads", async () => {
  const id = randomUUID();
  await createJob(id, owner, { variationCount: 1 });
  await db.generation.update({ where: { id }, data: { options: "{", variations: "not json" } });
  const job = await getJob(id);
  assert.deepEqual(job?.variations, []);
  assert.equal(job?.options.variationCount, 1);
  await db.generation.delete({ where: { id } });
});

async function readyJobWithImage(shop: string, customerId: string | null) {
  const id = randomUUID();
  await db.generation.create({ data: { id, shop, customerId, actorHash: "a", tokenHash: "0".repeat(64), status: "ready",
    options: "{}", variations: JSON.stringify([{ id: "v1", filename: "variation-1.png" }]), variationCount: 1,
    expiresAt: new Date(Date.now() + 86400000) } });
  await mkdir(generationDir(id), { recursive: true });
  await writeFile(generationFilePath(id, "variation-1.png"), png);
  return id;
}

async function deliverWebhook(handler: (args: never) => Promise<Response>, topic: string, shop: string, payload: object) {
  const original = authenticate.webhook;
  authenticate.webhook = (async () => ({ topic, shop, payload })) as unknown as typeof original;
  try { return await handler({ request: new Request("https://test.example/webhooks", { method: "POST" }) } as never); }
  finally { authenticate.webhook = original; }
}

test("uninstall keeps designs for orders but stops queued paid work", async () => {
  const shop = "uninstall.myshopify.com";
  await db.session.create({ data: { id: "offline_uninstall", shop, state: "test", accessToken: "test-only" } });
  const ready = await readyJobWithImage(shop, null);
  const { job: queued } = await createJob(randomUUID(), { shop, customerId: null, actorHash: "q" }, { variationCount: 1 });
  await enqueueJob(queued.id);
  assert.equal((await deliverWebhook(uninstalled, "APP_UNINSTALLED", shop, {})).status, 200);
  assert.equal(await db.session.count({ where: { shop } }), 0);
  assert.equal((await getJob(ready))?.status, "ready");
  assert.ok(await readFile(generationFilePath(ready, "variation-1.png")));
  assert.equal((await getJob(queued.id))?.status, "failed");
  await removeGenerations({ shop });
});

test("compliance webhooks redact a customer's or a shop's designs and images", async () => {
  const shop = "privacy.myshopify.com";
  await db.session.create({ data: { id: "offline_privacy", shop, state: "test", accessToken: "test-only" } });
  const customerJob = await readyJobWithImage(shop, "42"), otherCustomer = await readyJobWithImage(shop, "43");
  const otherShop = await readyJobWithImage("elsewhere.myshopify.com", "42");
  assert.equal((await deliverWebhook(compliance, "CUSTOMERS_DATA_REQUEST", shop, { customer: { id: 42 } })).status, 200);
  assert.equal((await deliverWebhook(compliance, "CUSTOMERS_REDACT", shop, { customer: { id: 42 } })).status, 200);
  assert.equal(await getJob(customerJob), undefined);
  await assert.rejects(readFile(generationFilePath(customerJob, "variation-1.png")));
  assert.ok(await getJob(otherCustomer));
  assert.ok(await getJob(otherShop));
  assert.equal((await deliverWebhook(compliance, "SHOP_REDACT", shop, {})).status, 200);
  assert.equal(await getJob(otherCustomer), undefined);
  assert.equal(await db.session.count({ where: { shop } }), 0);
  assert.ok(await getJob(otherShop));
  await removeGenerations({ id: otherShop });
});

async function withCloudflare(work: () => Promise<void> | void) {
  const values = { IMAGE_PROVIDER: "cloudflare", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    CLOUDFLARE_API_TOKEN: "test-cloudflare-token", CLOUDFLARE_IMAGE_MODEL: "@cf/black-forest-labs/flux-2-klein-4b",
    CLOUDFLARE_IMAGE_SIZE: "512" };
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, values);
  globalThis.fetch = async () => { throw new Error("Unexpected network request in Cloudflare test"); };
  try { await work(); }
  finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test("Cloudflare validates account access settings and keeps credentials out of storefront config", async () => {
  await withCloudflare(async () => {
    validateProviderConfiguration();
    assert.equal(getImageEditProvider().id, "cloudflare");
    assert.equal(cloudflareConfiguration().size, 512);
    const response = await providerConfig({ request: request(randomUUID(), "") } as never);
    assert.deepEqual(await response.json(), { provider: "cloudflare" });
    process.env.CLOUDFLARE_IMAGE_SIZE = "256";
    assert.equal(cloudflareConfiguration().size, 256);
    process.env.CLOUDFLARE_IMAGE_SIZE = "1024";
    assert.throws(cloudflareConfiguration, /256 or 512/);
    process.env.CLOUDFLARE_IMAGE_SIZE = "512";
    process.env.CLOUDFLARE_IMAGE_MODEL = "https://untrusted.example/model";
    assert.throws(cloudflareConfiguration, /Unsupported/);
    delete process.env.CLOUDFLARE_IMAGE_MODEL;
    process.env.CLOUDFLARE_ACCOUNT_ID = "../other-account";
    assert.throws(cloudflareConfiguration, /account ID/);
    process.env.CLOUDFLARE_ACCOUNT_ID = "a".repeat(32);
    delete process.env.CLOUDFLARE_API_TOKEN;
    assert.throws(cloudflareConfiguration, /API_TOKEN/);
  });
});

test("Cloudflare text generation uses server-authenticated multipart without a reference or automatic retries", async () => {
  await withCloudflare(async () => {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), "https://api.cloudflare.com/client/v4/accounts/" + "a".repeat(32) + "/ai/run/@cf/black-forest-labs/flux-2-klein-4b");
      assert.equal(init?.redirect, "error");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer test-cloudflare-token");
      assert.equal(headers.has("Content-Type"), false, "Fetch must create the multipart boundary");
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get("prompt"), "Make a brown leather wallet");
      assert.equal(init.body.get("width"), "512");
      assert.equal(init.body.get("height"), "512");
      assert.equal(init.body.has("input_image_0"), false);
      assert.equal(init.body.has("steps"), false, "Klein uses fixed inference steps");
      return Response.json({ success: true, result: { image: png.toString("base64") } });
    };
    const output = await getImageEditProvider().editImage({ prompt: "Make a brown leather wallet" });
    assert.deepEqual(output.bytes, png);
    assert.equal(calls, 1);
  });
});

test("Cloudflare edits normalize the uploaded reference below the documented input size", async () => {
  await withCloudflare(async () => {
    const reference = await sharp({ create: { width: 800, height: 600, channels: 3, background: "brown" } }).png().toBuffer();
    globalThis.fetch = async (_url, init) => {
      assert.ok(init?.body instanceof FormData);
      const file = init.body.get("input_image_0");
      assert.ok(file instanceof File);
      assert.equal(file.type, "image/png");
      const metadata = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
      assert.equal(metadata.width, 448);
      assert.equal(metadata.height, 336);
      return Response.json({ success: true, result: { image: png.toString("base64") } });
    };
    await getImageEditProvider().editImage({ prompt: "Change the leather to red", imagePng: reference });
  });
});

test("Cloudflare quota and permission failures expose safe diagnostics and never repeat generation", async () => {
  await withCloudflare(async () => {
    for (const status of [401, 403, 429, 500]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return Response.json({ success: false,
        errors: [{ code: 3040, message: "Secret prompt and test-cloudflare-token" }] }, { status, headers: { "cf-ray": "abcdef1234567890-SIN" } }); };
      await assert.rejects(getImageEditProvider().editImage({ prompt: "Private customer notes" }), (error: unknown) => {
        assert.ok(error instanceof CloudflareImageError);
        assert.equal(error.status, status);
        assert.equal(error.code, 3040);
        assert.equal(error.requestId, "abcdef1234567890-SIN");
        assert.doesNotMatch(error.message + error.publicMessage, /Secret|test-cloudflare-token|Private customer/);
        if (status === 429) assert.match(error.publicMessage, /allowance or rate limit/);
        return true;
      });
      assert.equal(calls, 1);
    }
  });
});

test("Cloudflare rejects missing, corrupt, remote-URL and oversized image responses", async () => {
  await withCloudflare(async () => {
    for (const image of [undefined, "https://untrusted.example/image.png", Buffer.from("not an image").toString("base64")]) {
      globalThis.fetch = async () => Response.json({ success: true, result: { image } });
      await assert.rejects(getImageEditProvider().editImage({ prompt: "Make a wallet" }));
    }
    globalThis.fetch = async () => new Response("<html>Gateway failed</html>", { status: 502 });
    await assert.rejects(getImageEditProvider().editImage({ prompt: "Make a wallet" }), (error: unknown) => error instanceof CloudflareImageError && error.status === 502);
    globalThis.fetch = async () => new Response("too large", { headers: { "content-length": String(31 * 1024 * 1024) } });
    await assert.rejects(getImageEditProvider().editImage({ prompt: "Make a wallet" }), CloudflareImageError);
  });
});

test("Cloudflare respects cancellation before dispatching a request", async () => {
  await withCloudflare(async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({}); };
    const controller = new AbortController(); controller.abort();
    await assert.rejects(getImageEditProvider().editImage({ prompt: "Make a wallet", signal: controller.signal }));
    assert.equal(calls, 0);
  });
});

test("queued Cloudflare jobs retain their provider, save private PNGs and surface quota failures safely", async () => {
  await withCloudflare(async () => {
    const shop = "cloudflare-test.myshopify.com";
    const cfOwner = { ...owner, shop };
    await db.session.create({ data: { id: "offline_cloudflare_test", shop, state: "test", accessToken: "test-only" } });
    try {
      const id = randomUUID();
      const { token } = await createJob(id, cfOwner, { variationCount: 1, instructions: "Make a wallet", hasReferenceImage: false });
      await enqueueJob(id);
      process.env.IMAGE_PROVIDER = "mock";
      let calls = 0;
      globalThis.fetch = async () => { calls++; return Response.json({ success: true, result: { image: png.toString("base64") } }); };
      const job = (await claimJob("cloudflare-worker"))!;
      assert.equal(job.id, id);
      assert.equal(job.options.provider, "cloudflare");
      await runGeneration(job, "cloudflare-worker");
      const saved = (await getOwnedJob(id, cfOwner, token))!;
      assert.equal(saved.status, "ready");
      assert.equal(calls, 1);
      assert.equal((await sharp(await readFile(generationFilePath(id, "variation-1.png"))).metadata()).format, "png");
      assert.equal(await getOwnedJob(id, cfOwner, "0".repeat(64)), undefined);
      const selection = await saveSelection(saved, "v1");
      assert.ok(selection);
      assert.doesNotMatch(JSON.stringify(selection), /test-cloudflare-token|Bearer/);
      process.env.IMAGE_PROVIDER = "cloudflare";
      const failedId = randomUUID();
      await createJob(failedId, cfOwner, { variationCount: 1, instructions: "Make a belt", hasReferenceImage: false });
      await enqueueJob(failedId);
      globalThis.fetch = async () => Response.json({ success: false, errors: [{ code: 3040, message: "Private upstream diagnostic" }] }, { status: 429 });
      const failedJob = (await claimJob("cloudflare-failure-worker"))!;
      await runGeneration(failedJob, "cloudflare-failure-worker");
      const failed = (await getJob(failedId))!;
      assert.equal(failed.status, "failed");
      assert.match(failed.error || "", /allowance or rate limit/);
      assert.doesNotMatch(failed.error || "", /Private upstream/);
    } finally {
      await removeGenerations({ shop });
      await db.session.deleteMany({ where: { shop } });
    }
  });
});
