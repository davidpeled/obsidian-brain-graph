import { describe, expect, it, vi } from "vitest";
import type { VaultSnapshot } from "../domain/contracts/vault";
import type { VaultRepository } from "../domain/interfaces/vault.repository";

/** A repository whose host holds `vault`, and the host events that should count as a change. */
export interface VaultHarness {
  repo: VaultRepository;
  /** One trigger per kind of host event that must notify `onChange` watchers. */
  changes: Record<string, () => void>;
}

const VAULT: VaultSnapshot = {
  name: "Second Brain",
  notes: [
    { path: "1. Projects/Plan.md", basename: "Plan" },
    { path: "1. Projects/Website/Copy.md", basename: "Copy" },
    { path: "Root note.md", basename: "Root note" },
  ],
  folders: ["1. Projects", "1. Projects/Website", "Empty"],
  links: [
    ["1. Projects/Plan.md", "1. Projects/Website/Copy.md"],
    ["1. Projects/Website/Copy.md", "1. Projects/Plan.md"],
    ["Root note.md", "1. Projects/Plan.md"],
  ],
};

const sorted = (links: VaultSnapshot["links"]) => links.map(([a, b]) => `${a} -> ${b}`).sort();

/**
 * What every VaultRepository must do, whatever the host. Each adapter runs this
 * suite with a harness that sets its host up to hold `vault`.
 */
export function vaultRepositoryContract(adapter: string, makeHarness: (vault: VaultSnapshot) => VaultHarness): void {
  describe(`${adapter} (VaultRepository contract)`, () => {
    it("reports the vault's name, notes and non-root folders", () => {
      const s = makeHarness(VAULT).repo.snapshot();
      expect(s.name).toBe(VAULT.name);
      expect([...s.notes].sort((a, b) => a.path.localeCompare(b.path))).toEqual(VAULT.notes);
      expect([...s.folders].sort()).toEqual(VAULT.folders);
      expect(s.folders).not.toContain("");
      expect(s.folders).not.toContain("/");
    });

    it("reports each resolved link once, as a from → to pair", () => {
      const s = makeHarness(VAULT).repo.snapshot();
      expect(sorted(s.links)).toEqual(sorted(VAULT.links));
    });

    it("reports an empty vault", () => {
      const s = makeHarness({ name: "empty", notes: [], folders: [], links: [] }).repo.snapshot();
      expect(s).toEqual({ name: "empty", notes: [], folders: [], links: [] });
    });

    it("notifies watchers of every kind of change until they unsubscribe", () => {
      const { repo, changes } = makeHarness(VAULT);
      const cb = vi.fn();
      const off = repo.onChange(cb);
      const kinds = Object.values(changes);
      expect(kinds.length).toBeGreaterThan(0);
      kinds.forEach((fire) => fire());
      expect(cb).toHaveBeenCalledTimes(kinds.length);
      off();
      kinds.forEach((fire) => fire());
      expect(cb).toHaveBeenCalledTimes(kinds.length);
    });
  });
}
