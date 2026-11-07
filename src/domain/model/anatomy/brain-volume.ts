/**
 * The 3D brain, inflated from the sagittal outlines.
 *
 * At every side-view point (x, y) each brain part has a half-thickness T: 0 on
 * its outline, rising with a rounded (quarter-ellipse) profile toward the
 * interior. A point (x, y, z) is inside the part when |z| < T(x, y). The
 * cerebrum is additionally split by the longitudinal fissure (|z| > gap), which
 * gives two hemispheres. Lobes keep their side-view classification, so the
 * PARA → lobe mapping is the same in 3D.
 *
 * Normalised units: everything is measured in brain widths (W). x ∈ [0, 1],
 * y ∈ [0, ASPECT], z ∈ [-DEPTH_EXTENT, DEPTH_EXTENT].
 */
import {
  Bounds3,
  BrainVolume,
  Pt,
  Pt3,
  REGION_COUNT,
  R_BRAINSTEM,
  R_CEREBELLUM,
} from "../../contracts/anatomy";
import type { RandomSource } from "../shared/random";
import { BRAIN_HEIGHT, BRAIN_WIDTH, OUTLINES, classifyLobe, pointInPolygon } from "./brain-anatomy";

export const ASPECT = BRAIN_HEIGHT / BRAIN_WIDTH;
/** Half-width of the gap between the hemispheres (W units). */
export const MIDLINE_GAP = 0.012;

interface Profile {
  /** Maximum half-thickness (W units). */
  zmax: number;
  /** Distance from the outline over which the surface rounds up to zmax. */
  round: number;
}

const PROFILES = {
  cerebrum: { zmax: 0.36, round: 0.24 },
  cerebellum: { zmax: 0.26, round: 0.1 },
  brainstem: { zmax: 0.05, round: 0.035 },
} satisfies Record<keyof typeof OUTLINES, Profile>;

/** Largest |z| of any part (W units). */
export const DEPTH_EXTENT = PROFILES.cerebrum.zmax;

const GW = 240;
const GH = Math.ceil(GW * ASPECT);
const CELL = 1 / GW;

/** Smooth minimum: like Math.min but rounds the crease over a width of k. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}
const FISSURE_ROUNDING = 0.03;

function halfThickness(signedDist: number, p: Profile): number {
  if (signedDist <= 0) return signedDist; // negative outside: keeps the field continuous
  if (signedDist >= p.round) return p.zmax;
  const t = 1 - signedDist / p.round;
  return p.zmax * Math.sqrt(1 - t * t);
}

/** Exact signed distance (W units) from (x, y) to an outline given in side-view coordinates. O(segments). */
export function exactSignedDistance(poly: readonly Pt[], x: number, y: number): number {
  return pointInPolygon(poly, x, y / ASPECT) ? nearestOnOutline(poly, x, y).d : -nearestOnOutline(poly, x, y).d;
}

function nearestOnOutline(poly: readonly Pt[], x: number, y: number): { px: number; py: number; d: number } {
  let best = Infinity;
  let px = 0;
  let py = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j].x;
    const ay = poly[j].y * ASPECT;
    const dx = poly[i].x - ax;
    const dy = poly[i].y * ASPECT - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const d = (x - qx) ** 2 + (y - qy) ** 2;
    if (d < best) {
      best = d;
      px = qx;
      py = qy;
    }
  }
  return { px, py, d: Math.sqrt(best) };
}

/** Cells whose centres lie inside the outline (even-odd scanline fill, same rule as pointInPolygon). */
function rasterizeInside(poly: readonly Pt[]): Uint8Array {
  const inside = new Uint8Array(GW * GH);
  const xs: number[] = [];
  for (let gy = 0; gy < GH; gy++) {
    const y = ((gy + 0.5) * CELL) / ASPECT; // outline space
    xs.length = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j];
      const b = poly[i];
      if (b.y > y !== a.y > y) xs.push(((a.x - b.x) * (y - b.y)) / (a.y - b.y) + b.x);
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] / CELL - 0.5));
      const to = Math.min(GW - 1, Math.ceil(xs[k + 1] / CELL - 0.5) - 1);
      for (let gx = from; gx <= to; gx++) inside[gy * GW + gx] = 1;
    }
  }
  return inside;
}

/** Cells this close (in cells) to the outline get an exact distance; the rest is propagated. */
const EXACT_BAND = 2;

