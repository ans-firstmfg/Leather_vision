import { transform } from "esbuild";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { extname } from "node:path";

await import("./build-leather-catalog.mjs");

// Shopify limits the combined Liquid content and each individual locale file.
const extension = new URL("../extensions/leather-vision/", import.meta.url);
let liquidBytes = 0;
const translationKeys = (value) => Object.values(value).reduce((count, entry) =>
  count + (typeof entry === "object" && entry !== null ? translationKeys(entry) : 1), 0);
for (const filename of await readdir(extension, { recursive: true })) {
  if (!filename.endsWith(".liquid") && !/^locales[\\/].*\.json$/.test(filename)) continue;
  const content = await readFile(new URL(filename.replaceAll("\\", "/"), extension));
  const size = content.byteLength;
  if (filename.endsWith(".liquid")) liquidBytes += size;
  else {
    if (size > 15000) throw new Error(`${filename} is ${size} bytes; Shopify permits 15000 per locale file.`);
    const count = translationKeys(JSON.parse(content.toString("utf8")));
    if (count > 250) throw new Error(`${filename} contains ${count} translation keys; Shopify permits 250.`);
    console.info(`${filename}: ${size}/15000 bytes, ${count}/250 translation keys.`);
  }
}
if (liquidBytes > 100000) throw new Error(`Extension Liquid content is ${liquidBytes} bytes; Shopify permits 100000 total.`);
console.info(`Extension Liquid content: ${liquidBytes}/100000 bytes.`);

// Shopify theme app extensions accept fewer asset formats than storefront uploads.
const allowedExtensions = new Set([".jpg", ".jpeg", ".js", ".css", ".png", ".svg", ".json", ".wasm"]);
for (const filename of await readdir(new URL("../extensions/leather-vision/assets/", import.meta.url))) {
  if (!allowedExtensions.has(extname(filename).toLowerCase())) {
    throw new Error(`Unsupported Shopify theme extension asset: ${filename}`);
  }
}

for (const filename of ["leather-vision.js", "leather-vision-puter.js", "leather-vision-flow.js"]) {
  const source = new URL("../storefront/" + filename, import.meta.url);
  const asset = new URL("../extensions/leather-vision/assets/" + filename, import.meta.url);
  const result = await transform(await readFile(source, "utf8"), {
    minify: true, target: "es2022", legalComments: "none",
  });
  const size = Buffer.byteLength(result.code);
  if (size > 10000) throw new Error(`Storefront JavaScript is ${size} bytes; Shopify permits 10000.`);
  await writeFile(asset, result.code);
  console.info(`Built ${filename} (${size}/10000 bytes).`);
}
