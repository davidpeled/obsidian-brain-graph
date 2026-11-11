import { realSchedule } from "../../test-support/schedule";
import { describe, expect, it, vi } from "vitest";
import { InMemorySettingsRepository } from "../../infrastructure/in-memory/in-memory-settings.repository";
import { InMemoryVaultRepository } from "../../infrastructure/in-memory/in-memory-vault.repository";
import { InMemoryWorkspaceGateway } from "../../infrastructure/in-memory/in-memory-workspace.gateway";
import { InMemoryContextMenu } from "../../infrastructure/in-memory/in-memory-context-menu";
import { mulberry32 } from "../../domain/model/shared/random";
import { R_FRONTAL, R_TEMPORAL } from "../../domain/contracts/anatomy";
import { PARA_VAULT } from "../../test-support/fixtures";
import { BrainController } from "../controllers/brain.controller";
import { Timeline } from "../controllers/timeline";
import { createBrainGraphService } from "../services/brain-graph.service";
import { createSettingsService } from "../services/settings.service";
import { FrameBuffer, toGraphView } from "./scene.mapper";

async function setup() {
  const settings = await createSettingsService(new InMemorySettingsRepository({ ambientFiring: false, autoRotate: false }));
  const graph = createBrainGraphService({ vault: new InMemoryVaultRepository(PARA_VAULT), settings, random: mulberry32(1), refreshDelayMs: 10, schedule: realSchedule });
  const controller = new BrainController({ graph, settings, workspace: new InMemoryWorkspaceGateway(), menu: new InMemoryContextMenu() });
  controller.resize(1000, 760);
  return { graph, controller };
}

describe("toGraphView", () => {
  it("captures the graph as plain data", async () => {
    const { graph } = await setup();
    const s = graph.state!;
    const g = toGraphView(s);
    const plan = s.connectome.neurons.findIndex((n) => n.name === "Plan");
    expect(g.count).toBe(s.connectome.neurons.length);
    expect(g.names[plan]).toBe("Plan");
    expect(g.degree[plan]).toBe(2);
    expect(g.region[plan]).toBe(R_FRONTAL);
    expect(g.synapseA.length).toBe(s.connectome.synapses.length);
    expect([...g.synapseCross].filter(Boolean)).toHaveLength(1);
    expect(g.regionUsed[R_FRONTAL]).toBe(true);
    expect(g.captions[R_FRONTAL]?.text).toBe("1. Projects");
    expect(g.captions[R_TEMPORAL]?.text).toBe("3. Resources");
  });

  it("gives every dendrite plane an orthonormal basis", async () => {
    const { graph } = await setup();
    const p = toGraphView(graph.state!).dendritePlane;
    for (let o = 0; o < p.length; o += 6) {
      const [ux, uy, uz, vx, vy, vz] = p.slice(o, o + 6);
      expect(Math.hypot(ux, uy, uz)).toBeCloseTo(1, 4);
      expect(Math.hypot(vx, vy, vz)).toBeCloseTo(1, 4);
      expect(ux * vx + uy * vy + uz * vz).toBeCloseTo(0, 4);
    }
  });
});

describe("timeline in the controller", () => {
  const dated = () => {
    const notes = PARA_VAULT.notes.map((n, i) => ({ ...n, created: (i + 1) * 864e5 }));
    return { ...PARA_VAULT, notes };
  };
  async function datedSetup() {
    const settings = await createSettingsService(new InMemorySettingsRepository({ ambientFiring: false, autoRotate: false }));
    const graph = createBrainGraphService({ vault: new InMemoryVaultRepository(dated()), settings, random: mulberry32(1), refreshDelayMs: 10, schedule: realSchedule });
    const controller = new BrainController({ graph, settings, workspace: new InMemoryWorkspaceGateway(), menu: new InMemoryContextMenu() });
    controller.resize(1000, 760);
    return { graph, controller };
  }

  it("hides unborn neurons from the scene and from picking", async () => {
    const { graph, controller } = await datedSetup();
    const s = graph.state!;
    const at = (i: number) => controller.camera.project(s.connectome.neurons[i])!;
    const target = s.connectome.neurons.length - 1;
    const p = at(target);
    controller.toggleTimeline();
    expect(controller.hitTest(p.x, p.y)).toBeGreaterThanOrEqual(0);
    controller.seekTimeline(0);
    const scene = controller.scene()!;
    expect([...scene.frame.presence].every((v) => v === 0)).toBe(true);
    expect(controller.hitTest(p.x, p.y)).toBe(-1);
    controller.seekTimeline(1);
    expect([...controller.scene()!.frame.presence].every((v) => v === 1)).toBe(true);
  });

  it("only fires and flies to neurons that exist", async () => {
    const { graph, controller } = await datedSetup();
    controller.toggleTimeline();
    controller.seekTimeline(0);
    controller.fireRandom();
    expect(graph.state!.firing.pulses).toHaveLength(0);
    expect(graph.state!.connectome.neurons.every((n) => n.activation === 0)).toBe(true);
    controller.search("Plan");
    const eye = { ...controller.camera.target };
    controller.focusFirstMatch();
    expect(controller.camera.target).toEqual(eye); // nothing born: no fly-to
  });

  it("is unavailable when notes have no dates", async () => {
    const { controller } = await setup();
    expect(controller.timelineView().available).toBe(false);
  });
});

describe("frame and versions", () => {
  it("copies positions and activation, reusing its buffers", async () => {
    const { graph } = await setup();
    const fb = new FrameBuffer();
    const s = graph.state!;
    const a = fb.write(s, new Timeline());
    s.connectome.neurons[0].x += 5;
    s.connectome.neurons[0].activation = 0.7;
    const b = fb.write(s, new Timeline());
    expect(b.positions).toBe(a.positions);
    expect(b.positions[0]).toBeCloseTo(s.connectome.neurons[0].x, 3);
    expect(b.activation[0]).toBeCloseTo(0.7, 5);
  });

  it("bumps layoutVersion while the layout moves and stops once it settles", async () => {
    const { graph, controller } = await setup();
    const v0 = controller.scene()!.frame.layoutVersion;
    controller.step(0.016);
    const v1 = controller.scene()!.frame.layoutVersion;
    expect(v1).toBeGreaterThan(v0);
    graph.state!.simulation.alpha = 0; // settled
    controller.step(0.016);
    const settled = controller.scene()!.frame.layoutVersion;
    controller.step(0.016);
    expect(controller.scene()!.frame.layoutVersion).toBe(settled);
  });

  it("bumps focusVersion on hover and search, not on idle frames", async () => {
    const { controller } = await setup();
    const f0 = controller.scene()!.focusVersion;
    controller.step(0.016);
    expect(controller.scene()!.focusVersion).toBe(f0);
    controller.search("plan");
    expect(controller.scene()!.focusVersion).toBe(f0 + 1);
    const spy = vi.fn();
    controller.onHoverChanged(spy);
    controller.pointerLeave(); // already not hovering: no change
    expect(spy).not.toHaveBeenCalled();
  });
});
