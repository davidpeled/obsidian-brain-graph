import type { VaultSnapshot } from "../../contracts/vault";

/**
 * Canonical description of everything in a snapshot that shapes the
 * connectome: note paths and names, folders, and the set of undirected links.
 * Order-independent, so two snapshots of an unchanged vault compare equal even
 * if the host lists files or links in a different order. Editing a note's text
 * without touching its links leaves it unchanged.
 */
export function vaultFingerprint(snapshot: VaultSnapshot): string {
  const notes = snapshot.notes.map((n) => `${n.path}\u0001${n.basename}`).sort();
  const folders = [...snapshot.folders].sort();
  const links = [
    ...new Set(
      snapshot.links.filter(([a, b]) => a !== b).map(([a, b]) => (a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`))
    ),
  ].sort();
  return [snapshot.name, notes.join("\u0002"), folders.join("\u0002"), links.join("\u0002")].join("\u0003");
}
