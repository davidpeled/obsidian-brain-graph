import { describe, expect, it, vi } from "vitest";
import { buildConnectome } from "../../domain/model/connectome/connectome.builder";
import { PARA_VAULT, structure } from "../../test-support/fixtures";
import { Highlight } from "./highlight";

const c = buildConnectome(PARA_VAULT, structure());
const idx = (name: string) => c.neurons.findIndex((n) => n.name === name);

describe("Highlight", () => {
  it("focuses the hovered neuron and its neighbours, over search hits", () => {
    const h = new Highlight();
    h.search("habit", c);
    expect([...h.focus()!]).toEqual([idx("Atomic Habits")]);
    h.setHover(idx("Plan"), c);
    expect(h.focus()).toEqual(new Set([idx("Plan"), ...c.neurons[idx("Plan")].neighbors]));
    h.setHover(-1, c);
    expect([...h.focus()!]).toEqual([idx("Atomic Habits")]);
  });

  it("bumps its version on real changes only, and notifies hover listeners", () => {
    const h = new Highlight();
    const listener = vi.fn();
    h.onHoverChanged(listener);
    const v0 = h.version;
    h.setHover(idx("Plan"), c);
    h.setHover(idx("Plan"), c); // no-op
    expect(h.version).toBe(v0 + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    h.search("copy", c);
    expect(h.version).toBe(v0 + 2);
  });

  it("rebases onto a rebuilt connectome by path", () => {
    const h = new Highlight();
    h.setHover(idx("Plan"), c);
    h.search("plan", c);
    const shifted = buildConnectome({ ...PARA_VAULT, notes: [{ path: "0.md", basename: "0" }, ...PARA_VAULT.notes] }, structure());
    const index = new Map(shifted.neurons.map((n, i) => [n.path, i]));
    h.rebase(shifted, (p) => (p ? (index.get(p) ?? -1) : -1));
    expect(shifted.neurons[h.hover].name).toBe("Plan");
    expect([...h.matches!].map((i) => shifted.neurons[i].name)).toEqual(["Plan"]);
  });

  it("drops a hover whose note disappeared", () => {
    const h = new Highlight();
    h.setHover(idx("Plan"), c);
    const without = buildConnectome({ ...PARA_VAULT, notes: PARA_VAULT.notes.filter((n) => !n.path.endsWith("Plan.md")) }, structure());
    h.rebase(without, () => -1);
    expect(h.hover).toBe(-1);
    expect(h.focus()).toBeNull();
  });
});
