import { access, rm, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
if (!process.argv.includes("--dev-stopped")) {
  throw new Error("Stop Shopify dev with Ctrl+C first, then run: npm run dev:clean -- --dev-stopped");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(root, ".shopify", "dev-bundle");
if (dirname(target) !== resolve(root, ".shopify")) throw new Error("Unsafe cache path");
try {
  await access(target);
  if ((await lstat(dirname(target))).isSymbolicLink() || (await lstat(target)).isSymbolicLink()) throw new Error("Refusing linked cache path");
  await rm(target, { recursive: true, force: true });
}
catch (error) { if (error.code !== "ENOENT") throw error; }
console.log("Cleared only the generated Shopify dev bundle. Run npm run dev again.");
