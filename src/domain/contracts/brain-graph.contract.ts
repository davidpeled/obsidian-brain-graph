import type { BrainVolume } from "./anatomy";
import type { Connectome } from "./connectome";
import type { BrainFiring, BrainLayout } from "./dynamics";
import type { Unsubscribe } from "./vault";

/** A grown brain: wiring, anatomy, and the two dynamic processes running on it. */
export interface BrainState {
  connectome: Connectome;
  volume: BrainVolume;
  simulation: BrainLayout;
  firing: BrainFiring;
  /** Increments on every rebuild. */
  version: number;
  /** True when positions were discarded or the brain was resized (views should refit). */
  relaidOut: boolean;
}

/** Inbound contract: grow and keep a brain in sync with the vault. */
export interface BrainGraphService {
  readonly state: BrainState | null;
  /** `regrow` discards current positions and grows the layout from scratch. */
  rebuild(regrow: boolean): BrainState;
  /** Rebuild (debounced) whenever the vault or structural settings change. */
  watch(onRebuilt: (state: BrainState) => void): Unsubscribe;
}
