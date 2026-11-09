import { afterEach, describe, expect, it, vi } from "vitest";
import { PARA_VAULT, vault } from "../test-support/fixtures";
import { realSchedule } from "../test-support/schedule";
import { boundsOf, regionBit } from "../domain/contracts/anatomy";
import { InMemoryContextMenu } from "../infrastructure/in-memory/in-memory-context-menu";
import { InMemorySettingsRepository } from "../infrastructure/in-memory/in-memory-settings.repository";
import { InMemoryVaultRepository } from "../infrastructure/in-memory/in-memory-vault.repository";
import { InMemoryWorkspaceGateway } from "../infrastructure/in-memory/in-memory-workspace.gateway";
import { mulberry32 } from "../domain/model/shared/random";
import { BrainController } from "./controllers/brain.controller";
import { createBrainGraphService } from "./services/brain-graph.service";
import { createSettingsService } from "./services/settings.service";

async function setup(snapshot = PARA_VAULT) {
  const repo = new InMemorySettingsRepository({ ambientFiring: false });
  const settings = await createSettingsService(repo);
  const vaultRepo = new InMemoryVaultRepository(snapshot);
  const workspace = new InMemoryWorkspaceGateway();
  const menu = new InMemoryContextMenu();
  const graph = createBrainGraphService({ vault: vaultRepo, settings, random: mulberry32(1), refreshDelayMs: 100, schedule: realSchedule });
  const controller = new BrainController({ graph, settings, workspace, menu });
  controller.resize(1000, 760);
  return { repo, settings, vaultRepo, workspace, menu, graph, controller };
}

/** Screen position of a neuron under the current camera. */
function screenOf(ctx: Awaited<ReturnType<typeof setup>>, name: string) {
  const n = ctx.graph.state!.connectome.neurons.find((x) => x.name === name)!;
  const p = ctx.controller.camera.project(n)!;
  return { x: p.x, y: p.y, n };
}

afterEach(() => vi.useRealTimers());

describe("SettingsService", () => {
  it("loads stored values over defaults, persists updates and classifies them", async () => {
    const { repo, settings } = await setup();
    expect(settings.get().ambientFiring).toBe(false);
    expect(settings.get().firingRate).toBe(4);
    const seen: boolean[] = [];
    settings.onChange((structural) => seen.push(structural));
    await settings.update({ firingRate: 9 });
    await settings.update({ layoutMode: "free" });
    await settings.update({ layoutMode: "free" });
    expect(seen).toEqual([false, true, false]);
    expect((await repo.load())?.firingRate).toBe(9);
  });
});

describe("BrainGraphService", () => {
  it("keeps positions across rebuilds unless regrowing", async () => {
    const { graph } = await setup();
    const first = graph.state!;
    const plan = () => graph.state!.connectome.neurons.find((n) => n.name === "Plan")!;
    const before = { x: plan().x, y: plan().y };
    const kept = graph.rebuild(false);
    expect(kept.version).toBe(first.version + 1);
    expect(kept.relaidOut).toBe(false);
    expect({ x: plan().x, y: plan().y }).toEqual(before);
    expect(graph.rebuild(true).relaidOut).toBe(true);
  });

  it("debounces vault change bursts and rebuilds on structural settings", async () => {
    vi.useFakeTimers();
    const { graph, vaultRepo, settings } = await setup();
    const rebuilt = vi.fn();
    const stop = graph.watch(rebuilt);
    vaultRepo.set(vault(["Projects/a.md", "Areas/b.md"]));
    vaultRepo.set(vault(["Projects/a.md", "Areas/b.md", "Areas/c.md"]));
    expect(rebuilt).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(rebuilt).toHaveBeenCalledTimes(1);
    expect(graph.state!.connectome.neurons).toHaveLength(3);
    await settings.update({ showDendrites: false });
    expect(rebuilt).toHaveBeenCalledTimes(1);
    await settings.update({ layoutMode: "free" });
    expect(rebuilt).toHaveBeenCalledTimes(2);
    expect(graph.state!.connectome.paraMode).toBe(false);
    stop();
  });
});

