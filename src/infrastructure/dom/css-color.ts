import type { ThemeColors } from "./ui-host";

/** An sRGB colour: channels 0–255, alpha 0–1. */
export type Rgba = [r: number, g: number, b: number, a: number];

/**
 * Parse a computed CSS colour: `rgb()`/`rgba()` (comma or space syntax) or
 * `color(srgb r g b / a)`, which browsers return for `color-mix()` results.
 */
export function parseCssColor(value: string): Rgba | null {
  const s = value.trim().toLowerCase();
  const nums = (body: string) =>
    body
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((t) => (t.endsWith("%") ? Number(t.slice(0, -1)) / 100 : Number(t)));
  let m = s.match(/^rgba?\((.*)\)$/);
  if (m) {
    const [r, g, b, a = 1] = nums(m[1]);
    return valid([r, g, b, a]);
  }
  m = s.match(/^color\(srgb\s+(.*)\)$/);
  if (m) {
    const [r, g, b, a = 1] = nums(m[1]);
    return valid([r * 255, g * 255, b * 255, a]);
  }
  return null;
}

function valid(c: number[]): Rgba | null {
  if (c.length !== 4 || c.some((x) => !Number.isFinite(x))) return null;
  const [r, g, b, a] = c.map((x, i) => Math.min(i === 3 ? 1 : 255, Math.max(0, i === 3 ? x : Math.round(x))));
  return [r, g, b, a];
}

/**
 * Theme variables the scene reads, each with a probe class in styles.css
 * (`.brain-graph-probe-*`) whose `color` is that variable.
 */
const PROBES = {
  "--background-primary": "brain-graph-probe-background",
  "--text-normal": "brain-graph-probe-text",
} as const;

/**
 * Resolve a theme variable (e.g. `--text-normal`) as seen from `el`, whatever
 * form the theme wrote it in (hex, hsl(), nested var(), color-mix()…).
 * Null when the variable isn't defined there.
 */
export function resolveCssColor(el: HTMLElement, cssVar: keyof typeof PROBES): Rgba | null {
  const win = el.ownerDocument.defaultView;
  if (!win || !win.getComputedStyle(el).getPropertyValue(cssVar).trim()) return null;
  // Let the browser compute it: a hidden probe whose colour is the variable.
  const probe = el.ownerDocument.createElement("span");
  probe.className = PROBES[cssVar];
  el.appendChild(probe);
  const color = win.getComputedStyle(probe).color;
  probe.remove();
  return parseCssColor(color);
}

/** The theme's page background and text colour as seen from `el`. */
export function themeColorsOf(el: HTMLElement): ThemeColors | null {
  const background = resolveCssColor(el, "--background-primary");
  const text = resolveCssColor(el, "--text-normal");
  return background && text ? { background: [background[0], background[1], background[2]], text: [text[0], text[1], text[2]] } : null;
}
