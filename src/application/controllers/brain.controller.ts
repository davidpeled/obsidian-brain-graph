import { boundsOf, regionBit } from "../../domain/contracts/anatomy";
import type { BrainGraphService, BrainState } from "../../domain/contracts/brain-graph.contract";
import type { Neuron } from "../../domain/contracts/connectome";
import type { GraphView, SceneView } from "../contracts/scene";
import type { SettingsService } from "../contracts/settings";
import { FrameBuffer, toGraphView } from "../mappers/scene.mapper";
import type { Unsubscribe } from "../../domain/contracts/vault";
import type { ContextMenuGateway } from "../../domain/interfaces/context-menu.gateway";
import type { WorkspaceGateway } from "../../domain/interfaces/workspace.gateway";
import { LegendItem, LegendTarget, toLegend } from "../mappers/legend.mapper";
import { StatsView, TooltipView, toStats, toTooltip } from "../mappers/neuron.mapper";
import { Palette, paletteKey, toPalette } from "../mappers/palette.mapper";
import { Highlight } from "./highlight";
import { OrbitCamera } from "./orbit-camera";
import type { PinchDelta } from "./pinch-gesture";
import { PointerInteraction } from "./pointer-interaction";
import { Timeline, TimelineView } from "./timeline";

export interface BrainControllerDeps {
  graph: BrainGraphService;
  settings: SettingsService;
  workspace: WorkspaceGateway;
  menu: ContextMenuGateway;
}

const HOVER_FIRE_INTERVAL = 0.6;
/** Seconds without interaction before auto-rotation resumes. */
const AUTO_ROTATE_IDLE = 2.5;
/** Keyboard steps, in screen pixels (as if dragged) and zoom factor. */
const KEY_ORBIT = 30;
const KEY_PAN = 40;
const KEY_ZOOM = 1.25;
/** Touch hit area: a finger is about 40 px wide, so neurons get at least this radius plus slop. */
const TOUCH_MIN_RADIUS = 14;
const TOUCH_SLOP = 6;

/** Keyboard shortcuts while the brain has focus, for hosts to show in tooltips and help. */
export const KEY_SHORTCUTS = {
  fit: "F",
  autoRotate: "R",
  orbit: "Arrow keys",
  pan: "Shift + arrow keys",
  zoom: "+ / −",
} as const;

/**
 * Presentation controller for one brain view. Transport-agnostic: hosts feed it
 * screen-space input and a frame clock, and render `scene()`.
 *
 * Composes: OrbitCamera (view), Highlight (hover / search / focus) and
 * PointerInteraction (input state machine). Owns the graph lifecycle,
 * palette, auto-rotate and the commands.
 */
export class BrainController {
  readonly camera = new OrbitCamera();
  private readonly highlight = new Highlight();
  private readonly pointer = new PointerInteraction({
    hitTest: (sx, sy, touch) => this.hitTest(sx, sy, touch),
    hovered: () => this.highlight.hover,
    select: (i) => {
      this.setHover(i);
      if (i >= 0) this.state?.firing.fire(i, 2, true);
    },
    positionOf: (i) => this.neuron(i),
    orbit: (dx, dy) => this.camera.orbit(dx, dy),
    pan: (dx, dy) => this.camera.pan(dx, dy),
    dragNeuron: (i, sx, sy) => {
      const n = this.neuron(i);
      const p = n && this.camera.project(n);
      if (!n || !p || !this.state) return;
      const w = this.camera.unproject(sx, sy, p.depth);
      this.state.simulation.drag(n, w.x, w.y, w.z);
    },
    releaseNeuron: (i) => {
      const n = this.neuron(i);
      if (n) this.state?.simulation.release(n);
    },
    hover: (i) => this.setHover(i),
    click: (i, newTab) => {
      const n = this.neuron(i);
      if (!n || !this.state) return;
      this.state.firing.fire(i, 3, true);
      this.deps.workspace.openNote(n.path, newTab ? "tab" : "current");
    },
  });
  private palette: Palette = { colors: [], colorOf: new Uint8Array(0) };
  private graphView: GraphView | null = null;
  private readonly frame = new FrameBuffer();
  private readonly timeline = new Timeline();
  private paletteFor = "";
  private pathIndex = new Map<string, number>();
  private hoverFireAcc = 0;
  private activePath: string | null;
  private idle = AUTO_ROTATE_IDLE;
  private needsFit = true;
  private readonly graphListeners = new Set<() => void>();
  private readonly subscriptions: Unsubscribe[] = [];

