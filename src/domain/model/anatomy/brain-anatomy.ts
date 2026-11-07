/**
 * Brain anatomy, sagittal profile: a side view of the brain, front facing left.
 *
 * Outlines are defined in normalised coordinates (0..1 on both axes) and
 * classify a side-view point into a region. brain-volume.ts inflates these
 * outlines into the 3D brain.
 */
import { Pt, R_BRAINSTEM, R_CEREBELLUM, R_FRONTAL, R_OCCIPITAL, R_PARIETAL, R_TEMPORAL } from "../../contracts/anatomy";

/** World size of the brain's side view at scale 1. */
export const BRAIN_WIDTH = 1000;
export const BRAIN_HEIGHT = 760;

// --- Outlines (normalised, starting at the frontal pole) --------------------

const CEREBRUM_CTRL: Pt[] = [
  { x: 0.05, y: 0.5 },
  { x: 0.04, y: 0.38 },
  { x: 0.08, y: 0.24 },
  { x: 0.17, y: 0.12 },
  { x: 0.3, y: 0.05 },
  { x: 0.45, y: 0.02 },
  { x: 0.6, y: 0.03 },
  { x: 0.74, y: 0.08 },
  { x: 0.86, y: 0.17 },
  { x: 0.94, y: 0.3 },
  { x: 0.97, y: 0.45 },
  { x: 0.95, y: 0.58 },
  { x: 0.88, y: 0.66 },
  { x: 0.78, y: 0.68 },
  { x: 0.7, y: 0.67 },
  { x: 0.66, y: 0.72 },
  { x: 0.56, y: 0.76 },
  { x: 0.44, y: 0.76 },
  { x: 0.34, y: 0.72 },
  { x: 0.28, y: 0.65 },
  { x: 0.25, y: 0.61 },
  { x: 0.2, y: 0.62 },
  { x: 0.12, y: 0.6 },
  { x: 0.07, y: 0.56 },
];

const CEREBELLUM_CTRL: Pt[] = [
  { x: 0.64, y: 0.77 },
  { x: 0.69, y: 0.71 },
  { x: 0.78, y: 0.69 },
  { x: 0.88, y: 0.69 },
  { x: 0.93, y: 0.73 },
  { x: 0.92, y: 0.8 },
  { x: 0.86, y: 0.86 },
  { x: 0.76, y: 0.89 },
  { x: 0.67, y: 0.86 },
  { x: 0.63, y: 0.81 },
];

const BRAINSTEM_CTRL: Pt[] = [
  { x: 0.55, y: 0.74 },
  { x: 0.63, y: 0.72 },
  { x: 0.665, y: 0.8 },
  { x: 0.655, y: 0.9 },
  { x: 0.665, y: 0.99 },
  { x: 0.59, y: 0.99 },
  { x: 0.585, y: 0.9 },
  { x: 0.56, y: 0.82 },
];

/** Major sulci, which are also the lobe borders. */
export type Line = readonly [Pt, Pt];
export const CENTRAL_SULCUS: Line = [
  { x: 0.5, y: 0.0 },
  { x: 0.42, y: 0.54 },
];
export const LATERAL_SULCUS: Line = [
  { x: 0.24, y: 0.61 },
  { x: 0.7, y: 0.47 },
];
export const PARIETO_OCCIPITAL: Line = [
  { x: 0.8, y: 0.04 },
  { x: 0.72, y: 0.7 },
];
export const SULCI: readonly Line[] = [CENTRAL_SULCUS, LATERAL_SULCUS, PARIETO_OCCIPITAL];

function catmullRomClosed(pts: Pt[], per: number): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

/** Smoothed, normalised outlines of the three brain parts. */
export const OUTLINES: Readonly<Record<"cerebrum" | "cerebellum" | "brainstem", readonly Pt[]>> = {
  cerebrum: catmullRomClosed(CEREBRUM_CTRL, 10),
  cerebellum: catmullRomClosed(CEREBELLUM_CTRL, 10),
  brainstem: catmullRomClosed(BRAINSTEM_CTRL, 10),
};

export function pointInPolygon(poly: readonly Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const lineX = ([a, b]: Line, y: number) => a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
const lineY = ([a, b]: Line, x: number) => a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x);

/** Lobe of a normalised point already known to lie inside the cerebrum. */
export function classifyLobe(x: number, y: number): number {
  if (x > lineX(PARIETO_OCCIPITAL, y)) return R_OCCIPITAL;
  if (x >= 0.25 && y > lineY(LATERAL_SULCUS, x)) return R_TEMPORAL;
  return x < lineX(CENTRAL_SULCUS, y) ? R_FRONTAL : R_PARIETAL;
}

/** Region of a normalised point, or -1 outside the brain. Cerebrum wins overlaps. */
export function regionAtNormalised(x: number, y: number): number {
  if (pointInPolygon(OUTLINES.cerebrum, x, y)) return classifyLobe(x, y);
  if (pointInPolygon(OUTLINES.cerebellum, x, y)) return R_CEREBELLUM;
  if (pointInPolygon(OUTLINES.brainstem, x, y)) return R_BRAINSTEM;
  return -1;
}
