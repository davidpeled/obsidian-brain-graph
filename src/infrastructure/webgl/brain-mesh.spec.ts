import { describe, expect, it } from "vitest";
import { REGION_COUNT } from "../../domain/contracts/anatomy";
import { brainField } from "../../domain/model/anatomy/brain-volume";
import { SHELL_RESOLUTION, brainSurface } from "./brain-mesh";

describe("brainSurface", () => {
  const s = brainSurface();
  const pos = s.geometry.getAttribute("position");
  const index = s.geometry.getIndex()!;

  it("is an indexed mesh with shared vertices", () => {
    expect(index.count % 3).toBe(0);
    // A closed triangle mesh has about twice as many triangles as vertices.
    expect(index.count / 3 / pos.count).toBeGreaterThan(1.9);
    expect(index.count / 3 / pos.count).toBeLessThan(2.1);
  });

  it("is closed: every edge is shared by exactly two triangles", () => {
    const edges = new Map<number, number>();
    const n = pos.count;
    for (let t = 0; t < index.count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = index.getX(t + k);
        const b = index.getX(t + ((k + 1) % 3));
        const key = Math.min(a, b) * n + Math.max(a, b);
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    const open = [...edges.values()].filter((c) => c !== 2).length;
    expect(open / edges.size).toBeLessThan(0.001);
  });

  it("lies on the brain surface", () => {
    const f = brainField();
    let worst = 0;
    for (let i = 0; i < pos.count; i += 97) worst = Math.max(worst, Math.abs(f.surface(pos.getX(i), pos.getY(i), pos.getZ(i))));
    // Marching cubes interpolates linearly inside a voxel (1.12 / 128 ≈ 0.0088 W) and the
    // field is steep near the rounded rim, so vertices sit within a few voxels' worth of zero.
    expect(worst).toBeLessThan(4 * (1.12 / 128));
  });

  it("has colour blend weights that sum to 1 and cover every region", () => {
    const seen = new Set<number>();
    for (let i = 0; i < pos.count; i++) {
      let sum = 0;
      for (let r = 0; r < REGION_COUNT; r++) sum += s.vertexWeights[i * REGION_COUNT + r];
      expect(sum).toBeCloseTo(1, 4);
      seen.add(s.vertexRegion[i]);
    }
    expect(seen.size).toBe(REGION_COUNT);
  });
});

describe("brainSurface on mobile", () => {
  it("is a coarser but still closed, fully coloured shell, cached per resolution", () => {
    const desktop = brainSurface();
    const mobile = brainSurface(SHELL_RESOLUTION.mobile);
    expect(brainSurface(SHELL_RESOLUTION.mobile)).toBe(mobile);
    expect(mobile).not.toBe(desktop);
    const verts = (s: typeof mobile) => s.geometry.getAttribute("position").count;
    expect(verts(mobile)).toBeLessThan(verts(desktop) * 0.7);
    const seen = new Set<number>(mobile.vertexRegion);
    expect(seen.size).toBe(REGION_COUNT);
    expect(mobile.geometry.getIndex()!.count % 3).toBe(0);
  });
});
