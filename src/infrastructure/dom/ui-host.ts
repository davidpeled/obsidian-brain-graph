import type { Unsubscribe } from "../../domain/contracts/vault";

/**
 * What the DOM panel needs from its host page (Obsidian or the demo):
 * theme, typography and icons. Consumed only by infrastructure, so it lives here.
 */
/** The host theme's colours, 0–255 RGB. */
export interface ThemeColors {
  /** `--background-primary` */
  background: [number, number, number];
  /** `--text-normal` */
  text: [number, number, number];
}

export interface UiHost {
  isDark(): boolean;
  /** The theme's colours as seen from `el` (so popouts and per-pane overrides count), or null if unknown. */
  themeColors(el: HTMLElement): ThemeColors | null;
  fontFamily(): string;
  onThemeChange(cb: () => void): Unsubscribe;
  renderIcon(el: HTMLElement, icon: string): void;
}
