import { describe, expect, it } from "vitest";
import { OrbitCamera } from "./orbit-camera";

describe("OrbitCamera", () => {
  const cam = () => {
    const c = new OrbitCamera();
    c.resize(800, 600);
    c.fit({ x: 500, y: 380, z: 0 }, 600, false);
    return c;
  };
  const p = { x: 420, y: 300, z: 90 };

  it("projectTo matches project and round-trips through unproject", () => {
    const c = cam();
    const out = { x: 0, y: 0, depth: 0, scale: 0 };
    expect(c.projectTo(p, out)).toBe(true);
    expect(out).toEqual(c.project(p));
    const back = c.unproject(out.x, out.y, out.depth);
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
    expect(back.z).toBeCloseTo(p.z, 6);
  });

  it("recomputes its cached basis whenever the pose changes", () => {
    const c = cam();
    const before = c.project(p)!;
    for (const change of [
      () => (c.yaw += 0.3),
      () => (c.pitch -= 0.2),
      () => (c.distance *= 0.8),
      () => (c.target = { ...c.target, x: c.target.x + 40 }),
      () => c.orbit(25, -10),
      () => c.pan(30, 12),
      () => c.autoRotate(0.5),
    ]) {
      const a = c.project(p)!;
      change();
      const b = c.project(p)!;
      expect(b.x !== a.x || b.y !== a.y || b.depth !== a.depth).toBe(true);
    }
    expect(c.project(p)).not.toEqual(before);
  });

  it("reports points behind the camera", () => {
    const c = cam();
    const eye = c.eye;
    const behind = { x: eye.x + (eye.x - c.target.x), y: eye.y + (eye.y - c.target.y), z: eye.z + (eye.z - c.target.z) };
    expect(c.project(behind)).toBeNull();
    expect(c.projectTo(behind, { x: 0, y: 0, depth: 0, scale: 0 })).toBe(false);
  });
});
