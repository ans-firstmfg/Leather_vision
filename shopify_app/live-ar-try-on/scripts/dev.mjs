import { existsSync, realpathSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { spawn } from "node:child_process";

// Use the installed CLI without a shell, and avoid unreliable QUIC development tunnels.
const candidates = [resolve("node_modules/@shopify/cli/bin/run.js")];
for (const directory of (process.env.PATH || "").split(delimiter).filter(Boolean)) {
  candidates.push(join(directory, "node_modules/@shopify/cli/bin/run.js"),
    resolve(directory, "../lib/node_modules/@shopify/cli/bin/run.js"));
  const executable = join(directory, "shopify");
  if (existsSync(executable)) {
    const target = realpathSync(executable);
    if (target.endsWith("/bin/run.js") || target.endsWith("\\bin\\run.js")) candidates.push(target);
  }
}
const cli = candidates.find(existsSync);
if (!cli) throw new Error("Shopify CLI was not found. Install it and ensure it is on PATH.");
const child = spawn(process.execPath, [cli, "app", "dev", ...process.argv.slice(2)], {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, TUNNEL_TRANSPORT_PROTOCOL: process.env.TUNNEL_TRANSPORT_PROTOCOL || "http2" },
});
child.on("error", () => { console.error("Could not start Shopify CLI."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
