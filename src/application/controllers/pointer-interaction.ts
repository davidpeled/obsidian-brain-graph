import type { Pt3 } from "../../domain/contracts/anatomy";

/** What the pointer state machine needs from its controller. */
export interface PointerHost {
  /** Front-most neuron under a screen point, or -1. */
  hitTest(sx: number, sy: number): number;
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
}

/** Movement (px) before a press becomes a drag rather than a click. */
export const DRAG_THRESHOLD = 4;

/**
 * Pointer state machine, in screen coordinates:
 * - press on a neuron + drag → move that neuron; without moving → click it;
 * - press on empty space + drag → orbit;
 * - with the pan modifier or the middle/right button + drag → pan;
 * - moving without a press → hover.
 */
export class PointerInteraction {
  private drag: Drag | null = null;

  constructor(private readonly host: PointerHost) {}

  /** A press or drag is in progress. */
  get active(): boolean {
    return this.drag !== null;
  }

  down(sx: number, sy: number, button: number, pan = false): void {
    const neuron = button === 0 && !pan ? this.host.hitTest(sx, sy) : -1;
    const mode: DragMode = neuron >= 0 ? "neuron" : button === 0 && !pan ? "orbit" : "pan";
    this.drag = { sx, sy, lx: sx, ly: sy, neuron, mode, moved: false, button };
  }

  move(sx: number, sy: number): void {
    const d = this.drag;
    if (!d) return this.host.hover(this.host.hitTest(sx, sy));
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
    if (!d || d.neuron < 0 || !this.host.positionOf(d.neuron)) return;
    this.host.releaseNeuron(d.neuron);
    if (!d.moved && d.button === 0) this.host.click(d.neuron, newTab);
  }

  /** Abandon a press (pointer left the canvas or was cancelled) without clicking. */
  cancel(): void {
    const d = this.drag;
    this.drag = null;
    if (d && d.neuron >= 0 && this.host.positionOf(d.neuron)) this.host.releaseNeuron(d.neuron);
  }
}
