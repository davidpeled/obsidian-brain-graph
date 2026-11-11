import { R_CEREBELLUM, R_FRONTAL, R_OCCIPITAL, R_PARIETAL, R_TEMPORAL } from "./anatomy";

export type ParaCategory = "projects" | "areas" | "resources" | "archive" | "other";
export type CoreParaCategory = Exclude<ParaCategory, "other">;
export const CORE_PARA: readonly CoreParaCategory[] = ["projects", "areas", "resources", "archive"];

/** The cortex mapping: which brain region hosts each PARA category. */
export const CATEGORY_REGION: Readonly<Record<ParaCategory, number>> = {
  projects: R_FRONTAL, // planning & goal-directed action
  areas: R_PARIETAL, // ongoing integration & responsibility
  resources: R_TEMPORAL, // memory & knowledge
  archive: R_CEREBELLUM, // long-term, automatic storage
  other: R_OCCIPITAL, // incoming sensory input
};

export const CATEGORY_LABEL: Readonly<Record<ParaCategory, string>> = {
  projects: "Projects",
  areas: "Areas",
  resources: "Resources",
  archive: "Archive",
  other: "Inbox & other",
};

/**
 * A note as a neuron. Identity and wiring are fixed at build time; position,
 * velocity and activation are the neuron's mutable state, advanced by the
 * layout simulation and by action potentials.
 */
export interface Neuron {
  readonly path: string;
  readonly name: string;
  /** Creation time (ms since epoch); 0 when unknown. */
  readonly created: number;
  /** null when the brain is not PARA-structured. */
  readonly category: ParaCategory | null;
  readonly clusterKey: string;
  readonly clusterLabel: string;
  /** Home region and the bitmask of regions the neuron may occupy. */
  readonly region: number;
  readonly allowed: number;
  /** Soma radius (world units), grows with degree. */
  readonly r: number;
  /** Dendrite segments relative to the soma, in units of r: x1,y1,x2,y2,... */
  readonly dendrites: Float32Array;
  degree: number;
  neighbors: number[];
  synapses: number[];

  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Cluster anchor the neuron is gently pulled toward. */
  ax: number;
  ay: number;
  az: number;
  fixed: boolean;
  /** 0..1, decays after the neuron fires. */
  activation: number;
}

export interface Synapse {
  readonly a: number;
  readonly b: number;
  /** Connects two different lobes: a long-range "white matter" tract. */
  readonly cross: boolean;
  /** Signed curvature of the drawn tract. */
  readonly curv: number;
}

export interface Connectome {
  neurons: Neuron[];
  synapses: Synapse[];
  paraMode: boolean;
  paraRoot: string | null;
  /** Names of the folders detected for each PARA category, e.g. { projects: ["01_ProJeCt"] }. */
  paraFolders: Partial<Record<ParaCategory, string[]>>;
}
