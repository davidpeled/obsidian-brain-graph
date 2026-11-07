import type { Neuron } from "./connectome";

/** A signal travelling along a synapse. */
export interface Pulse {
  synapse: number;
  /** Progress along the synapse, 0..1. */
  t: number;
  /** Travelling from synapse.a to synapse.b. */
  forward: boolean;
  /** Remaining hops it may trigger on arrival. */
  depth: number;
  speed: number;
  strong: boolean;
  /** Neuron that emitted it (for colouring). */
  source: number;
}

export interface FiringConditions {
  ambient: boolean;
  /** 1..10, user-facing firing rate. */
  rate: number;
  /** World speed multiplier (bigger brains need faster signals). */
  speedScale: number;
}

/** Signals travelling along synapses, as the brain's users drive and read them. */
export interface BrainFiring {
  readonly pulses: readonly Pulse[];
  /** Activate a neuron and emit pulses that may cascade `depth` hops. */
  fire(neuron: number, depth: number, strong?: boolean): void;
  fireRandom(): void;
  step(dt: number, cond: FiringConditions): void;
}

/** The 3D layout process: ticks while it has energy (`alpha`), and takes neuron drags. */
export interface BrainLayout {
  /** Remaining energy; 0 stops the layout. */
  alpha: number;
  readonly running: boolean;
  tick(): void;
  /** Hold a neuron at a world position (it stays inside its lobe). */
  drag(n: Neuron, x: number, y: number, z: number): void;
  release(n: Neuron): void;
}
