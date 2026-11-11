import { App, EventRef, TFolder } from "obsidian";
import type { VaultSnapshot } from "../../domain/contracts/vault";
import type { VaultRepository } from "../../domain/interfaces/vault.repository";

export class ObsidianVaultRepository implements VaultRepository {
  constructor(private readonly app: App) {}

  snapshot(): VaultSnapshot {
    const { vault, metadataCache } = this.app;
    const links: [string, string][] = [];
    const resolved = metadataCache.resolvedLinks;
    for (const from in resolved) for (const to in resolved[from]) links.push([from, to]);
    return {
      name: vault.getName(),
      notes: vault.getMarkdownFiles().map((f) => ({ path: f.path, basename: f.basename, created: f.stat.ctime })),
      folders: vault
        .getAllLoadedFiles()
        .filter((f): f is TFolder => f instanceof TFolder && !f.isRoot())
        .map((f) => f.path),
      links,
    };
  }

  onChange(cb: () => void) {
    const { vault, metadataCache } = this.app;
    const fire = () => cb();
    const cacheRefs: EventRef[] = [metadataCache.on("resolved", fire)];
    const vaultRefs: EventRef[] = [vault.on("create", fire), vault.on("delete", fire), vault.on("rename", fire)];
    return () => {
      cacheRefs.forEach((r) => metadataCache.offref(r));
      vaultRefs.forEach((r) => vault.offref(r));
    };
  }
}
