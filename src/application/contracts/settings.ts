import {
  DEFAULT_STRUCTURE_SETTINGS,
  STRUCTURE_KEYS,
  StructureSettings,
} from "../../domain/contracts/settings";
import type { Unsubscribe } from "../../domain/contracts/vault";
import { ColorKey, DEFAULT_COLOR_PRESET } from "./color-presets";

/** How the brain looks and moves. Changing these never rebuilds it. */
export interface DisplaySettings extends Record<ColorKey, string> {
  ambientFiring: boolean;
  firingRate: number;
  showDendrites: boolean;
  showNodeLabels: boolean;
  showRegionLabels: boolean;
  autoRotate: boolean;
  /** Id of the colour preset in use, or "custom" after picking colours by hand. */
  colorPreset: string;
}

export const DEFAULT_DISPLAY_SETTINGS: Readonly<DisplaySettings> = {
  ambientFiring: true,
  firingRate: 4,
  showDendrites: true,
  showNodeLabels: true,
  showRegionLabels: true,
  autoRotate: true,
  colorPreset: DEFAULT_COLOR_PRESET.id,
  ...DEFAULT_COLOR_PRESET.colors,
};

/** Everything the plugin persists: what the brain is made of, and how it looks. */
export type PluginSettings = StructureSettings & DisplaySettings;

export const DEFAULT_SETTINGS: Readonly<PluginSettings> = { ...DEFAULT_STRUCTURE_SETTINGS, ...DEFAULT_DISPLAY_SETTINGS };

/** True when the patch changes which neurons exist or where they live. */
export function isStructuralChange(prev: PluginSettings, patch: Partial<PluginSettings>): boolean {
  return STRUCTURE_KEYS.some((k) => k in patch && patch[k] !== prev[k]);
}

/** Inbound contract for reading and changing settings. */
export interface SettingsService {
  get(): Readonly<PluginSettings>;
  update(patch: Partial<PluginSettings>): Promise<void>;
  /** `structural` is true when the change requires rebuilding the brain. */
  onChange(cb: (structural: boolean) => void): Unsubscribe;
}
