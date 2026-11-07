import { themeColorsOf } from "./css-color";
import type { ThemeColors, UiHost } from "./ui-host";

export const UNICODE_ICONS: Record<string, string> = {
  maximize: "⤢",
  zap: "⚡",
  "refresh-cw": "↻",
  activity: "∿",
  "rotate-3d": "⟲",
  "file-text": "📄",
  "file-plus": "＋",
  "zoom-in": "🔍",
};

/** UiHost for a plain web page: theme from a body class, unicode icons. */
export class DomUiHost implements UiHost {
  private listeners = new Set<() => void>();

  isDark(): boolean {
    return document.body.classList.contains("theme-dark");
  }

  themeColors(el: HTMLElement): ThemeColors | null {
    return themeColorsOf(el);
  }

  fontFamily(): string {
    return getComputedStyle(document.body).getPropertyValue("--font-interface").trim() || "sans-serif";
  }

  onThemeChange(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Call after changing the page theme. */
  notifyThemeChanged(): void {
    this.listeners.forEach((l) => l());
  }

  renderIcon(el: HTMLElement, icon: string): void {
    el.textContent = UNICODE_ICONS[icon] ?? "•";
  }
}