  constructor(private readonly deps: BrainControllerDeps) {
    this.activePath = deps.workspace.activeNotePath();
    this.subscriptions.push(
      deps.graph.watch((s) => this.adopt(s)),
      deps.settings.onChange(() => this.refreshPalette()),
      deps.workspace.onActiveNoteChanged((path) => {
        this.activePath = path;
        const i = this.indexOf(path);
        if (i >= 0) this.state?.firing.fire(i, 1, true);
      })
    );
    this.adopt(deps.graph.rebuild(true));
  }

  dispose(): void {
    this.subscriptions.forEach((u) => u());
    this.graphListeners.clear();
    this.highlight.dispose();
  }

  private get state(): BrainState | null {
    return this.deps.graph.state;
  }

  /** Recolour without rebuilding when only the colour settings changed. */
  private refreshPalette(): void {
    const s = this.state;
    if (!s || paletteKey(this.deps.settings.get()) === this.paletteFor) return;
    this.palette = toPalette(s.connectome, this.deps.settings.get());
    this.paletteFor = paletteKey(this.deps.settings.get());
    this.graphListeners.forEach((l) => l());
  }

  private adopt(state: BrainState): void {
    this.graphView = toGraphView(state);
    this.timeline.rebase(state.connectome.neurons);
    this.frame.moved();
    this.palette = toPalette(state.connectome, this.deps.settings.get());
    this.paletteFor = paletteKey(this.deps.settings.get());
    this.pathIndex = new Map(state.connectome.neurons.map((n, i) => [n.path, i]));
    this.highlight.rebase(state.connectome, (p) => this.indexOf(p));
    if (state.relaidOut) this.needsFit = true;
    this.fitIfNeeded();
    this.graphListeners.forEach((l) => l());
  }

  // --- Queries ------------------------------------------------------------------

  onGraphChanged(cb: () => void): Unsubscribe {
    this.graphListeners.add(cb);
    return () => this.graphListeners.delete(cb);
  }

  onHoverChanged(cb: () => void): Unsubscribe {
    return this.highlight.onHoverChanged(cb);
  }

  /** The read model for renderers: plain data, rebuilt per graph and refreshed per frame. */
  scene(): SceneView | null {
    const state = this.state;
    if (!state || !this.graphView) return null;
    return {
      graph: this.graphView,
      frame: this.frame.write(state, this.timeline),
      palette: this.palette,
      camera: this.camera,
      display: this.deps.settings.get(),
      hover: this.highlight.hover,
      focus: this.highlight.focus(),
      focusVersion: this.highlight.version,
      active: this.indexOf(this.activePath),
    };
  }

  /** The playhead over the notes' creation dates, for the host to draw. */
  timelineView(): TimelineView {
    return this.timeline.view();
  }

  legend(): LegendItem[] {
    return this.state ? toLegend(this.state.connectome, this.palette) : [];
  }

  stats(): StatsView | null {
    return this.state ? toStats(this.state.connectome) : null;
  }

  tooltip(): TooltipView | null {
    const n = this.neuron(this.highlight.hover);
    return n ? toTooltip(n) : null;
  }

  get hovering(): boolean {
    return this.highlight.hover >= 0;
  }

  private neuron(i: number): Neuron | undefined {
    return i >= 0 ? this.state?.connectome.neurons[i] : undefined;
  }

  private indexOf(path: string | null): number {
    return path ? (this.pathIndex.get(path) ?? -1) : -1;
  }

  private setHover(i: number): void {
    if (i !== this.highlight.hover) this.hoverFireAcc = HOVER_FIRE_INTERVAL - 0.15;
    this.highlight.setHover(i, this.state?.connectome ?? null);
  }

  // --- Clock ----------------------------------------------------------------------

  resize(w: number, h: number): void {
    this.camera.resize(w, h);
    if (!this.camera.userMoved) this.needsFit = true;
    this.fitIfNeeded();
  }

  private fitIfNeeded(): void {
    const s = this.state;
    if (!s || !this.needsFit || !this.camera.ready) return;
    this.fitTo(s, false);
    this.needsFit = false;
  }