describe("rebuild on vault changes", () => {
  const withNote = (path: string) => ({ ...PARA_VAULT, notes: [...PARA_VAULT.notes, { path, basename: path.replace(/\.md$/, "") }] });

  it("does not rebuild when a change leaves notes, folders and links as they were", async () => {
    vi.useFakeTimers();
    const { graph, vaultRepo } = await setup();
    const rebuilt = vi.fn();
    const stop = graph.watch(rebuilt);
    const state = graph.state;
    // An edit to a note's text: Obsidian fires "resolved", the snapshot is equal but a new object.
    vaultRepo.set({ ...PARA_VAULT, notes: [...PARA_VAULT.notes].reverse(), links: [...PARA_VAULT.links].reverse() });
    vi.advanceTimersByTime(100);
    expect(rebuilt).not.toHaveBeenCalled();
    expect(graph.state).toBe(state);
    vaultRepo.set(withNote("Root 2.md"));
    vi.advanceTimersByTime(100);
    expect(rebuilt).toHaveBeenCalledTimes(1);
    stop();
  });

  it("keeps in-flight signals and activation through a real rebuild", async () => {
    vi.useFakeTimers();
    const { graph, vaultRepo } = await setup();
    const stop = graph.watch(() => {});
    const plan = graph.state!.connectome.neurons.findIndex((n) => n.name === "Plan");
    graph.state!.firing.fire(plan, 0);
    graph.state!.firing.step(0.01, { ambient: false, rate: 1, speedScale: 1 });
    const before = graph.state!.firing.pulses.map((p) => p.t).sort();
    vaultRepo.set(withNote("1. Projects/New.md"));
    vi.advanceTimersByTime(100);
    const s = graph.state!;
    expect(s.firing.pulses.map((p) => p.t).sort()).toEqual(before);
    for (const p of s.firing.pulses) {
      const syn = s.connectome.synapses[p.synapse];
      expect(s.connectome.neurons[p.source].name).toBe("Plan");
      expect([syn.a, syn.b]).toContain(p.source);
      expect(s.connectome.neurons[p.forward ? syn.a : syn.b].name).toBe("Plan");
    }
    expect(s.connectome.neurons.find((n) => n.name === "Plan")!.activation).toBeGreaterThan(0.9);
    stop();
  });

  it("drops signals whose link was removed", async () => {
    vi.useFakeTimers();
    const { graph, vaultRepo } = await setup();
    const stop = graph.watch(() => {});
    const plan = graph.state!.connectome.neurons.findIndex((n) => n.name === "Plan");
    graph.state!.firing.fire(plan, 0);
    vaultRepo.set({ ...PARA_VAULT, links: PARA_VAULT.links.filter(([a, b]) => !(a + b).includes("Atomic")) });
    vi.advanceTimersByTime(100);
    expect(graph.state!.firing.pulses).toHaveLength(1);
    stop();
  });
});

