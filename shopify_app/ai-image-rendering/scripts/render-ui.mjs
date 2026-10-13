import { readFile, mkdir, writeFile } from "node:fs/promises";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
await mkdir(".cache/ui", { recursive: true });
const readyJob = { id: "00000000-0000-4000-8000-000000000000", status: "ready",
  variations: [{ id: "v1", filename: "variation-1.png" }], selectedVariation: "v1",
  createdAt: "2026-10-10T00:00:00Z", expiresAt: "2026-11-09T00:00:00Z" };
for (const [name, file, data] of [
  ["dashboard-ready", "app/routes/app._index.jsx", { jobs: [readyJob], limits: { dailyPerShop: 50, dailyPerActor: 12, retentionDays: 30 }, providerError: null, reference: "" }],
  ["dashboard-empty", "app/routes/app._index.jsx", { jobs: [], limits: { dailyPerShop: 50, dailyPerActor: 12, retentionDays: 30 }, providerError: "Provider configuration required", reference: "" }],
  ["setup", "app/routes/app.additional.jsx", {}],
]) {
  const source = await readFile(file, "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const component = parsed.statements.find((statement) => ts.isFunctionDeclaration(statement) &&
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  if (!component) throw new Error("Missing route component");
  const code = ts.transpileModule(component.getText(parsed), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } }).outputText;
  const Component = new Function("React", "Form", "useLoaderData", "DesignImage", "const exports = {}; " + code + "; return exports.default;")(React, "form", () => data,
    ({ src, label }) => React.createElement("img", { src, alt: label, width: 240, height: 240 }));
  await writeFile(".cache/ui/" + name + ".html", renderToStaticMarkup(React.createElement(Component)));
}
