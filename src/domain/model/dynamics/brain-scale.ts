import { CEREBRUM_BITS, REGION_COUNT } from "../../contracts/anatomy";
import type { Connectome } from "../../contracts/connectome";
import type { RegionVolume } from "../anatomy/brain-volume";

/** World volume each neuron needs to breathe (≈ 60³). */
export const VOLUME_PER_NEURON = 216_000;
export const MAX_SCALE = 8;

/**
 * How big the brain must be so its most crowded region still fits its
 * neurons. `unit` is the volume at scale 1 (volumes scale with scale³).
 */
export function requiredScale(connectome: Connectome, unit: RegionVolume): number {
  let need = 1;
  if (connectome.paraMode) {
    const counts = new Array<number>(REGION_COUNT).fill(0);
    for (const n of connectome.neurons) counts[n.region]++;
    for (let r = 0; r < REGION_COUNT; r++) {
      if (counts[r] && unit.regionVolume[r] > 0) need = Math.max(need, (counts[r] * VOLUME_PER_NEURON) / unit.regionVolume[r]);
    }
  } else {
    let vol = 0;
    for (let r = 0; r < REGION_COUNT; r++) if ((CEREBRUM_BITS >> r) & 1) vol += unit.regionVolume[r];
    need = Math.max(need, (connectome.neurons.length * VOLUME_PER_NEURON) / vol);
  }
  return Math.min(MAX_SCALE, Math.max(1, Math.cbrt(need)));
}