describe("BrainController", () => {
  it("opens a note on click and fires its neuron", async () => {
    const ctx = await setup();
    const { x, y, n } = screenOf(ctx, "Plan");
    ctx.controller.pointerDown(x, y, 0);
    ctx.controller.pointerUp(true);
    expect(ctx.workspace.opened).toEqual([{ path: n.path, mode: "tab" }]);
    expect(n.activation).toBe(1);
    expect(ctx.graph.state!.firing.pulses.length).toBeGreaterThan(0);
  });

  it("orbits on background drag and pans with the pan modifier, without opening notes", async () => {
    const ctx = await setup();
    const cam = ctx.controller.camera;
    const yaw = cam.yaw;
    ctx.controller.pointerDown(2, 2, 0);
    ctx.controller.pointerMove(52, 2);
    ctx.controller.pointerUp(false);
    expect(cam.yaw).not.toBe(yaw);
    const target = { ...cam.target };
    const before = cam.project(target)!;
    ctx.controller.pointerDown(2, 2, 0, true);
    ctx.controller.pointerMove(52, 2);
    ctx.controller.pointerUp(false);
    const after = cam.project(target)!;
    expect(after.x - before.x).toBeCloseTo(50, 5);
    expect(ctx.workspace.opened).toHaveLength(0);
  });

  it("drags a neuron in the screen plane at its depth", async () => {
    const ctx = await setup();
    ctx.graph.state!.simulation.alpha = 0;
    const { x, y, n } = screenOf(ctx, "Plan");
    const start = { x: n.x, y: n.y, z: n.z };
    ctx.controller.pointerDown(x, y, 0);
    ctx.controller.pointerMove(x + 6, y);
    const p = ctx.controller.camera.project(n)!;
    expect(n.fixed).toBe(true);
    if (n.x !== start.x || n.y !== start.y || n.z !== start.z) expect(p.x).toBeCloseTo(x + 6, 3);
    ctx.controller.pointerUp(false);
    expect(n.fixed).toBe(false);
    expect(ctx.workspace.opened).toHaveLength(0);
  });

  it("zooms toward the cursor", async () => {
    const ctx = await setup();
    const cam = ctx.controller.camera;
    const d = cam.distance;
    ctx.controller.wheel(500, 380, -200, false);
    expect(cam.distance).toBeLessThan(d);
  });

  it("keeps the hovered note across a rebuild, even when indices shift", async () => {
    vi.useFakeTimers();
    const ctx = await setup();
    const { x, y } = screenOf(ctx, "Plan");
    ctx.controller.pointerMove(x, y);
    expect(ctx.controller.tooltip()?.title).toBe("Plan");
    // A new note sorted first shifts every index.
    ctx.vaultRepo.set({ ...PARA_VAULT, notes: [{ path: "0 first.md", basename: "0 first" }, ...PARA_VAULT.notes] });
    vi.advanceTimersByTime(100);
    expect(ctx.controller.tooltip()?.title).toBe("Plan");
    const plan = ctx.graph.state!.connectome.neurons.find((n) => n.name === "Plan")!;
    expect(ctx.controller.scene()!.focus?.size).toBe(plan.degree + 1);
  });

  it("highlights the hovered neuron's neighbourhood", async () => {
    const ctx = await setup();
    const { x, y, n } = screenOf(ctx, "Plan");
    ctx.controller.pointerMove(x, y);
    const scene = ctx.controller.scene()!;
    expect(scene.focus?.size).toBe(n.degree + 1);
    expect(ctx.controller.tooltip()?.title).toBe("Plan");
  });

  it("offers a context menu on neurons only", async () => {
    const ctx = await setup();
    expect(ctx.controller.contextMenu(1, 1, { clientX: 0, clientY: 0 })).toBe(false);
    const { x, y, n } = screenOf(ctx, "Copy");
    expect(ctx.controller.contextMenu(x, y, { clientX: 0, clientY: 0 })).toBe(true);
    ctx.menu.last!.find((a) => a.title === "Open in new tab")!.run();
    expect(ctx.workspace.opened.at(-1)).toEqual({ path: n.path, mode: "tab" });
  });

  it("recolours on a colour change without rebuilding the brain", async () => {
    const ctx = await setup();
    const version = ctx.graph.state!.version;
    let notified = 0;
    ctx.controller.onGraphChanged(() => notified++);
    await ctx.settings.update({ colorProjects: "#010203", colorPreset: "custom" });
    expect(ctx.graph.state!.version).toBe(version);
    expect(notified).toBe(1);
    expect(ctx.controller.legend()[0].color).toEqual([1, 2, 3]);
    await ctx.settings.update({ firingRate: 7 });
    expect(notified).toBe(1);
  });

  it("searches by name and builds a PARA legend", async () => {
    const ctx = await setup();
    ctx.controller.search("habit");
    expect(ctx.controller.scene()!.focus?.size).toBe(1);
    const legend = ctx.controller.legend();
    expect(legend.map((l) => [l.title, l.count])).toEqual([
      ["Projects", 3],
      ["Areas", 1],
      ["Resources", 1],
      ["Archive", 1],
      ["Inbox & other", 2],
    ]);
    expect(ctx.controller.stats()?.mode).toBe("PARA cortex");
  });
});

