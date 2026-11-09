import { describe, expect, it } from "vitest";
import { PinchDelta } from "./pinch-gesture";
import { LONG_PRESS_MS, Schedule, TouchHost, TouchInteraction } from "./touch-interaction";

/** A controllable clock: `advance` runs timers that are due and not cancelled. */
function setup(menuShown = true) {
  const log: string[] = [];
  let now = 0;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const schedule: Schedule = (fn, ms) => {
    const t = { at: now + ms, fn, live: true };
    timers.push(t);
    return () => {
      t.live = false;
    };
  };
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers) {
      if (!t.live || t.at > now) continue;
      t.live = false;
      t.fn();
    }
  };
  const host: TouchHost = {
    pointerDown: (x, y, _b, _p, touch) => log.push(`down ${x},${y}${touch ? " touch" : ""}`),
    pointerMove: (x, y) => log.push(`move ${x},${y}`),
    pointerUp: () => log.push("up"),
    pointerCancel: () => log.push("cancel"),
    gesture: (g: PinchDelta) => log.push(`gesture ${g.scale.toFixed(1)}`),
    longPress: () => (log.push("longpress"), menuShown),
  };
  const at = { clientX: 0, clientY: 0 };
  return { t: new TouchInteraction(host, schedule), log, advance, at };
}

describe("TouchInteraction", () => {
  it("forwards one finger as a press, drag and release", () => {
    const { t, log, at } = setup();
    t.down(1, 10, 10, at);
    t.move(1, 30, 10);
    expect(t.up(1)).toBe(true);
    expect(log).toEqual(["down 10,10 touch", "move 30,10", "up"]);
  });

  it("opens the menu after a still hold, then ignores the lift (no tap)", () => {
    const { t, log, advance, at } = setup();
    t.down(1, 10, 10, at);
    advance(LONG_PRESS_MS);
    expect(t.ownsContextMenu).toBe(true);
    expect(t.up(1)).toBe(false);
    expect(log).toEqual(["down 10,10 touch", "longpress"]);
    expect(t.ownsContextMenu).toBe(false);
  });

  it("does not mute when the long-press found no neuron, so the tap still works", () => {
    const { t, advance, at } = setup(false);
    t.down(1, 10, 10, at);
    advance(LONG_PRESS_MS);
    expect(t.up(1)).toBe(true);
  });

  it("cancels the long-press as soon as the finger moves past the drag threshold", () => {
    const { t, log, advance, at } = setup();
    t.down(1, 10, 10, at);
    t.move(1, 12, 10); // jitter below the threshold keeps it armed
    t.move(1, 20, 10); // a drag
    advance(LONG_PRESS_MS * 2);
    expect(log).not.toContain("longpress");
  });

  it("cancels the press and the timer when a second finger lands, and stays muted until all lift", () => {
    const { t, log, advance, at } = setup();
    t.down(1, 100, 100, at);
    t.down(2, 200, 100, at);
    advance(LONG_PRESS_MS * 2);
    expect(log).toEqual(["down 100,100 touch", "cancel"]);
    t.move(1, 100, 100);
    t.move(2, 300, 100);
    expect(log.filter((l) => l.startsWith("gesture")).length).toBe(1);
    expect(t.up(2)).toBe(false);
    t.move(1, 140, 100); // the remaining finger must not move the view
    expect(log.some((l) => l.startsWith("move"))).toBe(false);
    expect(t.up(1)).toBe(false);
    // All fingers up: the next touch works normally again.
    t.down(3, 5, 5, at);
    expect(t.up(3)).toBe(true);
  });

  it("releases and un-mutes on cancel, and dispose stops a pending long-press", () => {
    const a = setup();
    a.t.down(1, 10, 10, a.at);
    a.t.cancel(1);
    expect(a.log.at(-1)).toBe("cancel");
    const b = setup();
    b.t.down(1, 10, 10, b.at);
    b.t.dispose();
    b.advance(LONG_PRESS_MS);
    expect(b.log).not.toContain("longpress");
  });
});
