/**
 * Structure settings: the only settings the domain knows about. They decide
 * which notes become neurons and which region each one lives in, so changing
 * any of them rebuilds the brain. Display preferences live in the application
 * layer (application/contracts/settings.ts).
 */
export type LayoutMode = "auto" | "para" | "free";

export interface StructureSettings {
  layoutMode: LayoutMode;
  /**
   * PARA folder patterns: one regular expression per category, matched
   * case-insensitively against each folder's name (not its path).
   */
  projectsFolders: string;
  areasFolders: string;
  resourcesFolders: string;
  archiveFolders: string;
  excludedFolders: string;
  showOrphans: boolean;
}

/**
 * Default PARA patterns. Each allows any non-letter prefix (numbering,
 * separators, emoji: "01_", "1. ", "🚀 "), singular or plural, and must end
 * the word, so "01_ProJeCt" and "2-AREAS of focus" match but "Projectile" does not.
 */
export const DEFAULT_PARA_PATTERNS = {
  projectsFolders: String.raw`^[^\p{L}]*projects?(?!\p{L})`,
  areasFolders: String.raw`^[^\p{L}]*areas?(?!\p{L})`,
  resourcesFolders: String.raw`^[^\p{L}]*resources?(?!\p{L})`,
  archiveFolders: String.raw`^[^\p{L}]*archiv(?:e|es|ed)(?!\p{L})`,
} as const;

export const DEFAULT_STRUCTURE_SETTINGS: Readonly<StructureSettings> = {
  layoutMode: "auto",
  ...DEFAULT_PARA_PATTERNS,
  excludedFolders: "",
  showOrphans: true,
};

export const STRUCTURE_KEYS = Object.keys(DEFAULT_STRUCTURE_SETTINGS) as ReadonlyArray<keyof StructureSettings>;

/** Folder-name lists saved by versions before regex patterns. They become the new defaults. */
const LEGACY_PARA_DEFAULTS: Record<keyof typeof DEFAULT_PARA_PATTERNS, string[]> = {
  projectsFolders: ["projects", "projects, project"],
  areasFolders: ["areas", "areas, area"],
  resourcesFolders: ["resources", "resources, resource"],
  archiveFolders: ["archive", "archive, archives"],
};

/** Upgrade stored structure settings from older versions; other keys pass through untouched. */
export function migrateStructure<T extends Record<string, unknown>>(stored: T): T {
  const out: Record<string, unknown> = { ...stored };
  for (const key of Object.keys(LEGACY_PARA_DEFAULTS) as (keyof typeof DEFAULT_PARA_PATTERNS)[]) {
    const v = out[key];
    if (typeof v === "string" && LEGACY_PARA_DEFAULTS[key].includes(v.trim().toLowerCase())) out[key] = DEFAULT_PARA_PATTERNS[key];
  }
  return out as T;
}