describe("BrainController touch", () => {
  const at = { clientX: 0, clientY: 0 };

  it("uses a finger-sized hit area for touch, wider than the mouse's", async () => {
    const ctx = await setup();
    const { x, y } = screenOf(ctx, "Plan");
    const i = ctx.controller.hitTest(x, y);
    expect(i).toBeGreaterThanOrEqual(0);
    const offsets = Array.from({ length: 30 }, (_, k) => k + 4);
    const widerForTouch = offsets.find((d) => ctx.controller.hitTest(x + d, y, false) < 0 && ctx.controller.hitTest(x + d, y, true) === i);
    expect(widerForTouch).toBeDefined();
  });

  it("selects on the first tap and opens on the second", async () => {
    const ctx = await setup();
    const { x, y, n } = screenOf(ctx, "Plan");
    const tap = () => {
      ctx.controller.pointerDown(x, y, 0, false, true);
      ctx.controller.pointerUp(false);
    };
    tap();
    expect(ctx.workspace.opened).toEqual([]);
    expect(ctx.controller.tooltip()?.title).toBe("Plan");
    expect(ctx.graph.state!.firing.pulses.length).toBeGreaterThan(0);
    tap();
    expect(ctx.workspace.opened).toEqual([{ path: n.path, mode: "current" }]);
  });

  it("deselect clears the selection, so the next tap selects instead of opening", async () => {
    const ctx = await setup();
    const { x, y } = screenOf(ctx, "Plan");
    const tap = () => {
      ctx.controller.pointerDown(x, y, 0, false, true);
      ctx.controller.pointerUp(false);
    };
    tap();
    ctx.controller.deselect();
    expect(ctx.controller.hovering).toBe(false);
    tap();
    expect(ctx.workspace.opened).toEqual([]);
    expect(ctx.controller.hovering).toBe(true);
  });

  it("long-press shows the menu on a neuron without a tap afterwards, and does nothing on empty space", async () => {
    const ctx = await setup();
    expect(ctx.controller.longPress(1, 1, at)).toBe(false);
    expect(ctx.menu.last).toBeNull();
    const { x, y } = screenOf(ctx, "Copy");
    ctx.controller.pointerDown(x, y, 0, false, true);
    expect(ctx.controller.longPress(x, y, at)).toBe(true);
    expect(ctx.menu.last).not.toBeNull();
    ctx.controller.pointerUp(false);
    expect(ctx.workspace.opened).toEqual([]);
    expect(ctx.controller.hovering).toBe(false);
  });

  it("a two-finger gesture pans with the midpoint and zooms with the finger distance", async () => {
    const ctx = await setup();
    const cam = ctx.controller.camera;
    const before = { d: cam.distance, tx: cam.target.x, ty: cam.target.y, tz: cam.target.z };
    ctx.controller.gesture({ cx: 500, cy: 380, dx: 0, dy: 0, scale: 2 });
    expect(cam.distance).toBeLessThan(before.d);
    const mid = { d: cam.distance, tx: cam.target.x, ty: cam.target.y, tz: cam.target.z };
    ctx.controller.gesture({ cx: 500, cy: 380, dx: 40, dy: 0, scale: 1 });
    expect(cam.distance).toBeCloseTo(mid.d);
    expect(Math.hypot(cam.target.x - mid.tx, cam.target.y - mid.ty, cam.target.z - mid.tz)).toBeGreaterThan(0);
    expect(cam.userMoved).toBe(true);
  });
});

describe("BrainGraphService watchers", () => {
  it("rebuilds once per change however many watchers there are, and unsubscribes with the last", async () => {
    vi.useFakeTimers();
    const { graph, vaultRepo, settings, controller } = await setup();
    controller.dispose(); // the controller is a watcher too; start from none
    const v0 = graph.state!.version;
    const a = vi.fn();
    const b = vi.fn();
    const stopA = graph.watch(a);
    const stopB = graph.watch(b);
    await settings.update({ layoutMode: "free" });
    expect(graph.state!.version).toBe(v0 + 1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    stopA();
    stopB();
    vaultRepo.set(vault(["x.md"]));
    vi.advanceTimersByTime(100);
    expect(graph.state!.version).toBe(v0 + 1);
  });
});

/** Run the frame clock with the layout frozen, so only the camera moves. */
function settle(ctx: Awaited<ReturnType<typeof setup>>, seconds = 10) {
  ctx.graph.state!.simulation.alpha = 0;
  for (let t = 0; t < seconds; t += 0.05) ctx.controller.step(0.05);
}

/** Every point projects inside the viewport. */
function onScreen(ctx: Awaited<ReturnType<typeof setup>>, points: { x: number; y: number; z: number }[]) {
  return points.every((n) => {
    const p = ctx.controller.camera.project(n);
    return !!p && p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 760;
  });
}

const centerOf = (b: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }) => ({
  x: (b.min.x + b.max.x) / 2,
  y: (b.min.y + b.max.y) / 2,
  z: (b.min.z + b.max.z) / 2,
});

