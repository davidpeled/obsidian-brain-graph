import type { Pt3 } from "../../domain/contracts/anatomy";
import type { OrbitCamera } from "../controllers/orbit-camera";
import type { Palette } from "../mappers/palette.mapper";
import type { DisplaySettings } from "./settings";

/**
 * Read model for renderers: plain data and typed arrays, no domain objects.
 * A renderer never sees LayoutSimulation, ActionPotentials, RegionVolume or
 * Neuron, so those can change freely without touching infrastructure.
 */

/** Everything that only changes when the brain is rebuilt. Indices are neuron / synapse ids. */
export interface GraphView {
  /** Increments on every rebuild. */
  readonly version: number;
  readonly paraMode: boolean;
  readonly count: number;
  readonly names: readonly string[];
  readonly degree: Uint32Array;
  /** Soma radius (world units). */
  readonly radius: Float32Array;
  readonly region: Uint8Array;
  /** Dendrite segments per neuron: x1,y1,x2,y2,... in units of radius, in the neuron's own plane. */
  readonly dendrites: readonly Float32Array[];
  /** Orthonormal basis (u, v; 6 floats per neuron) of the plane each dendrite tree lies in. */
  readonly dendritePlane: Float32Array;
  readonly synapseA: Uint32Array;
  readonly synapseB: Uint32Array;
  /** 1 when the synapse connects two different lobes (a long-range tract). */
  readonly synapseCross: Uint8Array;
  readonly synapseCurv: Float32Array;
  readonly volume: { readonly W: number; readonly H: number; readonly D: number; readonly scale: number; readonly center: Pt3 };
  /** Regions that hold at least one neuron. */
  readonly regionUsed: readonly boolean[];
  /** Caption per region (PARA folder names), floated at `at`; null where there is none. */
  readonly captions: readonly ({ readonly at: Pt3; readonly text: string } | null)[];
  /** Upper bound on simultaneous pulses. */
  readonly maxPulses: number;
}

export interface PulseView {
  readonly synapse: number;
  /** Progress from the source end, 0..1. */
  readonly t: number;
  /** Travelling from synapseA to synapseB. */
  readonly forward: boolean;
  readonly strong: boolean;
  readonly source: number;
}

/** How far each neuron has grown in on the timeline; the frame builder depends on this, not on playback logic. */
export interface Presence {
  /** 0 = not born yet, 1 = fully grown. */
  presence(i: number): number;
  /** Changes whenever the set of born neurons changes. */
  readonly signature: number;
}

/** Everything that changes every frame. */
export interface FrameView {
  /** x,y,z per neuron. */
  readonly positions: Float32Array;
  /** 0..1 per neuron. */
  readonly activation: Float32Array;
  /** 0..1 per neuron: how far it has grown in on the timeline (0 = not born yet, hide it). All 1 when the timeline is off. */
  readonly presence: Float32Array;
  /** Changes whenever any position changed since the previous frame. */
  readonly layoutVersion: number;
  readonly pulses: readonly PulseView[];
}

/** Everything a renderer needs for one frame. */
export interface SceneView {
  readonly graph: GraphView;
  readonly frame: FrameView;
  readonly palette: Palette;
  readonly camera: OrbitCamera;
  readonly display: Readonly<DisplaySettings>;
  readonly hover: number;
  /** Highlighted neurons (hover neighbourhood or search hits); others are dimmed. */
  readonly focus: ReadonlySet<number> | null;
  /** Changes whenever `focus` or `hover` may have changed. */
  readonly focusVersion: number;
  /** Neuron of the open note, or -1. */
  readonly active: number;
}
