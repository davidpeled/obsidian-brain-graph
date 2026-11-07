import type { Connectome, Neuron } from "../../contracts/connectome";
import type { BrainLayout } from "../../contracts/dynamics";
import type { RegionVolume } from "../anatomy/brain-volume";
import type { RandomSource } from "../shared/random";

// Tuning (world units; the brain is 1000*scale long).
export const LINK_DIST = 30;
const REPEL_R = 64;
const REPEL_K = 55;
const ANCHOR_K = 0.012;
const VELOCITY_DECAY = 0.6;
const MAX_SPEED = 30;
const ALPHA_DECAY = 0.985;
const ALPHA_MIN = 0.004;

/**
 * 3D force-directed layout where neurons cannot leave their lobe.
 * Short-range repulsion (hashed spatial grid), synaptic springs (cross-lobe
 * tracts pull only gently), a weak pull to the cluster anchor, and
 * confinement: each axis of a step is taken only if it stays inside an
 * allowed region, so neurons slide along lobe walls instead of crossing them.
 */
export class LayoutSimulation implements BrainLayout {
  alpha = 1;
  private head = new Int32Array(0);
  private next = new Int32Array(0);
  private cell = new Int32Array(0);

  constructor(
    private readonly connectome: Connectome,
    private readonly volume: RegionVolume,
    private readonly rng: RandomSource
  ) {}

  get running(): boolean {
    return this.alpha > 0;
  }

  reheat(alpha: number): void {
    this.alpha = Math.max(this.alpha, alpha);
  }

  canOccupy(n: Neuron, x: number, y: number, z: number): boolean {
    return this.volume.allows(n.allowed, x, y, z);
  }

  /** Move a neuron by hand; it stays pinned until released. */
  drag(n: Neuron, x: number, y: number, z: number): void {
    n.fixed = true;
    if (this.canOccupy(n, x, y, z)) {
      n.x = x;
      n.y = y;
      n.z = z;
    }
    this.reheat(0.25);
  }

  release(n: Neuron): void {
    n.fixed = false;
  }

  tick(): void {
    if (!this.running) return;
    this.repel();
    this.springs();
    this.integrate();
    this.alpha *= ALPHA_DECAY;
    if (this.alpha < ALPHA_MIN) this.alpha = 0;
  }

  private repel(): void {
    const nodes = this.connectome.neurons;
    const n = nodes.length;
    const a = this.alpha;
    const R = REPEL_R;
    const R2 = R * R;
    let size = 1;
    while (size < n * 2) size <<= 1;
    const mask = size - 1;
    if (this.head.length !== size) this.head = new Int32Array(size);
    if (this.next.length < n) {
      this.next = new Int32Array(n);
      this.cell = new Int32Array(n * 3);
    }
    const { head, next, cell } = this;
    head.fill(-1);
    const hash = (x: number, y: number, z: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(nodes[i].x / R);
      const cy = Math.floor(nodes[i].y / R);
      const cz = Math.floor(nodes[i].z / R);
      cell[i * 3] = cx;
      cell[i * 3 + 1] = cy;
      cell[i * 3 + 2] = cz;
      const h = hash(cx, cy, cz);
      next[i] = head[h];
      head[h] = i;
    }
    for (let i = 0; i < n; i++) {
      const ni = nodes[i];
      const cx = cell[i * 3];
      const cy = cell[i * 3 + 1];
      const cz = cell[i * 3 + 2];
      for (let oz = -1; oz <= 1; oz++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const xx = cx + ox;
            const yy = cy + oy;
            const zz = cz + oz;
            for (let j = head[hash(xx, yy, zz)]; j !== -1; j = next[j]) {
              // Skip lower indices (pair handled once) and hash collisions from other cells.
              if (j <= i || cell[j * 3] !== xx || cell[j * 3 + 1] !== yy || cell[j * 3 + 2] !== zz) continue;
              const nj = nodes[j];
              let dx = nj.x - ni.x;
              let dy = nj.y - ni.y;
              let dz = nj.z - ni.z;
              let d2 = dx * dx + dy * dy + dz * dz;
              if (d2 >= R2) continue;
              if (d2 < 0.01) {
                dx = this.rng() - 0.5;
                dy = this.rng() - 0.5;
                dz = this.rng() - 0.5;
                d2 = dx * dx + dy * dy + dz * dz + 0.01;
              }
              let f = (REPEL_K * a) / d2;
              const minD = ni.r + nj.r + 3;
              if (d2 < minD * minD) {
                const d = Math.sqrt(d2);
                f += ((minD - d) / d) * 0.25;
              }
              ni.vx -= dx * f;
              ni.vy -= dy * f;
              ni.vz -= dz * f;
              nj.vx += dx * f;
              nj.vy += dy * f;
              nj.vz += dz * f;
            }
          }
        }
      }
    }
  }

  private springs(): void {
    const nodes = this.connectome.neurons;
    const a = this.alpha;
    for (const e of this.connectome.synapses) {
      const A = nodes[e.a];
      const B = nodes[e.b];
      const dx = B.x + B.vx - A.x - A.vx;
      const dy = B.y + B.vy - A.y - A.vy;
      const dz = B.z + B.vz - A.z - A.vz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const k = e.cross ? 0.004 : 0.5 / Math.max(1, Math.min(A.degree, B.degree));
      const L = e.cross ? 0 : LINK_DIST + A.r + B.r;
      const f = ((d - L) / d) * a * k;
      const bias = A.degree / (A.degree + B.degree || 1);
      B.vx -= dx * f * bias;
      B.vy -= dy * f * bias;
      B.vz -= dz * f * bias;
      A.vx += dx * f * (1 - bias);
      A.vy += dy * f * (1 - bias);
      A.vz += dz * f * (1 - bias);
    }
  }

  private integrate(): void {
    const a = this.alpha;
    for (const n of this.connectome.neurons) {
      if (n.fixed) {
        n.vx = n.vy = n.vz = 0;
        continue;
      }
      n.vx = (n.vx + (n.ax - n.x) * ANCHOR_K * a) * VELOCITY_DECAY;
      n.vy = (n.vy + (n.ay - n.y) * ANCHOR_K * a) * VELOCITY_DECAY;
      n.vz = (n.vz + (n.az - n.z) * ANCHOR_K * a) * VELOCITY_DECAY;
      const sp = Math.hypot(n.vx, n.vy, n.vz);
      if (sp > MAX_SPEED) {
        n.vx *= MAX_SPEED / sp;
        n.vy *= MAX_SPEED / sp;
        n.vz *= MAX_SPEED / sp;
      }
      if (!this.canOccupy(n, n.x, n.y, n.z)) {
        // Stranded (e.g. after a rebuild): walk home.
        n.x += (n.ax - n.x) * 0.1;
        n.y += (n.ay - n.y) * 0.1;
        n.z += (n.az - n.z) * 0.1;
        continue;
      }
      // Axis by axis, so a blocked step slides along the wall.
      if (this.canOccupy(n, n.x + n.vx, n.y, n.z)) n.x += n.vx;
      else n.vx = 0;
      if (this.canOccupy(n, n.x, n.y + n.vy, n.z)) n.y += n.vy;
      else n.vy = 0;
      if (this.canOccupy(n, n.x, n.y, n.z + n.vz)) n.z += n.vz;
      else n.vz = 0;
    }
  }
}