describe("camera commands", () => {
  it('"Fly to neuron" centres the neuron and moves in closer', async () => {
    const ctx = await setup();
    await ctx.settings.update({ autoRotate: false });
    settle(ctx, 1);
    const cam = ctx.controller.camera;
    const before = cam.distance;
    const { x, y, n } = screenOf(ctx, "Atomic Habits");
    expect(ctx.controller.contextMenu(x, y, { clientX: 0, clientY: 0 })).toBe(true);
    ctx.menu.last!.find((a) => a.title === "Fly to neuron")!.run();
    settle(ctx);
    expect(cam.target.x).toBeCloseTo(n.x, 6);
    expect(cam.target.y).toBeCloseTo(n.y, 6);
    expect(cam.target.z).toBeCloseTo(n.z, 6);
    expect(cam.distance).toBeLessThan(before * 0.5);
    const p = cam.project(n)!;
    expect(p.x).toBeCloseTo(500, 3);
    expect(p.y).toBeCloseTo(380, 3);
    expect(ctx.workspace.opened).toHaveLength(0);
  });

  it("focusing a PARA legend row frames that lobe and all its notes", async () => {
    const ctx = await setup();
    await ctx.settings.update({ autoRotate: false });
    settle(ctx, 1);
    const fitDistance = ctx.controller.camera.distance;
    const projects = ctx.controller.legend().find((l) => l.title === "Projects")!;
    if (projects.target.kind !== "region") throw new Error("PARA legend rows target regions");
    ctx.controller.focusLegend(projects.target);
    settle(ctx);
    const cam = ctx.controller.camera;
    const lobe = ctx.graph.state!.volume.regionBounds(regionBit(projects.target.region))!;
    const c = centerOf(lobe);
    expect(cam.target.x).toBeCloseTo(c.x, 6);
    expect(cam.target.y).toBeCloseTo(c.y, 6);
    expect(cam.target.z).toBeCloseTo(c.z, 6);
    expect(cam.distance).toBeLessThan(fitDistance);
    const notes = ctx.graph.state!.connectome.neurons.filter((n) => n.category === "projects");
    expect(notes).toHaveLength(3);
    expect(onScreen(ctx, notes)).toBe(true);
    expect(onScreen(ctx, [lobe.min, lobe.max])).toBe(true);
  });

  it("focusing a cluster legend row frames that folder's notes", async () => {
    const paths = ["Work/a.md", "Work/b.md", "Work/c.md", "Home/d.md", "Home/e.md", "Misc/f.md"];
    const ctx = await setup(vault(paths, [["Work/a.md", "Home/d.md"]]));
    await ctx.settings.update({ autoRotate: false, layoutMode: "free" });
    settle(ctx, 1);
    const work = ctx.controller.legend().find((l) => l.title === "Work")!;
    if (work.target.kind !== "cluster") throw new Error("free-mode legend rows target clusters");
    ctx.controller.focusLegend(work.target);
    settle(ctx);
    const notes = ctx.graph.state!.connectome.neurons.filter((n) => n.clusterKey === (work.target as { key: string }).key);
    expect(notes.map((n) => n.name).sort()).toEqual(["a", "b", "c"]);
    const c = centerOf(boundsOf(notes)!);
    const cam = ctx.controller.camera;
    expect(cam.target.x).toBeCloseTo(c.x, 6);
    expect(cam.target.y).toBeCloseTo(c.y, 6);
    expect(cam.target.z).toBeCloseTo(c.z, 6);
    expect(onScreen(ctx, notes)).toBe(true);
  });

  it("the 'all' legend target refits the whole brain", async () => {
    const ctx = await setup();
    await ctx.settings.update({ autoRotate: false });
    settle(ctx, 1);
    const fit = { target: { ...ctx.controller.camera.target }, distance: ctx.controller.camera.distance };
    ctx.controller.wheel(500, 380, -400, false);
    ctx.controller.focusLegend({ kind: "all" });
    settle(ctx);
    expect(ctx.controller.camera.distance).toBeCloseTo(fit.distance, 6);
    expect(ctx.controller.camera.target.x).toBeCloseTo(fit.target.x, 6);
  });
});

