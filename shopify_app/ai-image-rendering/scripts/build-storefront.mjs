import { transform } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";

const source = new URL("../storefront/leather-vision.js", import.meta.url);
const asset = new URL("../extensions/leather-vision/assets/leather-vision.js", import.meta.url);
const result = await transform(await readFile(source, "utf8"), {
  minify: true, target: "es2022", legalComments: "none",
});
const size = Buffer.byteLength(result.code);
if (size > 10000) throw new Error(`Storefront JavaScript is ${size} bytes; Shopify permits 10000.`);
await writeFile(asset, result.code);
console.info(`Built leather-vision.js (${size}/10000 bytes).`);
