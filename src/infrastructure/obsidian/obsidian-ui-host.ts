import { App, Platform, setIcon } from "obsidian";
import { themeColorsOf } from "../dom/css-color";
import type { ThemeColors, UiHost } from "../dom/ui-host";

export class ObsidianUiHost implements UiHost {
  constructor(private readonly app: App) {}

  isDark(): boolean {
    return activeDocument.body.hasClass("theme-dark");
  }

  isMobile(): boolean {
    return Platform.isMobile;
  }

  /** Community themes and snippets set these variables, so the 3D labels follow them. */
  themeColors(el: HTMLElement): ThemeColors | null {
    return themeColorsOf(el);
  }

  fontFamily(): string {
    return getComputedStyle(activeDocument.body).getPropertyValue("--font-interface").trim() || "sans-serif";
  }

  onThemeChange(cb: () => void) {
    const ref = this.app.workspace.on("css-change", cb);
    return () => this.app.workspace.offref(ref);
  }

  renderIcon(el: HTMLElement, icon: string): void {
    setIcon(el, icon);
  }
}
