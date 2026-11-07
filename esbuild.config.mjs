import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { statSync } from "node:fs";

/**
 * Bundle-size budget for the production main.js (three.js is most of it).
 * 579 KB on 2026-11-07; raise it on purpose, not by accident.
 */
const BUNDLE_BUDGET_BYTES = 650 * 1000;

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  const size = statSync("main.js").size;
  const kb = (n) => `${(n / 1000).toFixed(0)} KB`;
  if (size > BUNDLE_BUDGET_BYTES) {
    console.error(`✗ main.js is ${kb(size)}, over the ${kb(BUNDLE_BUDGET_BYTES)} budget (esbuild.config.mjs).`);
    process.exit(1);
  }
  console.log(`main.js: ${kb(size)} of the ${kb(BUNDLE_BUDGET_BYTES)} budget`);
  process.exit(0);
} else {
  await context.watch();
}
