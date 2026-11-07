import type { Pt3 } from "../../contracts/anatomy";
import type { Connectome } from "../../contracts/connectome";
import type { RegionVolume } from "../anatomy/brain-volume";
import { clustersOf } from "../connectome/clusters";
import { RandomSource, gauss } from "../shared/random";
import { LINK_DIST } from "./layout.simulation";

export interface PreviousPositions {
  positions: Map<string, Pt3>;
  /** New scale / old scale, so old coordinates can be carried over. */
  ratio: number;
}

/**
 * Give every cluster an anchor spread through its region(s) — biggest
 * clusters get the most central spots — and place each neuron: at its
 * previous position if still valid, otherwise scattered around its anchor.
 * Invariant: every neuron ends inside a region it is allowed to occupy.
 */
export function placeNeurons(connectome: Connectome, volume: RegionVolume, rng: RandomSource, prev?: PreviousPositions): void {
  const neurons = connectome.neurons;
  const clusters = clustersOf(connectome);

  const byBits = new Map<number, string[]>();
  for (const [key, idx] of clusters) {
    const bits = neurons[idx[0]].allowed;
    let list = byBits.get(bits);
    if (!list) byBits.set(bits, (list = []));
    list.push(key);
  }
  const anchors = new Map<string, Pt3>();
  for (const [bits, keys] of byBits) {
    keys.sort((a, b) => (clusters.get(b)?.length ?? 0) - (clusters.get(a)?.length ?? 0));
    const pts = volume.spreadAnchors(bits, keys.length, rng);
    keys.forEach((k, i) => anchors.set(k, pts[i]));
  }

  for (const n of neurons) {
    const a = anchors.get(n.clusterKey) ?? volume.center;
    n.ax = a.x;
    n.ay = a.y;
    n.az = a.z;
    n.vx = n.vy = n.vz = 0;
    const p = prev?.positions.get(n.path);
    if (p && prev && volume.allows(n.allowed, p.x * prev.ratio, p.y * prev.ratio, p.z * prev.ratio)) {
      n.x = p.x * prev.ratio;
      n.y = p.y * prev.ratio;
      n.z = p.z * prev.ratio;
      continue;
    }
    const spread = LINK_DIST * (1 + Math.cbrt(clusters.get(n.clusterKey)?.length ?? 1) * 0.8);
    let placed = false;
    for (let t = 0; t < 30 && !placed; t++) {
      const [gx, gy] = gauss(rng);
      const [gz] = gauss(rng);
      const x = a.x + gx * spread;
      const y = a.y + gy * spread;
      const z = a.z + gz * spread;
      if (volume.allows(n.allowed, x, y, z)) {
        n.x = x;
        n.y = y;
        n.z = z;
        placed = true;
      }
    }
    if (!placed) {
      const s = volume.sample(n.allowed, rng);
      n.x = s.x;
      n.y = s.y;
      n.z = s.z;
    }
  }
}
