import { describe, expect, it, vi } from "vitest";
import { App, TFolder } from "obsidian";
import type { VaultSnapshot } from "../../domain/contracts/vault";
import { vaultRepositoryContract } from "../../test-support/vault-repository.contract";
import { ObsidianVaultRepository } from "./obsidian-vault.repository";

type Handler = () => void;

// `obsidian` resolves to src/test-support/obsidian.stub.ts in tests, where TFolder takes a path.
const folder = (path: string) => new (TFolder as unknown as new (path: string) => TFolder)(path);

/** Just enough of Obsidian's event emitters: `on` returns a ref, `offref` removes it. */
class Events {
  private readonly handlers = new Map<string, Set<Handler>>();
  on(name: string, cb: Handler) {
    const set = this.handlers.get(name) ?? new Set();
    this.handlers.set(name, set.add(cb));
    return { name, cb };
  }
  offref(ref: { name: string; cb: Handler }) {
    this.handlers.get(ref.name)?.delete(ref.cb);
  }
  trigger(name: string) {
    this.handlers.get(name)?.forEach((cb) => cb());
  }
  count() {
    return [...this.handlers.values()].reduce((n, s) => n + s.size, 0);
  }
}

/** A stubbed `App` holding `vault` the way Obsidian does. */
function stubApp(vault: VaultSnapshot) {
  const vaultEvents = new Events();
  const cacheEvents = new Events();
  const files = vault.notes.map((n) => ({ path: n.path, basename: n.basename, extension: "md", stat: { ctime: n.created } }));
  // Obsidian counts links per target: { from: { to: count } }, unresolved links excluded.
  const resolvedLinks: Record<string, Record<string, number>> = {};
  for (const [from, to] of vault.links) (resolvedLinks[from] ??= {})[to] = 2;
  const app = {
    vault: Object.assign(vaultEvents, {
      getName: () => vault.name,
      getMarkdownFiles: () => files,
      // Every loaded file: notes, a non-markdown attachment, the folders and the root folder.
      getAllLoadedFiles: () => [folder("/"), ...vault.folders.map(folder), ...files, { path: "image.png" }],
    }),
    metadataCache: Object.assign(cacheEvents, { resolvedLinks }),
  };
  return { app: app as unknown as App, vaultEvents, cacheEvents };
}

vaultRepositoryContract("ObsidianVaultRepository", (vault) => {
  const { app, vaultEvents, cacheEvents } = stubApp(vault);
  return {
    repo: new ObsidianVaultRepository(app),
    changes: {
      resolved: () => cacheEvents.trigger("resolved"),
      create: () => vaultEvents.trigger("create"),
      delete: () => vaultEvents.trigger("delete"),
      rename: () => vaultEvents.trigger("rename"),
    },
  };
});

describe("ObsidianVaultRepository", () => {
  it("ignores events it does not care about", () => {
    const { app, vaultEvents, cacheEvents } = stubApp({ name: "v", notes: [], folders: [], links: [] });
    const cb = vi.fn();
    new ObsidianVaultRepository(app).onChange(cb);
    vaultEvents.trigger("modify");
    cacheEvents.trigger("changed");
    expect(cb).not.toHaveBeenCalled();
  });

  it("removes every handler it registered on unsubscribe", () => {
    const { app, vaultEvents, cacheEvents } = stubApp({ name: "v", notes: [], folders: [], links: [] });
    const off = new ObsidianVaultRepository(app).onChange(() => {});
    expect(vaultEvents.count() + cacheEvents.count()).toBe(4);
    off();
    expect(vaultEvents.count() + cacheEvents.count()).toBe(0);
  });
});
