import { describe, expect, it } from "vitest";
import { R_CEREBELLUM, R_FRONTAL, R_OCCIPITAL, R_PARIETAL, R_TEMPORAL } from "../../domain/contracts/anatomy";
import { COLOR_PRESETS, DEFAULT_COLOR_PRESET } from "../contracts/color-presets";
import { isStructuralChange } from "../contracts/settings";
import { buildConnectome } from "../../domain/model/connectome/connectome.builder";
import { PARA_VAULT, settings } from "../../test-support/fixtures";
import { parseHex, regionColors, toPalette } from "./palette.mapper";

describe("palette", () => {
  it("parses 6- and 3-digit hex colours", () => {
    expect(parseHex("#8ea2ff")).toEqual([142, 162, 255]);
    expect(parseHex("89F")).toEqual([136, 153, 255]);
    expect(parseHex("blue")).toBeNull();
  });

  it("maps each PARA colour setting to its region", () => {
    const c = regionColors(settings({ colorProjects: "#ff0000", colorAreas: "#00ff00", colorResources: "#0000ff", colorArchive: "#ffffff", colorOther: "#000000" }));
    expect(c[R_FRONTAL]).toEqual([255, 0, 0]);
    expect(c[R_PARIETAL]).toEqual([0, 255, 0]);
    expect(c[R_TEMPORAL]).toEqual([0, 0, 255]);
    expect(c[R_CEREBELLUM]).toEqual([255, 255, 255]);
    expect(c[R_OCCIPITAL]).toEqual([0, 0, 0]);
  });

  it("falls back to the default preset for a malformed colour", () => {
    expect(regionColors(settings({ colorAreas: "not a colour" }))[R_PARIETAL]).toEqual(parseHex(DEFAULT_COLOR_PRESET.colors.colorAreas));
  });

  it("colours PARA neurons by their region's configured colour", () => {
    const c = buildConnectome(PARA_VAULT, settings());
    const p = toPalette(c, settings({ colorProjects: "#123456" }));
    const plan = c.neurons.findIndex((n) => n.name === "Plan");
    expect(p.colors[p.colorOf[plan]]).toEqual([0x12, 0x34, 0x56]);
  });

  it("ships valid presets, and colour changes never need a rebuild", () => {
    for (const preset of COLOR_PRESETS) for (const hex of Object.values(preset.colors)) expect(parseHex(hex), `${preset.id} ${hex}`).not.toBeNull();
    expect(isStructuralChange(settings(), { colorProjects: "#000000", colorPreset: "custom" })).toBe(false);
  });
});
