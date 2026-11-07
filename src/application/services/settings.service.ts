import { migrateStructure } from "../../domain/contracts/settings";
import type { SettingsRepository } from "../../domain/interfaces/settings.repository";
import { DEFAULT_SETTINGS, PluginSettings, SettingsService, isStructuralChange } from "../contracts/settings";

/**
 * Stored values over defaults, keeping only known keys whose type matches the
 * default: a hand-edited or corrupt data.json can't inject wrong types.
 */
export function sanitizeSettings(stored: Record<string, unknown> | null): PluginSettings {
  const migrated = migrateStructure(stored ?? {});
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const v = migrated[key];
    if (typeof v === typeof fallback && (typeof v !== "number" || Number.isFinite(v))) out[key] = v;
  }
  return out as unknown as PluginSettings;
}

export async function createSettingsService(repository: SettingsRepository): Promise<SettingsService> {
  let current = sanitizeSettings(await repository.load());
  const listeners = new Set<(structural: boolean) => void>();

  return {
    get: () => current,
    async update(patch) {
      const structural = isStructuralChange(current, patch);
      current = { ...current, ...patch };
      await repository.save({ ...current });
      listeners.forEach((l) => l(structural));
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
