import { CORE_PARA, CoreParaCategory } from "../../contracts/connectome";
import type { StructureSettings } from "../../contracts/settings";

export interface ParaLayout {
  /** Folder whose children are the PARA folders ("/" for the vault root). */
  root: string;
  /** PARA folder path -> category. */
  folders: Map<string, CoreParaCategory>;
}

const SETTING_OF: Record<CoreParaCategory, keyof StructureSettings> = {
  projects: "projectsFolders",
  areas: "areasFolders",
  resources: "resourcesFolders",
  archive: "archiveFolders",
};

export type PatternCheck = { ok: true } | { ok: false; error: string };

/** Whether a user-supplied pattern is a valid regular expression. */
export function checkPattern(source: string): PatternCheck {
  try {
    new RegExp(source, "iu");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Compile a folder pattern, case-insensitive with Unicode classes (\p{L}).
 * An invalid pattern falls back to matching its text literally, so a typo
 * never hides every folder. An empty pattern matches nothing.
 */
export function compilePattern(source: string): RegExp | null {
  const src = source.trim();
  if (!src) return null;
  if (checkPattern(src).ok) return new RegExp(src, "iu");
  return new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu");
}

export function categoryPatterns(settings: StructureSettings): Record<CoreParaCategory, RegExp | null> {
  const out = {} as Record<CoreParaCategory, RegExp | null>;
  for (const cat of CORE_PARA) out[cat] = compilePattern(String(settings[SETTING_OF[cat]]));
  return out;
}

/** First category whose pattern matches the folder name (order: P, A, R, A). */
export function matchCategory(folderName: string, patterns: Record<CoreParaCategory, RegExp | null>): CoreParaCategory | null {
  for (const cat of CORE_PARA) if (patterns[cat]?.test(folderName)) return cat;
  return null;
}

/**
 * Find the folder whose direct children cover the most PARA categories
 * (usually the vault root, but "PARA/1 Projects" style nesting works too).
 *
 * Rules:
 * - "free" mode never uses PARA.
 * - "auto" needs at least two distinct categories side by side.
 * - "para" always uses PARA, even with no matching folders.
 * - Only folders up to depth 3 are considered; ties go to the shallowest parent.
 */
export function detectPara(folderPaths: readonly string[], settings: StructureSettings): ParaLayout | null {
  if (settings.layoutMode === "free") return null;
  const patterns = categoryPatterns(settings);
  const byParent = new Map<string, Map<string, CoreParaCategory>>();
  for (const path of folderPaths) {
    const segs = path.split("/");
    if (segs.length > 3) continue;
    const cat = matchCategory(segs[segs.length - 1], patterns);
    if (!cat) continue;
    const parent = segs.length > 1 ? segs.slice(0, -1).join("/") : "/";
    let m = byParent.get(parent);
    if (!m) byParent.set(parent, (m = new Map<string, CoreParaCategory>()));
    m.set(path, cat);
  }
  let best: ParaLayout | null = null;
  let bestScore = 0;
  let bestDepth = Infinity;
  for (const [parent, folders] of byParent) {
    const score = new Set(folders.values()).size;
    const depth = parent === "/" ? 0 : parent.split("/").length;
    if (score > bestScore || (score === bestScore && depth < bestDepth)) {
      best = { root: parent, folders };
      bestScore = score;
      bestDepth = depth;
    }
  }
  if (settings.layoutMode === "para") return best ?? { root: "/", folders: new Map() };
  return bestScore >= 2 ? best : null;
}