/**
 * Signed distance field of an outline over the whole grid, in O(cells):
 * exact nearest points in a thin band around the outline, then two raster
 * passes propagate each cell's nearest outline point to its neighbours
 * (nearest-point "dead reckoning"). Accurate to a small fraction of a cell.
 */
export function signedDistanceField(poly: readonly Pt[]): Float32Array {
  const inside = rasterizeInside(poly);
  const nx = new Float64Array(GW * GH).fill(NaN);
  const ny = new Float64Array(GW * GH);
  const dist2 = new Float64Array(GW * GH).fill(Infinity);
  const cx = (c: number) => ((c % GW) + 0.5) * CELL;
  const cy = (c: number) => (Math.floor(c / GW) + 0.5) * CELL;

  // Seed: cells within EXACT_BAND of an inside/outside change.
  const isEdge = (gx: number, gy: number) => {
    const v = inside[gy * GW + gx];
    return (gx > 0 && inside[gy * GW + gx - 1] !== v) || (gx < GW - 1 && inside[gy * GW + gx + 1] !== v) ||
      (gy > 0 && inside[(gy - 1) * GW + gx] !== v) || (gy < GH - 1 && inside[(gy + 1) * GW + gx] !== v);
  };
  const seeded = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      if (!isEdge(gx, gy)) continue;
      for (let oy = -EXACT_BAND; oy <= EXACT_BAND; oy++) {
        for (let ox = -EXACT_BAND; ox <= EXACT_BAND; ox++) {
          const x = gx + ox;
          const y = gy + oy;
          if (x < 0 || y < 0 || x >= GW || y >= GH || seeded[y * GW + x]) continue;
          const c = y * GW + x;
          seeded[c] = 1;
          const q = nearestOnOutline(poly, cx(c), cy(c));
          nx[c] = q.px;
          ny[c] = q.py;
          dist2[c] = q.d * q.d;
        }
      }
    }
  }

  const relax = (c: number, from: number) => {
    if (Number.isNaN(nx[from])) return;
    const d = (cx(c) - nx[from]) ** 2 + (cy(c) - ny[from]) ** 2;
    if (d < dist2[c]) {
      dist2[c] = d;
      nx[c] = nx[from];
      ny[c] = ny[from];
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const c = gy * GW + gx;
        if (gx > 0) relax(c, c - 1);
        if (gy > 0) {
          relax(c, c - GW);
          if (gx > 0) relax(c, c - GW - 1);
          if (gx < GW - 1) relax(c, c - GW + 1);
        }
      }
      for (let gx = GW - 2; gx >= 0; gx--) relax(gy * GW + gx, gy * GW + gx + 1);
    }
    for (let gy = GH - 1; gy >= 0; gy--) {
      for (let gx = GW - 1; gx >= 0; gx--) {
        const c = gy * GW + gx;
        if (gx < GW - 1) relax(c, c + 1);
        if (gy < GH - 1) {
          relax(c, c + GW);
          if (gx < GW - 1) relax(c, c + GW + 1);
          if (gx > 0) relax(c, c + GW - 1);
        }
      }
      for (let gx = 1; gx < GW; gx++) relax(gy * GW + gx, gy * GW + gx - 1);
    }
  }

  const out = new Float32Array(GW * GH);
  for (let c = 0; c < GW * GH; c++) out[c] = (inside[c] ? 1 : -1) * Math.sqrt(dist2[c]);
  return out;
}

/** The side-view grid every field is sampled on (W units). */
export const GRID = { GW, GH, CELL } as const;

interface Sampler {
  cells: Int32Array;
  /** Cumulative volume weight per cell (z-length available in that column). */
  cum: Float64Array;
  total: number;
}

/** Scale-independent fields, computed once. */
class BrainField {
  readonly lobe = new Int8Array(GW * GH).fill(-1);
  readonly tCer = new Float32Array(GW * GH);
  readonly tCbl = new Float32Array(GW * GH);
  readonly tBst = new Float32Array(GW * GH);
  readonly samplers: Sampler[] = [];

