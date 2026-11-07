import type { VaultSnapshot } from "../../domain/contracts/vault";
import type { VaultRepository } from "../../domain/interfaces/vault.repository";

export class InMemoryVaultRepository implements VaultRepository {
  private listeners = new Set<() => void>();

  constructor(private current: VaultSnapshot = { name: "memory", notes: [], folders: [], links: [] }) {}

  snapshot(): VaultSnapshot {
    return this.current;
  }

  /** Replace the vault contents and notify watchers. */
  set(snapshot: VaultSnapshot): void {
    this.current = snapshot;
    this.listeners.forEach((l) => l());
  }

  onChange(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
