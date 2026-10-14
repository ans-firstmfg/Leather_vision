import { transform } from "esbuild";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { extname } from "node:path";

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