  constructor() {
    const dCer = signedDistanceField(OUTLINES.cerebrum);
    const dCbl = signedDistanceField(OUTLINES.cerebellum);
    const dBst = signedDistanceField(OUTLINES.brainstem);
    for (let gy = 0; gy < GH; gy++) {
      const y = (gy + 0.5) * CELL;
      for (let gx = 0; gx < GW; gx++) {
        const c = gy * GW + gx;
        this.tCer[c] = halfThickness(dCer[c], PROFILES.cerebrum);
        this.tCbl[c] = halfThickness(dCbl[c], PROFILES.cerebellum);
        this.tBst[c] = halfThickness(dBst[c], PROFILES.brainstem);
        if (dCer[c] > 0) this.lobe[c] = classifyLobe((gx + 0.5) * CELL, y / ASPECT);
      }
    }
    for (let r = 0; r < REGION_COUNT; r++) {
      const cells: number[] = [];
      const weights: number[] = [];
      for (let c = 0; c < GW * GH; c++) {
        const w =
          r === R_CEREBELLUM ? 2 * this.tCbl[c] : r === R_BRAINSTEM ? 2 * this.tBst[c] : this.lobe[c] === r ? 2 * (this.tCer[c] - MIDLINE_GAP) : 0;
        if (w > 0) {
          cells.push(c);
          weights.push(w);
        }
      }
      const cum = new Float64Array(weights.length);
      let acc = 0;
      weights.forEach((w, i) => (cum[i] = acc += w));
      this.samplers.push({ cells: Int32Array.from(cells), cum, total: acc });
    }
  }

  /** Region at a normalised point, or -1 outside the brain. */
  regionAt(x: number, y: number, z: number): number {
    const gx = Math.floor(x / CELL);
    const gy = Math.floor(y / CELL);
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return -1;
    const c = gy * GW + gx;
    const az = Math.abs(z);
    if (az > MIDLINE_GAP && az < this.tCer[c] && this.lobe[c] >= 0) return this.lobe[c];
    if (az < this.tCbl[c]) return R_CEREBELLUM;
    if (az < this.tBst[c]) return R_BRAINSTEM;
    return -1;
  }

  private bilinear(arr: Float32Array, x: number, y: number): number {
    const fx = Math.min(GW - 1.001, Math.max(0, x / CELL - 0.5));
    const fy = Math.min(GH - 1.001, Math.max(0, y / CELL - 0.5));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const c = iy * GW + ix;
    const top = arr[c] * (1 - tx) + arr[c + 1] * tx;
    const bottom = arr[c + GW] * (1 - tx) + arr[c + GW + 1] * tx;
    return top * (1 - ty) + bottom * ty;
  }

  /** Smooth signed field whose zero level set is the brain surface (> 0 inside). */
  surface(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || x > 1 || y > ASPECT) return -1;
    const az = Math.abs(z);
    // Rounded hemispheres: the fissure crease is smoothed, not cut.
    const cer = smin(this.bilinear(this.tCer, x, y) - az, az - MIDLINE_GAP, FISSURE_ROUNDING);
    return Math.max(cer, this.bilinear(this.tCbl, x, y) - az, this.bilinear(this.tBst, x, y) - az);
  }

  /** The region whose surface is nearest — for colouring surface points. */
  regionNear(x: number, y: number, z: number): number {
    const az = Math.abs(z);
    const cer = smin(this.bilinear(this.tCer, x, y) - az, az - MIDLINE_GAP, FISSURE_ROUNDING);
    const cbl = this.bilinear(this.tCbl, x, y) - az;
    const bst = this.bilinear(this.tBst, x, y) - az;
    if (cer >= cbl && cer >= bst) return classifyLobe(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y / ASPECT)));
    return cbl >= bst ? R_CEREBELLUM : R_BRAINSTEM;
  }
}

/**
 * Per-process singleton: the normalised brain field, built on first use (the
 * main startup cost, see startup-budget.spec.ts) and shared by every volume,
 * mesh and view until the plugin's code is unloaded. Immutable, so never rebuilt.
 */
let sharedField: BrainField | null = null;
/** The shared, normalised brain field (built on first use). */
export function brainField(): BrainField {
  return (sharedField ??= new BrainField());
}

/** The brain at a given scale, in world units. Cheap: all fields are shared. */
export class RegionVolume implements BrainVolume {
  readonly W: number;
  readonly H: number;
  /** Full left-right depth. */
  readonly D: number;
  /** World volume of each region. */
  readonly regionVolume: number[];
  private readonly field = brainField();

  constructor(readonly scale: number) {
    this.W = BRAIN_WIDTH * scale;
    this.H = BRAIN_HEIGHT * scale;
    this.D = 2 * DEPTH_EXTENT * this.W;
    this.regionVolume = this.field.samplers.map((s) => s.total * CELL * CELL * this.W ** 3);
  }

  /** Centre of the brain's bounding box. */
  get center(): Pt3 {
    return { x: this.W / 2, y: this.H / 2, z: 0 };
  }

