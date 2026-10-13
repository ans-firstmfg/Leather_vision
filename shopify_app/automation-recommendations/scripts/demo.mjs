import { createServer } from "node:http";
import { demoProducts } from "../app/services/demo.mjs";
import { recommend } from "../app/services/recommendations.mjs";

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const port = Number(process.env.DEMO_PORT || 3091);
createServer((request, response) => {
  if (request.method !== "GET") { response.writeHead(405); response.end(); return; }
  const url = new URL(request.url, "http://127.0.0.1");
  const products = url.searchParams.get("mode") === "empty" ? [] : demoProducts;
  const items = recommend(products);
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Automation Recommendations — Demo</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f4f3;color:#202720;font:16px/1.6 system-ui,sans-serif}main{max-width:960px;margin:40px auto;padding:24px}h1{font-size:32px;letter-spacing:-1px;margin:0}h2{font-size:21px}p{margin:8px 0 16px}.intro{color:#5b655d}.notice{background:#e7f1ff;border:1px solid #b2cef2;border-radius:12px;padding:16px}nav{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}a{padding:10px 18px;border-radius:8px;background:#18583d;color:white;text-decoration:none}a.secondary{background:white;color:#18583d;border:1px solid #bbc6bc}.summary,article{background:white;border:1px solid #dce1dc;border-radius:12px;padding:22px;margin:16px 0}.priority{background:#fff0ce;border-radius:20px;padding:4px 12px;font-size:13px;font-weight:700}.priority.high{background:#ffe2e0;color:#942b24}.product{color:#627065;font-size:14px}footer{color:#657067;font-size:14px;margin-top:28px}
  </style></head><body><main><h1>Automation Recommendations</h1><p class="intro">A practical checklist for product content and stock.</p><div class="notice"><strong>Local sample demo</strong><br>Fictional products only. No Shopify connection, AI calls or store changes.</div><nav><a href="/?mode=sample">Try sample products</a><a class="secondary" href="/?mode=empty">Preview empty store</a></nav><section class="summary"><h2>${products.length ? "Sample results" : "No products found"}</h2><p>${products.length ? `${products.length} sample products checked · ${items.length} recommendations` : "Add your first product in Shopify, then scan again. You can test the checks with sample products now."}</p></section>${items.map((item) => `<article><span class="priority ${item.priority === "High" ? "high" : ""}">${escape(item.priority)} priority</span><h2>${escape(item.title)}</h2><p class="product">${escape(item.productTitle)}</p><p>${escape(item.detail)}</p></article>`).join("")}<footer>Rule-based checks · Low-stock threshold: 5 units · Real scans require the separately installed Shopify app. This demo has no product edit links.</footer></main></body></html>`);
}).listen(port, "127.0.0.1", () => console.log(`Local sample demo: http://127.0.0.1:${port}`));