  private fitTo(s: BrainState, animate: boolean): void {
    const { W, H, D } = s.volume;
    this.camera.fit(s.volume.center, Math.hypot(W, H, D) * 0.42, animate);
  }

  step(dt: number): void {
    const s = this.state;
    if (!s) return;
    this.camera.step(dt);
    this.timeline.step(dt);
    this.idle += dt;
    const settings = this.deps.settings.get();
    if (this.highlight.hover >= 0 && !this.timeline.born(this.highlight.hover)) this.setHover(-1);
    const hover = this.highlight.hover;
    if (settings.autoRotate && !this.pointer.active && hover < 0 && this.idle > AUTO_ROTATE_IDLE) this.camera.autoRotate(dt);
    if (s.simulation.running) {
      s.simulation.tick();
      if (s.simulation.alpha > 0.5 && s.connectome.neurons.length < 4000) s.simulation.tick();
      this.frame.moved(); // dragging reheats the layout, so drags land here too
    }
    if (hover >= 0) {
      this.hoverFireAcc += dt;
      if (this.hoverFireAcc > HOVER_FIRE_INTERVAL) {
        this.hoverFireAcc = 0;
        s.firing.fire(hover, 0, true);
      }
    }
    s.firing.step(dt, { ambient: settings.ambientFiring, rate: settings.firingRate, speedScale: Math.sqrt(s.volume.scale) });
  }

  private touch(): void {
    this.idle = 0;
  }

  // --- Commands -----------------------------------------------------------------

  fit(): void {
    const s = this.state;
    if (s) this.fitTo(s, true);
  }

  /** Show or hide the history. Turning it on opens at the present; press play to watch the brain fill. */
  toggleTimeline(): void {
    this.timeline.setActive(!this.timeline.active);
  }

  toggleTimelinePlayback(): void {
    if (this.timeline.playing) this.timeline.pause();
    else this.timeline.play();
  }

  /** Scrub the history: `progress` is 0 (first note) .. 1 (latest). */
  seekTimeline(progress: number): void {
    this.timeline.seek(progress);
  }

  regrow(): void {
    this.adopt(this.deps.graph.rebuild(true));
  }

  fireRandom(): void {
    this.state?.firing.fireRandom((i) => this.timeline.born(i));
  }

  async toggleAmbientFiring(): Promise<void> {
    await this.deps.settings.update({ ambientFiring: !this.deps.settings.get().ambientFiring });
  }

  async toggleAutoRotate(): Promise<void> {
    await this.deps.settings.update({ autoRotate: !this.deps.settings.get().autoRotate });
  }

  search(term: string): void {
    this.highlight.search(term, this.state?.connectome ?? null);
  }

  /** Fly to and fire the best-connected search hit. */
  focusFirstMatch(): void {
    const s = this.state;
    const hits = this.highlight.matches && [...this.highlight.matches].filter((i) => this.timeline.born(i));
    if (!s || !hits?.length) return;
    const best = hits.sort((a, b) => s.connectome.neurons[b].degree - s.connectome.neurons[a].degree)[0];
    this.touch();
    this.camera.focusOn(s.connectome.neurons[best]);
    s.firing.fire(best, 3, true);
  }

  focusLegend(target: LegendTarget): void {
    const s = this.state;
    if (!s) return;
    this.touch();
    if (target.kind === "all") return this.fit();
    const b =
      target.kind === "region"
        ? s.volume.regionBounds(regionBit(target.region))
        : boundsOf(s.connectome.neurons.filter((n, i) => n.clusterKey === target.key && this.timeline.born(i)));
    if (b) this.camera.focusBounds(b);
  }

  // --- Input (screen coordinates relative to the canvas) ----------------------------

  /** Front-most neuron under the screen point, or -1. `touch` uses a finger-sized hit area. */
  hitTest(sx: number, sy: number, touch = false): number {
    const s = this.state;
    if (!s) return -1;
    let best = -1;
    let bestDepth = Infinity;
    const p = { x: 0, y: 0, depth: 0, scale: 0 };
    s.connectome.neurons.forEach((n, i) => {
      if (this.timeline.presence(i) < 0.3 || !this.camera.projectTo(n, p)) return;
      const radius = touch ? Math.max(TOUCH_MIN_RADIUS, n.r * p.scale) + TOUCH_SLOP : Math.max(4, n.r * p.scale) + 3;
      if (Math.hypot(p.x - sx, p.y - sy) <= radius && p.depth < bestDepth) {
        best = i;
        bestDepth = p.depth;
      }
    });
    return best;
  }

