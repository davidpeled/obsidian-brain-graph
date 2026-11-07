// Dev server for the browser demo. The demo runs the real composition root
// (src/bootstrap/container.ts) with in-memory and plain-DOM adapters, so no
// Obsidian is needed. Serves demo/ and live-reloads on every rebuild.
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 5173;

const ctx = await esbuild.context({
  entryPoints: [path.join(here, "main.ts")],
  bundle: true,
  outdir: path.join(here, "dist"),
  format: "esm",
  target: "es2022",
  sourcemap: "inline",
  logLevel: "info",
});

await ctx.watch();

// If the port is busy (e.g. another demo is already running), try the next ones.
async function serve(first, attempts = 10) {
  for (let p = first; p < first + attempts; p++) {
    try {
      return await ctx.serve({ servedir: here, port: p });
    } catch (err) {
      if (!String(err?.message).includes("address already in use")) throw err;
      console.warn(`  Port ${p} is in use, trying ${p + 1}…`);
    }
  }
  throw new Error(`No free port in ${first}-${first + attempts - 1}. Set PORT=<number> to choose one.`);
}

const { port: actual } = await serve(port);
console.log(`\n  🧠 Brain Graph demo running at http://localhost:${actual}\n`);
