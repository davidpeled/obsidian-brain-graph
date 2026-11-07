import { REGION_COUNT, R_BRAINSTEM } from "../../domain/contracts/anatomy";
import { ColorKey, DEFAULT_COLOR_PRESET } from "../contracts/color-presets";
import { CATEGORY_REGION, Connectome, ParaCategory } from "../../domain/contracts/connectome";
import type { DisplaySettings } from "../contracts/settings";
import { clustersOf } from "../../domain/model/connectome/clusters";

export type RGB = readonly [number, number, number];

const CATEGORY_COLOR_KEY: Record<ParaCategory, ColorKey> = {
  projects: "colorProjects",
  areas: "colorAreas",
  resources: "colorResources",
  archive: "colorArchive",
  other: "colorOther",
};

/** No PARA category lives in the brainstem; it gets a quiet neutral. */
const BRAINSTEM_COLOR: RGB = [142, 134, 168];

export const CLUSTER_COLORS: readonly RGB[] = [
  [255, 143, 177],
  [142, 162, 255],
  [95, 227, 200],
  [255, 211, 138],
  [197, 155, 255],
  [56, 189, 248],
  [251, 113, 133],
  [134, 239, 172],
  [253, 186, 116],
  [240, 171, 252],
  [103, 232, 249],
  [190, 242, 100],
];
export const OTHER_COLOR: RGB = [160, 160, 180];

/** "#8ea2ff" or "#89f" -> RGB, or null if malformed. */
export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Colour of each brain region (index = region id), from the PARA colour settings. */
export function regionColors(settings: Pick<DisplaySettings, ColorKey>): RGB[] {
  const out = new Array<RGB>(REGION_COUNT).fill(BRAINSTEM_COLOR);
  for (const cat of Object.keys(CATEGORY_REGION) as ParaCategory[]) {
    const key = CATEGORY_COLOR_KEY[cat];
    out[CATEGORY_REGION[cat]] = parseHex(settings[key]) ?? parseHex(DEFAULT_COLOR_PRESET.colors[key])!;
  }
  out[R_BRAINSTEM] = BRAINSTEM_COLOR;
  return out;
}

export interface Palette {
  colors: readonly RGB[];
  /** Palette index per neuron. */
  colorOf: Uint8Array;
}

/** PARA brains colour by region (configurable); free brains by folder (biggest folders get distinct colours). */
export function toPalette(connectome: Connectome, settings: Pick<DisplaySettings, ColorKey>): Palette {
  const colorOf = new Uint8Array(connectome.neurons.length);
  if (connectome.paraMode) {
    connectome.neurons.forEach((n, i) => (colorOf[i] = n.region));
    return { colors: regionColors(settings), colorOf };
  }
  const ranked = [...clustersOf(connectome).values()].sort((a, b) => b.length - a.length);
  ranked.forEach((idx, rank) => {
    for (const i of idx) colorOf[i] = Math.min(rank, CLUSTER_COLORS.length);
  });
  return { colors: [...CLUSTER_COLORS, OTHER_COLOR], colorOf };
}

/** Changes whenever the colours a palette would use change. */
export function paletteKey(settings: Pick<DisplaySettings, ColorKey>): string {
  return regionColors(settings).flat().join(",");
}
