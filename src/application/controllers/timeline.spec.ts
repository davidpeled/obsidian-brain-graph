import { describe, expect, it } from "vitest";
import type { Neuron } from "../../domain/contracts/connectome";
import { FrameBuffer } from "../mappers/scene.mapper";
import { TIMELINE_PLAY_SECONDS, Timeline } from "./timeline";

const DAY = 864e5;
const at = (...created: number[]) => created.map((c) => ({ created: c }) as Neuron);

describe("Timeline", () => {
  it("shows every neuron while inactive", () => {
    const t = new Timeline();
    t.rebase(at(DAY, 2 * DAY, 3 * DAY));
    expect([0, 1, 2].map((i) => t.presence(i))).toEqual([1, 1, 1]);
    expect(t.signature).toBe(-1);
  });

  it("opens on the whole brain, and playing starts from an empty one", () => {
    const t = new Timeline();
    t.rebase(at(DAY, 2 * DAY, 10 * DAY));
    t.setActive(true);
    expect([0, 1, 2].map((i) => t.presence(i))).toEqual([1, 1, 1]);
    t.play();
    expect([0, 1, 2].map((i) => t.presence(i))).toEqual([0, 0, 0]);
    expect(t.playing).toBe(true);
  });

  it("brings neurons in creation order and stops at the end", () => {
    const t = new Timeline();
    t.rebase(at(DAY, 2 * DAY, 10 * DAY));
    t.setActive(true);
    t.play();
    t.step(TIMELINE_PLAY_SECONDS / 2);
    expect(t.presence(0)).toBe(1);
    expect(t.presence(1)).toBe(1);
    expect(t.presence(2)).toBe(0);
    t.step(TIMELINE_PLAY_SECONDS);
    expect(t.playing).toBe(false);
    expect(t.presence(2)).toBe(1); // the newest note is fully there at the end
    expect(t.view().shown).toBe(3);
  });

  it("scrubs in both directions and pauses playback", () => {
    const t = new Timeline();
    t.rebase(at(DAY, 2 * DAY, 10 * DAY));
    t.setActive(true);
    t.play();
    t.seek(0);
    expect(t.playing).toBe(false);
    expect(t.view().shown).toBe(0);
    t.seek(1);
    expect(t.view().shown).toBe(3);
    t.seek(-5);
    expect(t.view().progress).toBe(0);
  });

  it("treats notes without a date as the oldest", () => {
    const t = new Timeline();
    t.rebase(at(0, 5 * DAY, 9 * DAY));
    t.setActive(true);
    t.seek(0);
    expect(t.presence(0)).toBe(1);
    expect(t.presence(1)).toBe(0);
  });

  it("handles very large vaults (no argument-spread limits)", () => {
    const t = new Timeline();
    const many = Array.from({ length: 300_000 }, (_, i) => ({ created: DAY + i * 1000 }) as Neuron);
    expect(() => t.rebase(many)).not.toThrow();
    t.setActive(true);
    t.seek(0.5);
    expect(t.view().shown).toBeGreaterThan(100_000);
    expect(t.view().shown).toBeLessThan(200_000);
  });

  it("answers who is born yet", () => {
    const t = new Timeline();
    t.rebase(at(DAY, 10 * DAY));
    expect(t.born(1)).toBe(true); // inactive: everyone
    t.setActive(true);
    t.seek(0);
    expect([t.born(0), t.born(1)]).toEqual([false, false]);
    t.seek(1);
    expect([t.born(0), t.born(1)]).toEqual([true, true]);
  });

  it("is unavailable without dates or spread", () => {
    const t = new Timeline();
    t.rebase(at(0, 0));
    expect(t.available).toBe(false);
    t.rebase(at(DAY, DAY));
    expect(t.available).toBe(false);
    t.rebase(at(DAY, 2 * DAY));
    expect(t.available).toBe(true);
  });

  it("keeps its place across a rebuild, and stays at the end when it was there", () => {
    const t = new Timeline();
    t.rebase(at(DAY, 11 * DAY));
    t.setActive(true);
    t.rebase(at(DAY, 11 * DAY, 20 * DAY));
    expect(t.view().shown).toBe(3);
  });
});

describe("FrameBuffer with a timeline", () => {
  it("bumps the layout version when the set of born neurons changes", () => {
    const t = new Timeline();
    t.rebase(at(DAY, 5 * DAY));
    t.setActive(true);
    const fb = new FrameBuffer();
    const state = { connectome: { neurons: [{}, {}] as Neuron[], synapses: [] }, firing: { pulses: [] } } as never;
    const a = fb.write(state, t).layoutVersion;
    expect(fb.write(state, t).layoutVersion).toBe(a);
    t.seek(0);
    expect(fb.write(state, t).layoutVersion).toBeGreaterThan(a);
  });
});
