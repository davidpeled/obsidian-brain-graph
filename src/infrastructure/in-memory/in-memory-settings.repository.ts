import type { SettingsRepository } from "../../domain/interfaces/settings.repository";

export class InMemorySettingsRepository implements SettingsRepository {
  constructor(
    private stored: Record<string, unknown> | null = null,
    private readonly onSave?: (data: Record<string, unknown>) => void
  ) {}

  async load(): Promise<Record<string, unknown> | null> {
    return this.stored ? { ...this.stored } : null;
  }

  async save(data: Record<string, unknown>): Promise<void> {
    this.stored = { ...data };
    this.onSave?.(data);
  }
}
