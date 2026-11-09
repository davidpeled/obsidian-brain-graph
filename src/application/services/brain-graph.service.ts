import type { Schedule } from "../contracts/schedule";
import type { Pt3 } from "../../domain/contracts/anatomy";
import type { BrainGraphService, BrainState } from "../../domain/contracts/brain-graph.contract";
import type { SettingsService } from "../contracts/settings";
import type { VaultSnapshot } from "../../domain/contracts/vault";
import type { VaultRepository } from "../../domain/interfaces/vault.repository";
import { RegionVolume } from "../../domain/model/anatomy/brain-volume";
import { buildConnectome } from "../../domain/model/connectome/connectome.builder";
import { vaultFingerprint } from "../../domain/model/connectome/vault-fingerprint";
import { ActionPotentials } from "../../domain/model/dynamics/action-potentials";
import { requiredScale } from "../../domain/model/dynamics/brain-scale";
import { LayoutSimulation } from "../../domain/model/dynamics/layout.simulation";
import { placeNeurons } from "../../domain/model/dynamics/placement";
import { RandomSource, hashString, mulberry32 } from "../../domain/model/shared/random";

export interface BrainGraphDeps {
  vault: VaultRepository;
  settings: SettingsService;
  random: RandomSource;
  /** Debounce for vault change bursts. */
  refreshDelayMs: number;
  /** Timer for that debounce. */
  schedule: Schedule;
}

/** Keep a brain size unless it must change by more than this fraction (avoids jitter). */
const SCALE_HYSTERESIS = 0.2;

/**
 * Per-process cache of brain volumes by scale, shared by every service (so by
 * every open brain view). Safe to share: a RegionVolume is immutable and
 * depends only on its scale. Holds at most 5 sizes; it is never otherwise
 * cleared, and lives until the plugin's code is unloaded.
 */
const volumeCache = new Map<number, RegionVolume>();
const VOLUME_CACHE_SIZE = 5;
function volumeAt(scale: number): RegionVolume {
  let v = volumeCache.get(scale);
  if (!v) {
    if (volumeCache.size >= VOLUME_CACHE_SIZE) volumeCache.clear();
    volumeCache.set(scale, (v = new RegionVolume(scale)));
  }
  return v;
}

export function createBrainGraphService(deps: BrainGraphDeps): BrainGraphService {
  let state: BrainState | null = null;
  /** The concrete firing behind `state.firing`: only the service hands signals over to the next brain. */
  let firingImpl: ActionPotentials | null = null;
  /** Fingerprint of the snapshot the current brain was built from. */
  let builtFrom: string | null = null;

  function rebuild(regrow: boolean): BrainState {
    return rebuildFrom(deps.vault.snapshot(), regrow);
  }

  function rebuildFrom(snapshot: VaultSnapshot, regrow: boolean): BrainState {
    builtFrom = vaultFingerprint(snapshot);
    const connectome = buildConnectome(snapshot, deps.settings.get());
    const prev = state;

    let scale = requiredScale(connectome, volumeAt(1));
    if (prev && Math.abs(prev.volume.scale - scale) / scale < SCALE_HYSTERESIS) scale = prev.volume.scale;
    const volume = volumeAt(scale);

    const keep = !regrow && prev;
    const positions = keep ? new Map<string, Pt3>(prev.connectome.neurons.map((n) => [n.path, { x: n.x, y: n.y, z: n.z }])) : null;
    // Layout randomness is seeded by the vault so the same vault grows the same brain.
    placeNeurons(connectome, volume, mulberry32(hashString(snapshot.name)), positions && prev ? { positions, ratio: volume.scale / prev.volume.scale } : undefined);

    const simulation = new LayoutSimulation(connectome, volume, deps.random);
    simulation.alpha = positions?.size ? 0.35 : 1;
    const firing = new ActionPotentials(connectome, deps.random);
    if (keep && firingImpl) firing.inherit(firingImpl);
    firingImpl = firing;
    state = {
      connectome,
      volume,
      simulation,
      firing,
      version: (prev?.version ?? 0) + 1,
      relaidOut: !keep || prev.volume.scale !== volume.scale,
    };
    return state;
  }

  // One subscription to the vault and settings, however many watchers: each
  // change rebuilds once and notifies everyone.
  const watchers = new Set<(s: BrainState) => void>();
  let unsubscribe: (() => void) | null = null;
  const notify = (s: BrainState) => watchers.forEach((w) => w(s));

  function subscribe(): () => void {
    let cancelRefresh: (() => void) | undefined;
    const offVault = deps.vault.onChange(() => {
      cancelRefresh?.();
      cancelRefresh = deps.schedule(() => {
        // Obsidian reports a change after every edit; most edits touch no
        // note, folder or link, so the brain stays exactly as it is.
        const snapshot = deps.vault.snapshot();
        if (state && vaultFingerprint(snapshot) === builtFrom) return;
        notify(rebuildFrom(snapshot, false));
      }, deps.refreshDelayMs);
    });
    const offSettings = deps.settings.onChange((structural) => {
      if (structural) notify(rebuild(false));
    });
    return () => {
      cancelRefresh?.();
      offVault();
      offSettings();
    };
  }

  function watch(onRebuilt: (s: BrainState) => void) {
    watchers.add(onRebuilt);
    unsubscribe ??= subscribe();
    return () => {
      watchers.delete(onRebuilt);
      if (!watchers.size && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };
  }

  return {
    get state() {
      return state;
    },
    rebuild,
    watch,
  };
}
