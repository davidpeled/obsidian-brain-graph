import { describe, expect, it } from "vitest";
import { PinchGesture } from "./pinch-gesture";

describe("PinchGesture", () => {
  it("reports nothing for a single finger", () => {
    const g = new PinchGesture();
    g.down(1, 10, 10);
    expect(g.move(1, 20, 20)).toBeNull();
    expect(g.active).toBe(false);
  });

  it("reports the zoom ratio and midpoint when two fingers spread", () => {
    const g = new PinchGesture();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    expect(g.active).toBe(true);
    expect(g.move(2, 200, 100)).toBeNull(); // first reading is the baseline
    const d = g.move(2, 300, 100)!;
    expect(d.scale).toBeCloseTo(2);
    expect(d.cx).toBe(200);
    expect(d.dx).toBe(50);
    expect(d.dy).toBe(0);
  });

  it("reports a pan when both fingers move together", () => {
    const g = new PinchGesture();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    g.move(1, 100, 100);
    // Events arrive one finger at a time; the deltas still add up to a pure pan.
    const a = g.move(1, 100, 130)!;
    const b = g.move(2, 200, 130)!;
    expect(a.scale * b.scale).toBeCloseTo(1);
    expect(a.dy + b.dy).toBeCloseTo(30);
    expect(a.dx + b.dx).toBeCloseTo(0);
  });

  it("re-baselines when a finger lifts, so the remaining finger does not jump", () => {
    const g = new PinchGesture();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    g.move(1, 100, 100);
    g.up(2);
    expect(g.active).toBe(false);
    expect(g.size).toBe(1);
    g.down(3, 400, 400);
    expect(g.move(3, 400, 400)).toBeNull();
  });
});
