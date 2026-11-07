import { describe, expect, it } from "vitest";
import { PARA_VAULT, structure, vault } from "../../../test-support/fixtures";
import { RegionVolume } from "../anatomy/brain-volume";
import { buildConnectome } from "../connectome/connectome.builder";
import { mulberry32 } from "../shared/random";
import { ActionPotentials, MAX_PULSES } from "./action-potentials";
import { requiredScale } from "./brain-scale";
import { LayoutSimulation } from "./layout.simulation";
import { placeNeurons } from "./placement";

const unit = new RegionVolume(1);

function grow(snapshot = PARA_VAULT) {
  const c = buildConnectome(snapshot, structure());
  const volume = new RegionVolume(requiredScale(c, unit));
  placeNeurons(c, volume, mulberry32(1));
  return { c, volume };
}

describe("requiredScale", () => {
  it("is 1 for small vaults and grows with the most crowded region", () => {
    expect(requiredScale(buildConnectome(PARA_VAULT, structure()), unit)).toBe(1);
    const archive = vault(Array.from({ length: 2000 }, (_, i) => `Archive/${i}.md`).concat("Projects/p.md"));
    const crowded = requiredScale(buildConnectome(archive, structure()), unit);
    const spread = requiredScale(buildConnectome(archive, structure({ layoutMode: "free" })), unit);
    expect(crowded).toBeGreaterThan(spread);
  });
});

describe("placement and layout", () => {
  it("places every neuron in its own lobe and keeps it there", () => {
    const { c, volume } = grow();
    const inside = () => c.neurons.every((n) => volume.allows(n.allowed, n.x, n.y, n.z));
    expect(inside()).toBe(true);
    const sim = new LayoutSimulation(c, volume, mulberry32(2));
    for (let i = 0; i < 400 && sim.running; i++) sim.tick();
    expect(inside()).toBe(true);
    expect(sim.running).toBe(false);
  });

  it("uses both hemispheres", () => {
    const big = vault(Array.from({ length: 40 }, (_, i) => `Projects/p${i % 8}/n${i}.md`).concat("Areas/a.md"));
    const { c } = grow(big);
    expect(c.neurons.some((n) => n.z > 0)).toBe(true);
    expect(c.neurons.some((n) => n.z < 0)).toBe(true);
  });

  it("carries previous positions over when they are still valid", () => {
    const { c, volume } = grow();
    const positions = new Map(c.neurons.map((n) => [n.path, { x: n.x, y: n.y, z: n.z }]));
    const again = buildConnectome(PARA_VAULT, structure());
    placeNeurons(again, volume, mulberry32(99), { positions, ratio: 1 });
    expect(again.neurons.map((n) => [n.x, n.y, n.z])).toEqual(c.neurons.map((n) => [n.x, n.y, n.z]));
  });

  it("refuses to drag a neuron out of its lobe", () => {
    const { c, volume } = grow();
    const sim = new LayoutSimulation(c, volume, mulberry32(3));
    const n = c.neurons.find((x) => x.category === "projects")!;
    const { x, y, z } = n;
    sim.drag(n, volume.W * 0.9, volume.H * 0.4, z); // occipital
    expect([n.x, n.y, n.z]).toEqual([x, y, z]);
    sim.drag(n, x, y, 0); // midline fissure
    expect([n.x, n.y, n.z]).toEqual([x, y, z]);
    expect(n.fixed).toBe(true);
    sim.release(n);
    expect(n.fixed).toBe(false);
  });
});

describe("ActionPotentials", () => {
  const quiet = { ambient: false, rate: 1, speedScale: 1 };

  it("fires along synapses and activates the target on arrival", () => {
    const { c } = grow();
    const firing = new ActionPotentials(c, mulberry32(4));
    const plan = c.neurons.findIndex((n) => n.name === "Plan");
    firing.fire(plan, 0);
    expect(c.neurons[plan].activation).toBe(1);
    expect(firing.pulses).toHaveLength(2);
    for (let i = 0; i < 200 && firing.pulses.length; i++) firing.step(0.05, quiet);
    expect(firing.pulses).toHaveLength(0);
    const copy = c.neurons.find((n) => n.name === "Copy")!;
    expect(copy.activation).toBeGreaterThan(0);
  });

  it("cascades only while depth remains", () => {
    const chain = vault(["A/a.md", "A/b.md", "A/c.md"], [
      ["A/a.md", "A/b.md"],
      ["A/b.md", "A/c.md"],
    ]);
    const { c } = grow(chain);
    const ap = new ActionPotentials(c, () => 0); // rng 0: always propagate
    ap.fire(0, 0);
    for (let i = 0; i < 100 && ap.pulses.length; i++) ap.step(0.05, quiet);
    expect(c.neurons[2].activation).toBe(0);
    ap.fire(0, 1);
    for (let i = 0; i < 100 && ap.pulses.length; i++) ap.step(0.05, quiet);
    expect(c.neurons[2].activation).toBeGreaterThan(0);
  });

  it("emits ambient pulses but never exceeds the cap", () => {
    const { c } = grow();
    const ap = new ActionPotentials(c, mulberry32(5));
    ap.step(1, { ambient: true, rate: 10, speedScale: 0 });
    expect(ap.pulses.length).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) ap.step(1, { ambient: true, rate: 10, speedScale: 0 });
    expect(ap.pulses.length).toBeLessThanOrEqual(MAX_PULSES);
  });
});
