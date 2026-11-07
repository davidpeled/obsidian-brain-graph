/** Colour settings: one colour per PARA category (hex, e.g. "#8ea2ff"). */
export type ColorKey = "colorProjects" | "colorAreas" | "colorResources" | "colorArchive" | "colorOther";

export const COLOR_KEYS: readonly ColorKey[] = ["colorProjects", "colorAreas", "colorResources", "colorArchive", "colorOther"];

export interface ColorPreset {
  id: string;
  name: string;
  colors: Readonly<Record<ColorKey, string>>;
}

export const COLOR_PRESETS: readonly ColorPreset[] = [
  {
    id: "nebula",
    name: "Nebula",
    colors: { colorProjects: "#ff8fb1", colorAreas: "#8ea2ff", colorResources: "#5fe3c8", colorArchive: "#ffd38a", colorOther: "#c59bff" },
  },
  {
    id: "ocean",
    name: "Ocean",
    colors: { colorProjects: "#38bdf8", colorAreas: "#818cf8", colorResources: "#2dd4bf", colorArchive: "#94a3b8", colorOther: "#c084fc" },
  },
  {
    id: "sunset",
    name: "Sunset",
    colors: { colorProjects: "#fb7185", colorAreas: "#fdba74", colorResources: "#fde68a", colorArchive: "#a78bfa", colorOther: "#f0abfc" },
  },
  {
    id: "forest",
    name: "Forest",
    colors: { colorProjects: "#86efac", colorAreas: "#5eead4", colorResources: "#bef264", colorArchive: "#fde68a", colorOther: "#67e8f9" },
  },
  {
    id: "mono",
    name: "Monochrome violet",
    colors: { colorProjects: "#e9d5ff", colorAreas: "#c4b5fd", colorResources: "#a78bfa", colorArchive: "#7c3aed", colorOther: "#ddd6fe" },
  },
  {
    id: "classic",
    name: "Classic",
    colors: { colorProjects: "#ff8c42", colorAreas: "#4dabf7", colorResources: "#51cf66", colorArchive: "#fcc419", colorOther: "#cc5de8" },
  },
];

export const DEFAULT_COLOR_PRESET = COLOR_PRESETS[0];
/** `colorPreset` value once the user picks individual colours. */
export const CUSTOM_PRESET = "custom";

export function presetById(id: string): ColorPreset | undefined {
  return COLOR_PRESETS.find((p) => p.id === id);
}
