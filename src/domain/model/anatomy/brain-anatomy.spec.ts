import { describe, expect, it } from "vitest";
import {
  CEREBRUM_BITS,
  REGION_COUNT,
  R_BRAINSTEM,
  R_CEREBELLUM,
  R_FRONTAL,
  R_OCCIPITAL,
  R_PARIETAL,
  R_TEMPORAL,
  regionBit,
} from "../../contracts/anatomy";
import { mulberry32 } from "../shared/random";
import { OUTLINES, regionAtNormalised } from "./brain-anatomy";
import { DEPTH_EXTENT, GRID, MIDLINE_GAP, RegionVolume, brainField, exactSignedDistance, signedDistanceField } from "./brain-volume";

describe("side-view classification", () => {
  it.each([
    [0.15, 0.4, R_FRONTAL],
    [0.6, 0.25, R_PARIETAL],
    [0.45, 0.68, R_TEMPORAL],
    [0.9, 0.4, R_OCCIPITAL],
    [0.8, 0.8, R_CEREBELLUM],
    [0.62, 0.93, R_BRAINSTEM],
    [0.02, 0.02, -1],
  ])("(%f, %f) -> region %i", (x, y, region) => expect(regionAtNormalised(x, y)).toBe(region));
});

describe("RegionVolume", () => {
  const vol = new RegionVolume(1);
  const { W, H } = vol;

  it("gives every region volume, the frontal lobe more than the cerebellum", () => {
    for (let r = 0; r < REGION_COUNT; r++) expect(vol.regionVolume[r]).toBeGreaterThan(0);
    expect(vol.regionVolume[R_FRONTAL]).toBeGreaterThan(vol.regionVolume[R_CEREBELLUM]);
  });

  it("scales volume with scale³", () => {
    const big = new RegionVolume(2);
    expect(big.regionVolume[R_TEMPORAL] / vol.regionVolume[R_TEMPORAL]).toBeCloseTo(8, 5);
  });

  it("has two hemispheres separated by the midline fissure", () => {
    const x = 0.15 * W;
    const y = 0.4 * H;
    expect(vol.regionAt(x, y, 0)).toBe(-1);
    expect(vol.regionAt(x, y, 0.1 * W)).toBe(R_FRONTAL);
    expect(vol.regionAt(x, y, -0.1 * W)).toBe(R_FRONTAL);
    expect(vol.regionAt(x, y, (DEPTH_EXTENT + 0.01) * W)).toBe(-1);
  });

  it("is thicker in the middle of a lobe than near its outline", () => {
    const f = brainField();
    // Far from the midline, the surface value is governed by the half-thickness.
    const z = MIDLINE_GAP + 0.2;
    const inner = f.surface(0.25, 0.3 * 0.76, z);
    const edge = f.surface(0.06, 0.45 * 0.76, z);
    expect(inner).toBeGreaterThan(0);
    expect(edge).toBeLessThan(0);
  });

  it("samples and spreads anchors inside the requested regions only", () => {
    const rng = mulberry32(7);
    for (const bits of [regionBit(R_OCCIPITAL), regionBit(R_CEREBELLUM), CEREBRUM_BITS]) {
      for (let i = 0; i < 200; i++) {
        const p = vol.sample(bits, rng);
        expect(vol.allows(bits, p.x, p.y, p.z)).toBe(true);
      }
    }
    const anchors = vol.spreadAnchors(regionBit(R_TEMPORAL), 6, rng);
    expect(anchors).toHaveLength(6);
    for (const a of anchors) expect(vol.regionAt(a.x, a.y, a.z)).toBe(R_TEMPORAL);
    expect(new Set(anchors.map((a) => `${a.x},${a.y},${a.z}`)).size).toBe(6);
  });

  it("reports region bounds in 3D", () => {
    const b = vol.regionBounds(regionBit(R_FRONTAL))!;
    expect(b.max.x).toBeLessThan(W * 0.55);
    expect(b.min.z).toBeLessThan(0);
    expect(b.max.z).toBeGreaterThan(0);
  });
});

describe("signedDistanceField", () => {
  it.each(["cerebrum", "cerebellum", "brainstem"] as const)("matches the exact distance for every cell of the %s", (part) => {
    const { GW, GH, CELL } = GRID;
    const fast = signedDistanceField(OUTLINES[part]);
    let maxErr = 0;
    let signFlips = 0;
    for (let c = 0; c < GW * GH; c++) {
      const exact = exactSignedDistance(OUTLINES[part], ((c % GW) + 0.5) * CELL, (Math.floor(c / GW) + 0.5) * CELL);
      maxErr = Math.max(maxErr, Math.abs(Math.abs(fast[c]) - Math.abs(exact)));
      if (Math.sign(fast[c]) !== Math.sign(exact)) signFlips++;
    }
    expect(signFlips).toBe(0);
    expect(maxErr).toBeLessThan(CELL * 0.1); // measured ≈ 0.07 of a cell
  });
});
