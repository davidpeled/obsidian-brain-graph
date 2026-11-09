import type { Pt3 } from "../../domain/contracts/anatomy";

/** What the pointer state machine needs from its controller. */
export interface PointerHost {
  /** Front-most neuron under a screen point, or -1. `touch` widens the hit area for a finger. */
  hitTest(sx: number, sy: number, touch: boolean): number;
  /** The neuron currently highlighted (hovered or selected), or -1. */
  hovered(): number;
  /** Touch selection: highlight a neuron (show its tooltip and synapses), or -1 to clear. */
  select(i: number): void;
  /** World position of a neuron, or undefined. */
  positionOf(i: number): Pt3 | undefined;
  orbit(dx: number, dy: number): void;
  pan(dx: number, dy: number): void;
  /** Move a neuron so it sits under the screen point, at its current depth. */
  dragNeuron(i: number, sx: number, sy: number): void;
  releaseNeuron(i: number): void;
  hover(i: number): void;
  click(i: number, newTab: boolean): void;
}

type DragMode = "neuron" | "orbit" | "pan";

interface Drag {
  sx: number;
  sy: number;
  lx: number;
  ly: number;
  neuron: number;
  mode: DragMode;
  moved: boolean;
  button: number;
  touch: boolean;
}

/** Movement (px) before a press becomes a drag rather than a click. */
export const DRAG_THRESHOLD = 4;

/**
 * Pointer state machine, in screen coordinates:
 * - press on a neuron + drag → move that neuron; without moving → click it;
 * - press on empty space + drag → orbit;
 * - with the pan modifier or the middle/right button + drag → pan;
 * - moving without a press → hover.
 *
 * Touch has no hover, and a finger that lands on a neuron should still be able
 * to rotate the brain, so for touch:
 * - a drag always orbits (even when it starts on a neuron);
 * - a tap on a neuron selects it (tooltip + synapses), a second tap on it opens it;
 * - a tap on empty space clears the selection.
 */
export class PointerInteraction {
  private drag: Drag | null = null;
  /** The neuron a touch tap selected. Separate from hover, so a resting mouse can't make the first tap open a note. */
  private selected = -1;

  constructor(private readonly host: PointerHost) {}

  /** A press or drag is in progress. */
  get active(): boolean {
    return this.drag !== null;
  }

  down(sx: number, sy: number, button: number, pan = false, touch = false): void {
    const primary = button === 0 && !pan;
    const neuron = primary ? this.host.hitTest(sx, sy, touch) : -1;
    const mode: DragMode = neuron >= 0 && !touch ? "neuron" : primary ? "orbit" : "pan";
    this.drag = { sx, sy, lx: sx, ly: sy, neuron, mode, moved: false, button, touch };
  }

  move(sx: number, sy: number): void {
    const d = this.drag;
    if (!d) return this.host.hover(this.host.hitTest(sx, sy, false));
    if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) > DRAG_THRESHOLD) d.moved = true;
    if (!d.moved) return;
    if (d.mode === "neuron") {
      this.host.dragNeuron(d.neuron, sx, sy);
      this.host.hover(d.neuron);
    } else if (d.mode === "orbit") {
      this.host.orbit(sx - d.lx, sy - d.ly);
    } else {
      this.host.pan(sx - d.lx, sy - d.ly);
    }
    d.lx = sx;
    d.ly = sy;
  }

  /** `newTab`: the platform modifier key is held. */
  up(newTab: boolean): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.touch) return this.tap(d);
    if (d.neuron < 0 || !this.host.positionOf(d.neuron)) return;
    this.host.releaseNeuron(d.neuron);
    if (!d.moved && d.button === 0) this.host.click(d.neuron, newTab);
  }

  private tap(d: Drag): void {
    if (d.moved || d.mode === "pan") return;
    if (d.neuron < 0 || !this.host.positionOf(d.neuron)) {
      this.selected = -1;
      return this.host.select(-1);
    }
    // Open on the second tap, if the selection is still showing (a rebuild clears the hover).
    if (this.selected === d.neuron && this.host.hovered() === d.neuron) return this.host.click(d.neuron, false);
    this.selected = d.neuron;
    this.host.select(d.neuron);
  }

  /** Forget the touch selection; true when there was one. */
  clearSelection(): boolean {
    const had = this.selected >= 0;
    this.selected = -1;
    return had;
  }

  /** Abandon a press (pointer left the canvas or was cancelled) without clicking. */
  cancel(): void {
    const d = this.drag;
    this.drag = null;
    if (d && d.mode === "neuron" && this.host.positionOf(d.neuron)) this.host.releaseNeuron(d.neuron);
  }
}
