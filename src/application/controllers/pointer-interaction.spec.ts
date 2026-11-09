import { describe, expect, it } from "vitest";
import { DRAG_THRESHOLD, PointerHost, PointerInteraction } from "./pointer-interaction";

/** A host where neuron 7 sits under (100, 100) and everything else is empty. */
function host() {
  const log: string[] = [];
  let hovered = -1;
  const h: PointerHost = {
    hitTest: (sx, sy, touch) => (Math.hypot(sx - 100, sy - 100) < (touch ? 20 : 10) ? 7 : -1),
    hovered: () => hovered,
    select: (i) => {
      hovered = i;
      log.push(`select ${i}`);
    },
    positionOf: (i) => (i === 7 ? { x: 0, y: 0, z: 0 } : undefined),
    orbit: (dx, dy) => log.push(`orbit ${dx},${dy}`),
    pan: (dx, dy) => log.push(`pan ${dx},${dy}`),
    dragNeuron: (i, sx, sy) => log.push(`drag ${i} ${sx},${sy}`),
    releaseNeuron: (i) => log.push(`release ${i}`),
    hover: (i) => {
      hovered = i;
      log.push(`hover ${i}`);
    },
    click: (i, tab) => log.push(`click ${i}${tab ? " tab" : ""}`),
  };
  return { p: new PointerInteraction(h), log };
}

describe("PointerInteraction", () => {
  it("clicks a neuron pressed without moving past the threshold", () => {
    const { p, log } = host();
    p.down(100, 100, 0);
    p.move(100 + DRAG_THRESHOLD - 1, 100);
    p.up(true);
    expect(log).toEqual(["release 7", "click 7 tab"]);
  });

  it("drags a neuron (and keeps it hovered) instead of clicking once moved", () => {
    const { p, log } = host();
    p.down(100, 100, 0);
    p.move(120, 100);
    p.up(false);
    expect(log).toEqual(["drag 7 120,100", "hover 7", "release 7"]);
  });

  it("orbits on empty space, pans with the modifier or other buttons, by incremental deltas", () => {
    const a = host();
    a.p.down(10, 10, 0);
    a.p.move(20, 10);
    a.p.move(25, 13);
    a.p.up(false);
    expect(a.log).toEqual(["orbit 10,0", "orbit 5,3"]);
    for (const [button, mod] of [[0, true], [1, false], [2, false]] as const) {
      const b = host();
      b.p.down(100, 100, button, mod); // even on a neuron
      b.p.move(110, 100);
      b.p.up(false);
      expect(b.log).toEqual(["pan 10,0"]);
    }
  });

  it("hovers when moving without a press, and is inactive", () => {
    const { p, log } = host();
    p.move(100, 100);
    p.move(300, 300);
    expect(log).toEqual(["hover 7", "hover -1"]);
    expect(p.active).toBe(false);
  });

  it("releases without clicking when cancelled", () => {
    const { p, log } = host();
    p.down(100, 100, 0);
    expect(p.active).toBe(true);
    p.cancel();
    p.up(false);
    expect(log).toEqual(["release 7"]);
  });

  it("never clicks with a non-primary button", () => {
    const { p, log } = host();
    p.down(100, 100, 2);
    p.up(false);
    expect(log).toEqual([]);
  });

  describe("touch", () => {
    it("first tap selects the neuron, a second tap opens it", () => {
      const { p, log } = host();
      p.down(100, 100, 0, false, true);
      p.up(false);
      expect(log).toEqual(["select 7"]);
      p.down(100, 100, 0, false, true);
      p.up(false);
      expect(log).toEqual(["select 7", "click 7"]);
    });

    it("a mouse resting on the neuron doesn't make the first tap open it (touch laptops)", () => {
      const { p, log } = host();
      p.move(100, 100); // hover 7
      p.down(100, 100, 0, false, true);
      p.up(false);
      expect(log).toEqual(["hover 7", "select 7"]);
    });

    it("clearSelection forgets the selection, so the next tap selects again", () => {
      const { p, log } = host();
      p.down(100, 100, 0, false, true);
      p.up(false);
      expect(p.clearSelection()).toBe(true);
      expect(p.clearSelection()).toBe(false);
      p.down(100, 100, 0, false, true);
      p.up(false);
      expect(log).toEqual(["select 7", "select 7"]);
    });

    it("tapping empty space clears the selection", () => {
      const { p, log } = host();
      p.down(100, 100, 0, false, true);
      p.up(false);
      p.down(500, 500, 0, false, true); // empty space
      p.up(false);
      expect(log).toEqual(["select 7", "select -1"]);
    });

    it("uses the wider hit area for a finger", () => {
      const { p, log } = host();
      p.down(115, 100, 0, false, true); // 15px off: a miss for a mouse, a hit for a finger
      p.up(false);
      expect(log).toEqual(["select 7"]);
    });

    it("a drag starting on a neuron orbits instead of moving it, and does not select", () => {
      const { p, log } = host();
      p.down(100, 100, 0, false, true);
      p.move(120, 100);
      p.up(false);
      expect(log).toEqual(["orbit 20,0"]);
    });

    it("does nothing when cancelled", () => {
      const { p, log } = host();
      p.down(100, 100, 0, false, true);
      p.cancel();
      p.up(false);
      expect(log).toEqual([]);
    });
  });
});
