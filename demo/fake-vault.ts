import type { NoteRef, VaultSnapshot } from "../src/domain/contracts/vault";

export type VaultKind = "para" | "para-nested" | "free";

const WORDS = [
  "Atomic", "Habits", "Deep", "Work", "Focus", "Systems", "Notes", "Garden", "Ideas", "Review", "Weekly",
  "Plan", "Goals", "Budget", "Taxes", "Sleep", "Running", "Nutrition", "React", "Rust", "TypeScript",
  "Design", "Patterns", "Marketing", "Launch", "Roadmap", "Meeting", "Retro", "Interview", "Hiring",
  "Stoicism", "Memory", "Learning", "Writing", "Essay", "Draft", "Outline", "Research", "Podcast",
  "Recipe", "Pasta", "Travel", "Japan", "Coffee", "Mindset", "Leadership", "Feedback", "Metrics",
];

/** Folder -> note count at size 1. */
const LAYOUTS: Record<VaultKind, Record<string, number>> = {
  para: {
    "01_ProJeCt/Website Redesign": 18,
    "01_ProJeCt/Mobile App": 22,
    "01_ProJeCt/Book Launch": 10,
    "2. Areas/Health": 25,
    "2. Areas/Finance": 20,
    "2. Areas/Career": 15,
    "3. Resources/Books": 45,
    "3. Resources/Programming": 50,
    "3. Resources/Recipes": 20,
    "3. Resources": 10,
    "4. Archive/2023": 30,
    "4. Archive/Old Projects": 25,
    "📥 Inbox": 15,
    "": 6,
  },
  "para-nested": {
    "PARA/🚀 Projects/Q4 Launch": 20,
    "PARA/🚀 Projects/Home Renovation": 12,
    "PARA/🌱 Areas/Family": 18,
    "PARA/🌱 Areas/Fitness": 16,
    "PARA/📚 Resources/Psychology": 35,
    "PARA/📚 Resources/Design": 30,
    "PARA/🗄 Archives": 40,
    Daily: 30,
    Templates: 5,
  },
  free: { Journal: 60, Work: 50, Ideas: 40, Reading: 35, People: 25, "": 10 },
};

/** Deterministic fake vault: mostly local links, some across folders, a few hubs. */
export function makeVault(kind: VaultKind, size: number, seed: number): VaultSnapshot {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];

  const folders = new Set<string>();
  const groups: NoteRef[][] = [];
  const used = new Set<string>();
  for (const [dir, base] of Object.entries(LAYOUTS[kind])) {
    const segs = dir ? dir.split("/") : [];
    segs.forEach((_, i) => folders.add(segs.slice(0, i + 1).join("/")));
    const group: NoteRef[] = [];
    for (let i = 0; i < Math.max(1, Math.round(base * size)); i++) {
      let name = `${pick(WORDS)} ${pick(WORDS)}`;
      while (used.has(dir + name)) name += ` ${Math.floor(rnd() * 99)}`;
      used.add(dir + name);
      group.push({ basename: name, path: `${dir ? dir + "/" : ""}${name}.md`, created: Date.now() - Math.floor(rnd() * rnd() * 3 * 365 * 864e5) });
    }
    groups.push(group);
  }

  const notes = groups.flat();
  const hubs = notes.filter(() => rnd() < 0.04);
  const links: [string, string][] = [];
  groups.forEach((group) => {
    for (const note of group) {
      for (let j = Math.floor(rnd() * 4); j > 0; j--) {
        const r = rnd();
        const target = r < 0.72 ? pick(group) : r < 0.9 ? pick(pick(groups)) : hubs.length ? pick(hubs) : pick(notes);
        if (target !== note) links.push([note.path, target.path]);
      }
    }
  });

  return { name: `demo-${kind}-${seed}`, notes, folders: [...folders], links };
}

/** A copy of the vault with one more note linked to a random existing one. */
export function withNewNote(v: VaultSnapshot): { vault: VaultSnapshot; path: string } {
  const anchor = v.notes[Math.floor(Math.random() * v.notes.length)];
  const dir = anchor.path.includes("/") ? anchor.path.slice(0, anchor.path.lastIndexOf("/") + 1) : "";
  const basename = `New note ${Date.now() % 10000}`;
  const path = `${dir}${basename}.md`;
  return { path, vault: { ...v, notes: [...v.notes, { path, basename, created: Date.now() }], links: [...v.links, [path, anchor.path]] } };
}
