/** Brain regions. Indices are stable: they key masks, bitsets and palettes. */
export const REGION_COUNT = 6;
export const R_FRONTAL = 0;
export const R_PARIETAL = 1;
export const R_TEMPORAL = 2;
export const R_OCCIPITAL = 3;
export const R_CEREBELLUM = 4;
export const R_BRAINSTEM = 5;

/** Bitmask of the four cerebral lobes. */
export const CEREBRUM_BITS = 0b1111;

export const REGION_LABELS = [
  "Frontal lobe",
  "Parietal lobe",
  "Temporal lobe",
  "Occipital lobe",
  "Cerebellum",
  "Brainstem",
] as const;

export const regionBit = (region: number): number => 1 << region;

/** 2D point (side-view outlines). */
export interface Pt {
  x: number;
  y: number;
}

/**
 * 3D point in brain world space: x runs front → back, y top → bottom,
 * z left ↔ right with the midline at z = 0.
 */
export interface Pt3 {
  x: number;
  y: number;
  z: number;
}

export interface Bounds3 {
  min: Pt3;
  max: Pt3;
}

/** The brain's anatomy at its current size, in world units, as the brain's users see it. */
export interface BrainVolume {
  /** Size factor; the brain is 1000 × scale long. */
  readonly scale: number;
  readonly W: number;
  readonly H: number;
  readonly D: number;
  readonly center: Pt3;
  /** Bounds of the regions in `bits` (see regionBit), or null if empty. */
  regionBounds(bits: number): Bounds3 | null;
}

export function boundsOf(points: Iterable<Pt3>): Bounds3 | null {
  let b: Bounds3 | null = null;
  for (const p of points) {
    if (!b) b = { min: { ...p }, max: { ...p } };
    b.min = { x: Math.min(b.min.x, p.x), y: Math.min(b.min.y, p.y), z: Math.min(b.min.z, p.z) };
    b.max = { x: Math.max(b.max.x, p.x), y: Math.max(b.max.y, p.y), z: Math.max(b.max.z, p.z) };
  }
  return b;
}
