/**
 * Outbound port: opaque settings storage (a JSON object). It neither knows
 * nor validates the shape; the settings service does.
 */
export interface SettingsRepository {
  load(): Promise<Record<string, unknown> | null>;
  save(data: Record<string, unknown>): Promise<void>;
}
