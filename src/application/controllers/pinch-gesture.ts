/** Change since the previous reading of a two-finger gesture. */
export interface PinchDelta {
  /** Midpoint between the fingers, in screen pixels. */
  cx: number;
  cy: number;
  /** Midpoint movement, in screen pixels (two-finger pan). */
  dx: number;
  dy: number;
  /** Finger-distance ratio (> 1 means the fingers spread, so zoom in). */
  scale: number;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Tracks touch points and turns two of them into pan + zoom deltas, in screen
 * coordinates. Pure state, so it is testable without a DOM.
 */
export class PinchGesture {
  private readonly points = new Map<number, Point>();
  private last: { cx: number; cy: number; dist: number } | null = null;

  /** Number of fingers down. */
  get size(): number {
    return this.points.size;
  }

  /** Two or more fingers are down. */
  get active(): boolean {
    return this.points.size >= 2;
  }

  down(id: number, x: number, y: number): void {
    this.points.set(id, { x, y });
    this.last = null; // a new finger changes the baseline
  }

  /** Update one finger; returns the gesture delta while two or more fingers are down. */
  move(id: number, x: number, y: number): PinchDelta | null {
    const p = this.points.get(id);
    if (!p) return null;
    p.x = x;
    p.y = y;
    const now = this.reading();
    if (!now) return null;
    const prev = this.last;
    this.last = now;
    if (!prev) return null;
    return { cx: now.cx, cy: now.cy, dx: now.cx - prev.cx, dy: now.cy - prev.cy, scale: prev.dist > 0 ? now.dist / prev.dist : 1 };
  }

  up(id: number): void {
    this.points.delete(id);
    this.last = null;
  }

  /** Midpoint and distance of the first two fingers. */
  private reading(): { cx: number; cy: number; dist: number } | null {
    if (this.points.size < 2) return null;
    const [a, b] = this.points.values();
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }
}
