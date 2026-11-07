import { describe, expect, it } from "vitest";
import { DEFAULT_PARA_PATTERNS, STRUCTURE_KEYS } from "../../domain/contracts/settings";
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_SETTINGS } from "../contracts/settings";
import { sanitizeSettings } from "./settings.service";

describe("sanitizeSettings", () => {
  it("returns the defaults for nothing stored", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps stored values of the right type", () => {
    const s = sanitizeSettings({ firingRate: 9, showOrphans: false, colorProjects: "#123456", layoutMode: "free" });
    expect(s).toMatchObject({ firingRate: 9, showOrphans: false, colorProjects: "#123456", layoutMode: "free" });
  });

  it("drops wrong types, non-finite numbers and unknown keys from a corrupt data.json", () => {
    const s = sanitizeSettings({ firingRate: "fast", ambientFiring: "yes", showDendrites: null, autoRotate: NaN, colorAreas: 5, injected: "x" });
    expect(s.firingRate).toBe(DEFAULT_SETTINGS.firingRate);
    expect(s.ambientFiring).toBe(DEFAULT_SETTINGS.ambientFiring);
    expect(s.showDendrites).toBe(DEFAULT_SETTINGS.showDendrites);
    expect(s.colorAreas).toBe(DEFAULT_SETTINGS.colorAreas);
    expect("injected" in s).toBe(false);
    const nan = sanitizeSettings({ firingRate: Number.NaN });
    expect(nan.firingRate).toBe(DEFAULT_SETTINGS.firingRate);
  });

  it("migrates legacy plain-name PARA patterns", () => {
    expect(sanitizeSettings({ projectsFolders: "projects" }).projectsFolders).toBe(DEFAULT_PARA_PATTERNS.projectsFolders);
  });

  it("keeps structure and display settings disjoint", () => {
    for (const key of STRUCTURE_KEYS) expect(key in DEFAULT_DISPLAY_SETTINGS).toBe(false);
  });
});
