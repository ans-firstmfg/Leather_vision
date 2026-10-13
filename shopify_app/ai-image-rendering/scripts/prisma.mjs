import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
if (existsSync(".env")) process.loadEnvFile(".env");
process.env.DATABASE_URL ||= "file:dev.sqlite";
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
