/**
 * Guards the layering: imports point inwards only.
 *   domain          -> domain
 *   application     -> application, domain
 *   infrastructure  -> infrastructure, application, domain
 *   bootstrap       -> anything
 * `obsidian` may only be imported by infrastructure/obsidian and bootstrap; `three` only by infrastructure/webgl.
 * Domain and application must not touch the DOM.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.dirname(new URL(import.meta.url).pathname);
const LAYERS = ["domain", "application", "infrastructure", "bootstrap"] as const;
type Layer = (typeof LAYERS)[number];
const ALLOWED: Record<Layer, Layer[]> = {
  domain: ["domain"],
  application: ["application", "domain"],
  infrastructure: ["infrastructure", "application", "domain"],
  bootstrap: [...LAYERS],
};
const DOM_GLOBALS = /\b(document|window|HTMLElement|HTMLCanvasElement|Path2D|CanvasRenderingContext2D|requestAnimationFrame|getComputedStyle)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".ts") && !p.endsWith(".spec.ts") ? [p] : [];
  });
}

const layerOf = (file: string): Layer | null => {
  const top = path.relative(SRC, file).split(path.sep)[0];
  return (LAYERS as readonly string[]).includes(top) ? (top as Layer) : null;
};

const sources = files(SRC)
  .filter((f) => layerOf(f))
  .map((f) => {
    const code = readFileSync(f, "utf8");
    const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    return { file: f, rel: path.relative(SRC, f), layer: layerOf(f) as Layer, code, imports };
  });

describe("architecture", () => {
  it("finds the layered sources", () => {
    expect(sources.length).toBeGreaterThan(30);
  });

  it.each(sources.map((s) => [s.rel, s] as const))("%s imports only inward layers", (_, s) => {
    for (const spec of s.imports.filter((i) => i.startsWith("."))) {
      const target = layerOf(path.resolve(path.dirname(s.file), spec));
      if (target) expect(ALLOWED[s.layer], `${s.rel} -> ${spec}`).toContain(target);
    }
  });

  it("confines the obsidian package to its adapters and the plugin entry", () => {
    const offenders = sources
      .filter((s) => s.imports.includes("obsidian"))
      .map((s) => s.rel)
      .filter((rel) => !rel.startsWith(path.join("infrastructure", "obsidian")) && rel !== path.join("bootstrap", "plugin.ts"));
    expect(offenders).toEqual([]);
  });

  it("confines three.js to the WebGL adapter", () => {
    const offenders = sources
      .filter((s) => s.imports.some((i) => i === "three" || i.startsWith("three/")))
      .map((s) => s.rel)
      .filter((rel) => !rel.startsWith(path.join("infrastructure", "webgl")));
    expect(offenders).toEqual([]);
  });

  it("lets renderers see only the read model, not live domain state", () => {
    // infrastructure/webgl may use the brain's static shape (anatomy) but not
    // connectome, dynamics or the graph-state contract: it renders SceneView.
    const offenders = sources
      .filter((s) => s.rel.startsWith(path.join("infrastructure", "webgl")))
      .flatMap((s) =>
        s.imports
          .filter((i) => i.includes("/domain/") && !/\/domain\/(contracts|model)\/anatomy/.test(i))
          .map((i) => `${s.rel} -> ${i}`)
      );
    expect(offenders).toEqual([]);
  });

  it("keeps domain and application free of the DOM", () => {
    const offenders = sources
      .filter((s) => s.layer === "domain" || s.layer === "application")
      .filter((s) => DOM_GLOBALS.test(s.code.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")))
      .map((s) => s.rel);
    expect(offenders).toEqual([]);
  });
});
