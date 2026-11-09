import type { Schedule } from "../contracts/schedule";
import { DRAG_THRESHOLD } from "./pointer-interaction";
import { PinchGesture, type PinchDelta } from "./pinch-gesture";

/** What touch handling needs from the controller. */
export interface TouchHost {
  pointerDown(sx: number, sy: number, button: number, pan: boolean, touch: boolean): void;
  pointerMove(sx: number, sy: number): void;
  pointerUp(newTab: boolean): void;
  pointerCancel(): void;
  gesture(g: PinchDelta): void;
  /** Open the neuron menu under the finger; true when one was shown. */
  longPress(sx: number, sy: number, at: ScreenPoint): boolean;
}

/** Client (page) coordinates, for placing native menus. */
export interface ScreenPoint {
  clientX: number;
  clientY: number;
}

/** Hold a finger this long (ms) on a neuron for its context menu. */
export const LONG_PRESS_MS = 500;

/**
 * Touch policy on top of the pointer state machine, in screen coordinates:
 * - one finger behaves like the pointer (rotate, tap to select, tap again to open);
 * - a second finger abandons that press and switches to pinch zoom + two-finger pan;
 * - holding a finger still for LONG_PRESS_MS opens the context menu;
 * - after a gesture or a long-press the rest of the sequence is ignored until every
 *   finger lifts, so lifting does not tap and a leftover finger does not jump the view.
 *
 * The long-press is cancelled by the same movement threshold that turns a press
 * into a drag, so a menu can never open in the middle of a rotation.
 */
export class TouchInteraction {
  private readonly pinch = new PinchGesture();
  private muted = false;
  private cancelTimer: (() => void) | null = null;
  private pressAt = { x: 0, y: 0 };

  constructor(
    private readonly host: TouchHost,
    private readonly schedule: Schedule
  ) {}

  /**
   * The platform's own context-menu event (Android fires one on long-press) should be
   * swallowed: a long-press is pending or was handled here.
   */
  get ownsContextMenu(): boolean {
    return this.cancelTimer !== null || this.muted;
  }

  down(id: number, sx: number, sy: number, at: ScreenPoint): void {
    this.pinch.down(id, sx, sy);
    this.clearTimer();
    if (this.pinch.active) {
      this.muted = true;
      this.host.pointerCancel();
      return;
    }
    this.host.pointerDown(sx, sy, 0, false, true);
    this.pressAt = { x: sx, y: sy };
    this.cancelTimer = this.schedule(() => {
      this.cancelTimer = null;
      if (this.host.longPress(this.pressAt.x, this.pressAt.y, at)) this.muted = true;
    }, LONG_PRESS_MS);
  }

  move(id: number, sx: number, sy: number): void {
    const g = this.pinch.move(id, sx, sy);
    if (g) this.host.gesture(g);
    if (this.muted) return;
    if (this.cancelTimer && Math.hypot(sx - this.pressAt.x, sy - this.pressAt.y) > DRAG_THRESHOLD) this.clearTimer();
    this.host.pointerMove(sx, sy);
  }

  /** Returns true when the lift completed a one-finger press (a tap or the end of a drag). */
  up(id: number): boolean {
    this.clearTimer();
    const ignored = this.muted;
    this.release(id);
    if (ignored) return false;
    this.host.pointerUp(false);
    return true;
  }

  cancel(id: number): void {
    this.clearTimer();
    this.release(id);
    this.host.pointerCancel();
  }

  dispose(): void {
    this.clearTimer();
  }

  private release(id: number): void {
    this.pinch.up(id);
    if (this.pinch.size === 0) this.muted = false;
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }
}
