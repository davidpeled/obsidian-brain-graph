import { Pt3, REGION_COUNT, regionBit } from "../../domain/contracts/anatomy";
import type { BrainState } from "../../domain/contracts/brain-graph.contract";
import { CATEGORY_LABEL, CATEGORY_REGION, ParaCategory } from "../../domain/contracts/connectome";
import { MAX_PULSES } from "../../domain/model/dynamics/action-potentials";
import { hashString, mulberry32 } from "../../domain/model/shared/random";
import type { FrameView, GraphView } from "../contracts/scene";

/** Random but stable plane per neuron for its dendrite tree. */
function dendritePlanes(paths: readonly string[]): Float32Array {
  const out = new Float32Array(paths.length * 6);
  paths.forEach((path, i) => {
    const rng = mulberry32(hashString(path) ^ 0x5bd1e995);
    const a = rng() * Math.PI * 2;
    const b = Math.acos(rng() * 2 - 1);
    const nx = Math.sin(b) * Math.cos(a);
    const ny = Math.sin(b) * Math.sin(a);
    const nz = Math.cos(b);
    // u ⟂ n in the xy plane, v = n × u.
    const ul = Math.hypot(ny, nx) || 1;
    const ux = -ny / ul;
    const uy = nx / ul;
    out.set([ux, uy, 0, -nz * uy, nz * ux, nx * uy - ny * ux], i * 6);
  });
  return out;
}

/** PARA folder names per region, floated near the top of each region. */
function captions(state: BrainState): GraphView["captions"] {
  const { connectome, volume } = state;
  const out = new Array<{ at: Pt3; text: string } | null>(REGION_COUNT).fill(null);
  if (!connectome.paraMode) return out;
  for (const cat of Object.keys(CATEGORY_REGION) as ParaCategory[]) {
    const r = CATEGORY_REGION[cat];
    const b = volume.regionBounds(regionBit(r));
    if (!b) continue;
    const names = connectome.paraFolders[cat];
    out[r] = {
      at: { x: (b.min.x + b.max.x) / 2, y: b.min.y + (b.max.y - b.min.y) * 0.3, z: 0 },
      text: names?.length ? names.join(" · ") : CATEGORY_LABEL[cat],
    };
  }
  return out;
}

/** Snapshot of everything rebuild-scoped, as plain data. */
export function toGraphView(state: BrainState): GraphView {
  const { neurons, synapses } = state.connectome;
  const regionUsed = new Array<boolean>(REGION_COUNT).fill(false);
  for (const n of neurons) regionUsed[n.region] = true;
  const v = state.volume;
  return {
    version: state.version,
    paraMode: state.connectome.paraMode,
    count: neurons.length,
    names: neurons.map((n) => n.name),
    degree: Uint32Array.from(neurons, (n) => n.degree),
    radius: Float32Array.from(neurons, (n) => n.r),
    region: Uint8Array.from(neurons, (n) => n.region),
    dendrites: neurons.map((n) => n.dendrites),
    dendritePlane: dendritePlanes(neurons.map((n) => n.path)),
    synapseA: Uint32Array.from(synapses, (s) => s.a),
    synapseB: Uint32Array.from(synapses, (s) => s.b),
    synapseCross: Uint8Array.from(synapses, (s) => (s.cross ? 1 : 0)),
    synapseCurv: Float32Array.from(synapses, (s) => s.curv),
    volume: { W: v.W, H: v.H, D: v.D, scale: v.scale, center: v.center },
    regionUsed,
    captions: captions(state),
    maxPulses: MAX_PULSES,
  };
}

/**
 * Per-frame copy of positions and activation into reused typed arrays, with a
 * layout version that changes only on frames where neurons moved.
 */
export class FrameBuffer {
  private positions = new Float32Array(0);
  private activation = new Float32Array(0);
  private layoutVersion = 0;

  /** Record that positions changed (layout ticked, a neuron was dragged, or the brain was rebuilt). */
  moved(): void {
    this.layoutVersion++;
  }

  write(state: BrainState): FrameView {
    const neurons = state.connectome.neurons;
    const n = neurons.length;
    if (this.activation.length !== n) {
      this.positions = new Float32Array(n * 3);
      this.activation = new Float32Array(n);
      this.layoutVersion++;
    }
    for (let i = 0; i < n; i++) {
      const p = neurons[i];
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      this.activation[i] = p.activation;
    }
    return { positions: this.positions, activation: this.activation, layoutVersion: this.layoutVersion, pulses: state.firing.pulses };
  }
}
