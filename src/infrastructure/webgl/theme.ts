import type { Blending } from "three";
import { AdditiveBlending, NormalBlending } from "three";
import type { ThemeColors } from "../dom/ui-host";

export interface Theme3D {
  dark: boolean;
  /** Colour dimmed neurons/links fade toward. */
  fade: [number, number, number];
  /** Shell colour when the brain is not PARA-structured. */
  neutralShell: [number, number, number];
  shellOpacity: number;
  rimOpacity: number;
  rimPower: number;
  usedRegion: number;
  unusedRegion: number;
  synapse: [number, number, number];
  crossSynapse: [number, number, number];
  synapseOpacity: number;
  glowBlending: Blending;
  glowBase: number;
  /** Label fill (CSS colour). */
  text: string;
  /** Label outline, so labels stay legible over the scene (CSS colour). */
  textStroke: string;
}

export const DARK_3D: Theme3D = {
  dark: true,
  fade: [0.06, 0.05, 0.1],
  neutralShell: [0.55, 0.45, 0.9],
  shellOpacity: 0.16,
  rimOpacity: 0.85,
  rimPower: 2.2,
  usedRegion: 1,
  unusedRegion: 0.3,
  synapse: [0.75, 0.72, 1],
  crossSynapse: [1, 0.85, 0.7],
  synapseOpacity: 0.32,
  glowBlending: AdditiveBlending,
  glowBase: 0.35,
  text: "rgba(242,238,255,0.95)",
  textStroke: "rgba(10,8,20,0.85)",
};

export const LIGHT_3D: Theme3D = {
  dark: false,
  fade: [0.93, 0.92, 0.95],
  neutralShell: [0.6, 0.45, 0.65],
  shellOpacity: 0.2,
  rimOpacity: 0.55,
  rimPower: 1.8,
  usedRegion: 0.9,
  unusedRegion: 0.35,
  synapse: [0.3, 0.22, 0.45],
  crossSynapse: [0.6, 0.35, 0.15],
  synapseOpacity: 0.3,
  glowBlending: NormalBlending,
  glowBase: 0.18,
  text: "#2a2238",
  textStroke: "rgba(255,255,255,0.9)",
};

/**
 * The scene theme for the host's light/dark mode, with label colours taken
 * from the host theme (`--text-normal` on a `--background-primary` outline)
 * when it provides them. The scene background is CSS (styles.css).
 */
export function sceneTheme(dark: boolean, colors: ThemeColors | null): Theme3D {
  const base = dark ? DARK_3D : LIGHT_3D;
  if (!colors) return base;
  const css = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${a})`;
  return { ...base, text: css(colors.text, dark ? 0.95 : 1), textStroke: css(colors.background, dark ? 0.85 : 0.9) };
}