  /** `pan`: the host's pan modifier (e.g. Shift) is held. Middle/right buttons also pan. */
  pointerDown(sx: number, sy: number, button: number, pan = false, touch = false): void {
    this.touch();
    this.pointer.down(sx, sy, button, pan, touch);
  }

  pointerMove(sx: number, sy: number): void {
    if (this.pointer.active) this.touch();
    this.pointer.move(sx, sy);
  }

  /** `newTab`: the user held the platform modifier key. */
  pointerUp(newTab: boolean): void {
    this.touch();
    this.pointer.up(newTab);
  }

  /** The press was interrupted (e.g. a touch was cancelled): release without clicking. */
  pointerCancel(): void {
    this.pointer.cancel();
  }

  /** Two-finger pan and pinch-zoom, as deltas since the last reading. */
  gesture(g: PinchDelta): void {
    this.touch();
    this.camera.pan(g.dx, g.dy);
    this.camera.zoomAt(g.cx, g.cy, g.scale);
  }

  /**
   * A finger held in place on a neuron: open its context menu and drop the press
   * so lifting the finger does not also tap. Returns true when a menu was shown.
   */
  longPress(sx: number, sy: number, at: { clientX: number; clientY: number }): boolean {
    if (!this.contextMenu(sx, sy, at, true)) return false;
    this.pointer.cancel();
    return true;
  }

  /** Drop a touch selection (e.g. a tap outside the canvas). */
  deselect(): void {
    if (this.pointer.clearSelection()) this.setHover(-1);
  }

  pointerLeave(): void {
    this.setHover(-1);
  }

  wheel(sx: number, sy: number, deltaY: number, pinch: boolean): void {
    this.touch();
    this.camera.zoomAt(sx, sy, Math.exp(-deltaY * (pinch ? 0.01 : 0.0015)));
  }

  doubleClick(sx: number, sy: number): void {
    if (this.hitTest(sx, sy) < 0) this.fit();
  }

  /**
   * Keyboard alternative to the pointer. `key` is a DOM `KeyboardEvent.key`.
   * Returns true when the key was handled (the host should then prevent its default).
   */
  keyDown(key: string, shift = false): boolean {
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const arrow = arrows[key];
    if (arrow) {
      this.touch();
      if (shift) this.camera.pan(arrow[0] * KEY_PAN, arrow[1] * KEY_PAN);
      else this.camera.orbit(arrow[0] * KEY_ORBIT, arrow[1] * KEY_ORBIT);
      return true;
    }
    switch (key) {
      case "f":
      case "F":
        this.touch();
        this.fit();
        return true;
      case "r":
      case "R":
        void this.toggleAutoRotate();
        return true;
      case "+":
      case "=":
        this.touch();
        this.camera.zoomAt(this.camera.w / 2, this.camera.h / 2, KEY_ZOOM);
        return true;
      case "-":
      case "_":
        this.touch();
        this.camera.zoomAt(this.camera.w / 2, this.camera.h / 2, 1 / KEY_ZOOM);
        return true;
      default:
        return false;
    }
  }

  /** Returns true when a menu was shown (the host should suppress its own). */
  contextMenu(sx: number, sy: number, at: { clientX: number; clientY: number }, touch = false): boolean {
    const i = this.hitTest(sx, sy, touch);
    const n = this.neuron(i);
    if (!n || !this.state) return false;
    const { workspace } = this.deps;
    const firing = this.state.firing;
    this.deps.menu.show(
      [
        { title: "Open note", icon: "file-text", run: () => workspace.openNote(n.path, "current") },
        { title: "Open in new tab", icon: "file-plus", run: () => workspace.openNote(n.path, "tab") },
        { title: "Fire neuron", icon: "zap", run: () => firing.fire(i, 4, true) },
        { title: "Fly to neuron", icon: "zoom-in", run: () => this.camera.focusOn(n) },
      ],
      at
    );
    return true;
  }
}
