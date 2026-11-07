import { mulberry32 } from "../shared/random";

/** Deterministic dendrite tree for a neuron: segments x1,y1,x2,y2,... in units of soma radius. */
export function growDendrites(seed: number): Float32Array {
  const rng = mulberry32(seed);
  const segs: number[] = [];
  const count = 3 + Math.floor(rng() * 4);
  for (let k = 0; k < count; k++) {
    const ang = (k / count) * Math.PI * 2 + (rng() - 0.5) * 0.9;
    const len = 1.8 + rng() * 1.8;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    segs.push(c * 0.9, s * 0.9, c * len, s * len);
    if (rng() < 0.8) {
      const ba = ang + (rng() < 0.5 ? -1 : 1) * (0.4 + rng() * 0.5);
      const bl = 0.6 + rng() * 0.9;
      const bx = c * len * 0.6;
      const by = s * len * 0.6;
      segs.push(bx, by, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl);
    }
    if (rng() < 0.5) {
      const tx = c * len;
      const ty = s * len;
      for (const side of [-1, 1]) {
        const fa = ang + side * (0.35 + rng() * 0.3);
        const fl = 0.4 + rng() * 0.6;
        segs.push(tx, ty, tx + Math.cos(fa) * fl, ty + Math.sin(fa) * fl);
      }
    }
  }
  return Float32Array.from(segs);
}
