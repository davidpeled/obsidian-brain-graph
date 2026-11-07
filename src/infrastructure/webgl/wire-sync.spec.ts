import { describe, expect, it } from "vitest";
import { WireSync, WireTracker } from "./wire-sync";

describe("WireSync", () => {
  it("writes everything first, then nothing until something changes", () => {
    const s = new WireSync();
    expect(s.take(true)).toEqual({ positions: true, colors: true });
    s.mark(false, false);
    expect(s.take(true)).toBeNull();
    s.mark(true, false);
    expect(s.take(true)).toEqual({ positions: true, colors: false });
  });

  it("remembers changes made while hidden and flushes them when shown", () => {
    // Dendrites off → a neuron is dragged → layout settles → dendrites on.
    const s = new WireSync();
    s.take(true);
    s.mark(true, false); // dragged while hidden
    expect(s.take(false)).toBeNull();
    s.mark(false, false); // settled: nothing moves any more
    expect(s.take(false)).toBeNull();
    expect(s.take(true)).toEqual({ positions: true, colors: false });
    expect(s.take(true)).toBeNull();
  });

  it("is fully stale after a reset", () => {
    const s = new WireSync();
    s.take(true);
    s.reset();
    expect(s.take(true)).toEqual({ positions: true, colors: true });
  });
});

describe("WireTracker", () => {
  const all = { positions: true, colors: true };

  it("writes both layers on the first frame, then only what the versions say changed", () => {
    const t = new WireTracker();
    expect(t.frame(1, 1, true)).toEqual({ synapses: all, dendrites: all });
    expect(t.frame(1, 1, true)).toEqual({ synapses: null, dendrites: null });
    expect(t.frame(2, 1, true)).toEqual({ synapses: { positions: true, colors: false }, dendrites: { positions: true, colors: false } });
    expect(t.frame(2, 2, true)).toEqual({ synapses: { positions: false, colors: true }, dendrites: { positions: false, colors: true } });
  });

  it("redraws dendrites at the new positions when they are turned back on (the stale-dendrites bug)", () => {
    const t = new WireTracker();
    t.frame(1, 1, true);
    // Dendrites off, a neuron is dragged (layout moves for a few frames), then it settles.
    expect(t.frame(1, 1, false).dendrites).toBeNull();
    expect(t.frame(2, 1, false)).toEqual({ synapses: { positions: true, colors: false }, dendrites: null });
    expect(t.frame(3, 1, false).dendrites).toBeNull();
    expect(t.frame(3, 1, false)).toEqual({ synapses: null, dendrites: null });
    // Turned back on with nothing moving this frame: the hidden moves are still flushed.
    expect(t.frame(3, 1, true)).toEqual({ synapses: null, dendrites: { positions: true, colors: false } });
    expect(t.frame(3, 1, true).dendrites).toBeNull();
  });

  it("remembers focus changes made while dendrites were hidden", () => {
    const t = new WireTracker();
    t.frame(1, 1, true);
    t.frame(1, 2, false);
    expect(t.frame(1, 2, true).dendrites).toEqual({ positions: false, colors: true });
  });

  it("rewrites everything after a reset, even with unchanged versions", () => {
    const t = new WireTracker();
    t.frame(1, 1, true);
    t.reset();
    expect(t.frame(1, 1, true)).toEqual({ synapses: all, dendrites: all });
  });
});
