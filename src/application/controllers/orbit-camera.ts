import type { Bounds3, Pt3 } from "../../domain/contracts/anatomy";

export interface Projected {
  x: number;
  y: number;
  /** Distance along the view direction. */
  depth: number;
  /** Screen pixels per world unit at this depth. */
  scale: number;
}

interface Basis {
  eye: Pt3;
  f: Pt3;
  r: Pt3;
  u: Pt3;
}

interface Pose {
  target: Pt3;
  distance: number;
}

const add = (a: Pt3, b: Pt3, k = 1): Pt3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const sub = (a: Pt3, b: Pt3): Pt3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Pt3, b: Pt3): Pt3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a: Pt3): Pt3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** World "up" is −y (brain coordinates run top → bottom). */
export const WORLD_UP: Pt3 = { x: 0, y: -1, z: 0 };
const MIN_PITCH = -1.45;
const MAX_PITCH = 1.45;

/**
 * Perspective orbit camera around a target, as pure math so picking, dragging
 * and labels are testable. Renderers copy `eye`, `target`, `fov` and `WORLD_UP`
 * into their own camera; the projection matches a standard vertical-FOV
 * perspective camera.
 */
export class OrbitCamera {
  target: Pt3 = { x: 0, y: 0, z: 0 };
  /** Azimuth around the vertical axis; π looks at the left side (front of the brain on the left). */
  yaw = Math.PI - 0.55;
  /** Elevation; positive looks down from above. */
  pitch = 0.25;
  distance = 1000;
  /** Vertical field of view, degrees. */
  readonly fov = 40;
  w = 0;
  h = 0;
  /** The user moved the camera, so resizes should not refit. */
  userMoved = false;
  private fitDistance = 1000;
  private goal: Pose | null = null;
  /** Basis cached for the pose it was computed from (yaw, pitch, distance, target). */
  private cache: { yaw: number; pitch: number; distance: number; tx: number; ty: number; tz: number; basis: Basis } | null = null;

  get ready(): boolean {
    return this.w > 0 && this.h > 0;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  /** Focal length in pixels. */
  get focal(): number {
    return this.h / 2 / Math.tan((this.fov * Math.PI) / 360);
  }

  get eye(): Pt3 {
    const cp = Math.cos(this.pitch);
    return add(this.target, { x: Math.sin(this.yaw) * cp, y: -Math.sin(this.pitch), z: Math.cos(this.yaw) * cp }, this.distance);
  }

  /** Camera basis, recomputed only when the pose changes (project runs thousands of times per frame). */
  private basis(): Basis {
    const c = this.cache;
    const t = this.target;
    if (c && c.yaw === this.yaw && c.pitch === this.pitch && c.distance === this.distance && c.tx === t.x && c.ty === t.y && c.tz === t.z)
      return c.basis;
    const eye = this.eye;
    const f = norm(sub(t, eye));
    const r = norm(cross(f, WORLD_UP));
    const basis = { eye, f, r, u: cross(r, f) };
    this.cache = { yaw: this.yaw, pitch: this.pitch, distance: this.distance, tx: t.x, ty: t.y, tz: t.z, basis };
    return basis;
  }

  project(p: Pt3): Projected | null {
    const out = { x: 0, y: 0, depth: 0, scale: 0 };
    return this.projectTo(p, out) ? out : null;
  }

  /** Allocation-free projection into `out`; false when the point is behind the camera. */
  projectTo(p: Pt3, out: Projected): boolean {
    const { eye, f, r, u } = this.basis();
    const vx = p.x - eye.x;
    const vy = p.y - eye.y;
    const vz = p.z - eye.z;
    const depth = vx * f.x + vy * f.y + vz * f.z;
    if (depth < 1) return false;
    const scale = this.focal / depth;
    out.x = this.w / 2 + (vx * r.x + vy * r.y + vz * r.z) * scale;
    out.y = this.h / 2 - (vx * u.x + vy * u.y + vz * u.z) * scale;
    out.depth = depth;
    out.scale = scale;
    return true;
  }

  /** World point under the screen position at the given view depth. */
  unproject(sx: number, sy: number, depth: number): Pt3 {
    const { eye, f, r, u } = this.basis();
    const k = depth / this.focal;
    return add(add(add(eye, f, depth), r, (sx - this.w / 2) * k), u, -(sy - this.h / 2) * k);
  }

  /** Distance at which a sphere of `radius` fits the viewport. */
  private distanceFor(radius: number): number {
    const halfV = (this.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * (this.w / Math.max(1, this.h)));
    return radius / Math.sin(Math.min(halfV, halfH));
  }

  fit(center: Pt3, radius: number, animate: boolean): void {
    if (!this.ready) return;
    this.fitDistance = this.distanceFor(radius);
    this.userMoved = false;
    this.go({ target: center, distance: this.fitDistance }, animate);
  }

  focusBounds(b: Bounds3): void {
    const center = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 };
    const radius = Math.max(60, Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) / 2);
    this.userMoved = true;
    this.go({ target: center, distance: this.clampDistance(this.distanceFor(radius) * 1.05) }, true);
  }

  focusOn(p: Pt3): void {
    this.userMoved = true;
    this.go({ target: p, distance: Math.min(this.distance, this.fitDistance * 0.35) }, true);
  }

  /** Rotate by a screen-space drag. */
  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.006;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dy * 0.006));
    this.userMoved = true;
  }

  /** Move the target so the scene follows a screen-space drag. */
  pan(dx: number, dy: number): void {
    const { r, u } = this.basis();
    const k = this.distance / this.focal;
    this.goal = null;
    this.target = add(add(this.target, r, -dx * k), u, dy * k);
    this.userMoved = true;
  }

  /** Dolly by `factor` (> 1 zooms in), drifting toward the point under the cursor. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const cursor = this.unproject(sx, sy, this.distance);
    const distance = this.clampDistance((this.goal?.distance ?? this.distance) / factor);
    const pull = 1 - distance / this.distance;
    this.goal = null;
    this.target = add(this.target, sub(cursor, this.target), pull);
    this.distance = distance;
    this.userMoved = true;
  }

  private clampDistance(d: number): number {
    return Math.min(this.fitDistance * 4, Math.max(this.fitDistance * 0.04, d));
  }

  autoRotate(dt: number, speed = 0.12): void {
    this.yaw += dt * speed;
  }

  step(dt: number): void {
    const g = this.goal;
    if (!g) return;
    const k = 1 - Math.pow(0.001, dt);
    this.target = add(this.target, sub(g.target, this.target), k);
    this.distance += (g.distance - this.distance) * k;
    if (Math.hypot(g.target.x - this.target.x, g.target.y - this.target.y, g.target.z - this.target.z) < 0.5 && Math.abs(g.distance - this.distance) < 0.5) this.go(g, false);
  }

  private go(pose: Pose, animate: boolean): void {
    if (animate) {
      this.goal = pose;
      return;
    }
    this.goal = null;
    this.target = { ...pose.target };
    this.distance = pose.distance;
  }
}
