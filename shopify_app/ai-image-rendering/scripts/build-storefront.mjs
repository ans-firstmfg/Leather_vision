import { transform } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";

for (const filename of ["leather-vision.js", "leather-vision-puter.js"]) {
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