  regionAt(x: number, y: number, z: number): number {
    return this.field.regionAt(x / this.W, y / this.W, z / this.W);
  }

  /** Whether a point lies in one of the regions in `bits`. */
  allows(bits: number, x: number, y: number, z: number): boolean {
    const r = this.regionAt(x, y, z);
    return r >= 0 && ((bits >> r) & 1) === 1;
  }

  /** Uniform random point inside the regions in `bits`. */
  sample(bits: number, rng: RandomSource): Pt3 {
    const regions = [...Array(REGION_COUNT).keys()].filter((r) => (bits >> r) & 1 && this.field.samplers[r].total > 0);
    const total = regions.reduce((s, r) => s + this.field.samplers[r].total, 0);
    if (!total) return this.center;
    for (let attempt = 0; attempt < 40; attempt++) {
      let pick = rng() * total;
      const r = regions.find((x) => (pick -= this.field.samplers[x].total) < 0) ?? regions[regions.length - 1];
      const s = this.field.samplers[r];
      const target = rng() * s.total;
      let lo = 0;
      let hi = s.cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (s.cum[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      const c = s.cells[lo];
      const nx = ((c % GW) + rng()) * CELL;
      const ny = (Math.floor(c / GW) + rng()) * CELL;
      const sign = rng() < 0.5 ? -1 : 1;
      const nz =
        r === R_CEREBELLUM
          ? (rng() * 2 - 1) * this.field.tCbl[c]
          : r === R_BRAINSTEM
            ? (rng() * 2 - 1) * this.field.tBst[c]
            : sign * (MIDLINE_GAP + rng() * (this.field.tCer[c] - MIDLINE_GAP));
      if (this.field.regionAt(nx, ny, nz) === r) return { x: nx * this.W, y: ny * this.W, z: nz * this.W };
    }
    return this.center;
  }

  /**
   * Spread `k` anchor points over the regions in `bits` (farthest-point
   * sampling over interior points, starting near the centroid).
   */
  spreadAnchors(bits: number, k: number, rng: RandomSource): Pt3[] {
    if (k <= 0) return [];
    const m = 0.025 * this.W;
    let cand = Array.from({ length: 1500 }, () => this.sample(bits, rng));
    const interior = cand.filter((p) =>
      [
        [m, 0, 0],
        [-m, 0, 0],
        [0, m, 0],
        [0, -m, 0],
        [0, 0, m],
        [0, 0, -m],
      ].every(([dx, dy, dz]) => this.allows(bits, p.x + dx, p.y + dy, p.z + dz))
    );
    if (interior.length >= Math.max(k, 12)) cand = interior;
    const n = cand.length;
    const c = cand.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: a.z + p.z / n }), { x: 0, y: 0, z: 0 });
    const d2 = (a: Pt3, b: Pt3) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
    let first = 0;
    cand.forEach((p, i) => d2(p, c) < d2(cand[first], c) && (first = i));
    const chosen = [first];
    const minD = cand.map((p) => d2(p, cand[first]));
    while (chosen.length < Math.min(k, n)) {
      let arg = 0;
      for (let i = 1; i < n; i++) if (minD[i] > minD[arg]) arg = i;
      chosen.push(arg);
      cand.forEach((p, i) => (minD[i] = Math.min(minD[i], d2(p, cand[arg]))));
    }
    return Array.from({ length: k }, (_, i) => cand[chosen[i % chosen.length]]);
  }

  regionBounds(bits: number): Bounds3 | null {
    let b: Bounds3 | null = null;
    for (let r = 0; r < REGION_COUNT; r++) {
      if (!((bits >> r) & 1)) continue;
      const s = this.field.samplers[r];
      const t = r === R_CEREBELLUM ? this.field.tCbl : r === R_BRAINSTEM ? this.field.tBst : this.field.tCer;
      for (const c of s.cells) {
        const x = ((c % GW) + 0.5) * CELL * this.W;
        const y = (Math.floor(c / GW) + 0.5) * CELL * this.W;
        const z = t[c] * this.W;
        if (!b) b = { min: { x, y, z: -z }, max: { x, y, z } };
        b.min = { x: Math.min(b.min.x, x), y: Math.min(b.min.y, y), z: Math.min(b.min.z, -z) };
        b.max = { x: Math.max(b.max.x, x), y: Math.max(b.max.y, y), z: Math.max(b.max.z, z) };
      }
    }
    return b;
  }
}