describe("auto-rotate", () => {
  const yawAfter = (ctx: Awaited<ReturnType<typeof setup>>, seconds: number) => {
    const yaw = ctx.controller.camera.yaw;
    for (let t = 0; t < seconds; t += 0.05) ctx.controller.step(0.05);
    return ctx.controller.camera.yaw - yaw;
  };

  it("turns the brain when idle and stops when switched off", async () => {
    const ctx = await setup();
    ctx.graph.state!.simulation.alpha = 0;
    expect(yawAfter(ctx, 4)).toBeGreaterThan(0);
    await ctx.settings.update({ autoRotate: false });
    expect(yawAfter(ctx, 4)).toBe(0);
  });

  it("pauses while a drag is held and for a moment after release", async () => {
    const ctx = await setup();
    ctx.graph.state!.simulation.alpha = 0;
    ctx.controller.pointerDown(2, 2, 0);
    expect(yawAfter(ctx, 5)).toBe(0); // held well past the idle delay
    ctx.controller.pointerUp(false);
    expect(yawAfter(ctx, 2)).toBe(0); // still within the idle delay
    expect(yawAfter(ctx, 2)).toBeGreaterThan(0);
  });

  it("pauses after a wheel zoom, and while a neuron is hovered", async () => {
    const ctx = await setup();
    ctx.graph.state!.simulation.alpha = 0;
    yawAfter(ctx, 3);
    ctx.controller.wheel(500, 380, -50, false);
    expect(yawAfter(ctx, 2)).toBe(0);
    const { x, y } = screenOf(ctx, "Plan");
    ctx.controller.pointerMove(x, y);
    expect(ctx.controller.hovering).toBe(true);
    expect(yawAfter(ctx, 5)).toBe(0);
    ctx.controller.pointerLeave();
    expect(yawAfter(ctx, 1)).toBeGreaterThan(0);
  });
});

describe("keyboard", () => {
  it("rotates with the arrow keys and pans with Shift + arrows", async () => {
    const ctx = await setup();
    const cam = ctx.controller.camera;
    const yaw = cam.yaw;
    const pitch = cam.pitch;
    expect(ctx.controller.keyDown("ArrowRight")).toBe(true);
    expect(cam.yaw).toBeLessThan(yaw); // same as dragging right
    expect(ctx.controller.keyDown("ArrowDown")).toBe(true);
    expect(cam.pitch).toBeGreaterThan(pitch);
    const target = { ...cam.target };
    const before = cam.project(target)!;
    expect(ctx.controller.keyDown("ArrowLeft", true)).toBe(true);
    expect(cam.project(target)!.x).toBeLessThan(before.x);
  });

  it("zooms with + and −, and F refits the brain", async () => {
    const ctx = await setup();
    await ctx.settings.update({ autoRotate: false });
    settle(ctx, 1);
    const cam = ctx.controller.camera;
    const fit = cam.distance;
    ctx.controller.keyDown("+");
    expect(cam.distance).toBeLessThan(fit);
    ctx.controller.keyDown("-");
    ctx.controller.keyDown("-");
    expect(cam.distance).toBeGreaterThan(fit);
    expect(ctx.controller.keyDown("f")).toBe(true);
    settle(ctx);
    expect(cam.distance).toBeCloseTo(fit, 6);
  });

  it("toggles auto-rotate with R", async () => {
    const ctx = await setup();
    expect(ctx.settings.get().autoRotate).toBe(true);
    expect(ctx.controller.keyDown("r")).toBe(true);
    await Promise.resolve();
    expect(ctx.settings.get().autoRotate).toBe(false);
    ctx.controller.keyDown("R");
    await Promise.resolve();
    expect(ctx.settings.get().autoRotate).toBe(true);
  });

  it("pauses auto-rotate after a key move and ignores keys it doesn't use", async () => {
    const ctx = await setup();
    ctx.graph.state!.simulation.alpha = 0;
    for (let t = 0; t < 3; t += 0.05) ctx.controller.step(0.05);
    ctx.controller.keyDown("ArrowUp");
    const yaw = ctx.controller.camera.yaw;
    for (let t = 0; t < 2; t += 0.05) ctx.controller.step(0.05);
    expect(ctx.controller.camera.yaw).toBe(yaw);
    expect(ctx.controller.keyDown("x")).toBe(false);
    expect(ctx.controller.keyDown("Enter")).toBe(false);
    expect(ctx.controller.keyDown(" ")).toBe(false);
  });
});
