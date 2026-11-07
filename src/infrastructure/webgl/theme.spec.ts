import { describe, expect, it } from "vitest";
import { DARK_3D, LIGHT_3D, sceneTheme } from "./theme";

describe("sceneTheme", () => {
  it("takes label colours from the host theme", () => {
    const th = sceneTheme(true, { background: [40, 42, 54], text: [248, 248, 242] }); // e.g. a Dracula-like theme
    expect(th.text).toBe("rgba(248,248,242,0.95)");
    expect(th.textStroke).toBe("rgba(40,42,54,0.85)");
    expect(th.glowBlending).toBe(DARK_3D.glowBlending);
    expect(sceneTheme(false, { background: [250, 244, 230], text: [60, 50, 40] }).text).toBe("rgba(60,50,40,1)");
  });

  it("falls back to the built-in palette when the host has no theme colours", () => {
    expect(sceneTheme(true, null)).toBe(DARK_3D);
    expect(sceneTheme(false, null)).toBe(LIGHT_3D);
  });
});
