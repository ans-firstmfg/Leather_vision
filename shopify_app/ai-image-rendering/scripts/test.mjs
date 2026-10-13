import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
const cache = path.resolve(".cache");
await mkdir(cache, { recursive: true });
const directory = await mkdtemp(path.join(cache, "tests-"));
if (path.dirname(directory) !== cache || !path.basename(directory).startsWith("tests-")) throw new Error("Unsafe test directory");
try {
  const outfile = path.join(directory, "security.test.mjs");
  await build({ entryPoints: ["tests/security.test.ts"], outfile, bundle: true, platform: "node",
    format: "esm", packages: "external", logLevel: "warning" });
  const result = spawnSync(process.execPath, ["--test", outfile, "tests/frontend.test.mjs"], { stdio: "inherit", env: {
    ...process.env, NODE_ENV: "test", DATABASE_URL: "file:" + path.join(directory, "test.sqlite").replaceAll("\\", "/"),
    GENERATION_DATA_DIR: path.join(directory, "images"),
    IMAGE_PROVIDER: "openai",
    SHOPIFY_API_KEY: "test-api-key", SHOPIFY_API_SECRET: "test-secret-key",
    SHOPIFY_APP_URL: "https://test.example", SCOPES: "write_app_proxy",
  } });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
