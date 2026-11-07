import { DEFAULT_SETTINGS, PluginSettings } from "../application/contracts/settings";
import { DEFAULT_STRUCTURE_SETTINGS, StructureSettings } from "../domain/contracts/settings";
import type { VaultSnapshot } from "../domain/contracts/vault";

/** Structure settings only: what domain rules see. */
export const structure = (patch: Partial<StructureSettings> = {}): StructureSettings => ({ ...DEFAULT_STRUCTURE_SETTINGS, ...patch });
/** All plugin settings: what application code sees. */
export const settings = (patch: Partial<PluginSettings> = {}): PluginSettings => ({ ...DEFAULT_SETTINGS, ...patch });

/** Small vault: notes given as paths, links as [from, to] pairs. */
export function vault(paths: string[], links: [string, string][] = [], name = "test"): VaultSnapshot {
  const folders = new Set<string>();
  for (const p of paths) {
    const segs = p.split("/").slice(0, -1);
    segs.forEach((_, i) => folders.add(segs.slice(0, i + 1).join("/")));
  }
  return {
    name,
    notes: paths.map((path) => ({ path, basename: path.split("/").pop()!.replace(/\.md$/, "") })),
    folders: [...folders],
    links,
  };
}

export const PARA_VAULT = vault(
  [
    "1. Projects/Website/Plan.md",
    "1. Projects/Website/Copy.md",
    "1. Projects/Launch.md",
    "2. Areas/Health/Sleep.md",
    "3. Resources/Books/Atomic Habits.md",
    "4. Archive/Old.md",
    "📥 Inbox/Idea.md",
    "Root note.md",
  ],
  [
    ["1. Projects/Website/Plan.md", "1. Projects/Website/Copy.md"],
    ["1. Projects/Website/Copy.md", "1. Projects/Website/Plan.md"],
    ["1. Projects/Website/Plan.md", "3. Resources/Books/Atomic Habits.md"],
    ["2. Areas/Health/Sleep.md", "2. Areas/Health/Sleep.md"],
    ["Root note.md", "📥 Inbox/Idea.md"],
    ["Root note.md", "missing.md"],
  ]
);
