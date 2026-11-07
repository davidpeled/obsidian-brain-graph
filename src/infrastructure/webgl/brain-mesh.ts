import { BufferAttribute, BufferGeometry, MeshBasicMaterial } from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { REGION_COUNT, R_OCCIPITAL } from "../../domain/contracts/anatomy";
import { ASPECT, DEPTH_EXTENT, GRID, brainField } from "../../domain/model/anatomy/brain-volume";

export interface BrainSurface {
  /** Indexed surface in normalised brain units (scale the mesh by the brain width W). */
  geometry: BufferGeometry;
  /** Region of each vertex. */
  vertexRegion: Int8Array;
  /**
   * Per-vertex blend weights over regions (REGION_COUNT per vertex, summing
   * to 1), so lobe colours fade into each other instead of meeting at a seam.
   */
  vertexWeights: Float32Array;
}

/** How far (W units) lobe colours bleed across a border. */
const BLEND_RADIUS = 0.045;
const LOBES = R_OCCIPITAL + 1;
const isCerebral = (r: number) => r >= 0 && r < LOBES;

const RESOLUTION = 128;
/** The marching-cubes cube [-1, 1]³ maps onto this normalised box. */
const CENTER = { x: 0.5, y: ASPECT / 2, z: 0 };
const HALF = 0.56;

/**
 * Per-process singleton: the shell mesh, built on first use and shared by every
 * renderer (every open view) until the plugin's code is unloaded. Renderers
 * must not dispose its geometry. Each renderer rewrites its colour attribute on
 * setup; that is safe only because every view shows the same vault with the same
 * settings and theme, so they all write the same colours. Per-view shell colours
 * would need a per-renderer colour buffer.
 */
let sharedSurface: BrainSurface | null = null;

/** In-place separable box blur of a GW × GH grid. */
function boxBlur(src: Float32Array, radius: number): void {
  const { GW, GH } = GRID;
  const tmp = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, len: number, lines: number, stride: number, step: number) => {
    for (let l = 0; l < lines; l++) {
      const base = l * stride;
      let acc = 0;
      for (let i = -radius; i <= radius; i++) acc += from[base + Math.min(len - 1, Math.max(0, i)) * step];
      for (let i = 0; i < len; i++) {
        to[base + i * step] = acc / (2 * radius + 1);
        acc += from[base + Math.min(len - 1, i + radius + 1) * step] - from[base + Math.max(0, i - radius) * step];
      }
    }
  };
  pass(src, tmp, GW, GH, GW, 1); // rows
  pass(tmp, src, GH, GW, 1, GW); // columns
}

/**
 * Soft lobe membership on the side-view grid: one-hot lobe maps blurred twice
 * (≈ Gaussian). Computed once in O(cells) instead of sampling around every vertex.
 */
function softLobes(): Float32Array[] {
  const { GW, GH, CELL } = GRID;
  const lobe = brainField().lobe;
  const radius = Math.max(1, Math.round(BLEND_RADIUS / CELL / 2));
  return Array.from({ length: LOBES }, (_, r) => {
    const map = new Float32Array(GW * GH);
    for (let c = 0; c < map.length; c++) map[c] = lobe[c] === r ? 1 : 0;
    boxBlur(map, radius);
    boxBlur(map, radius);
    return map;
  });
}

function bilinear(map: Float32Array, x: number, y: number): number {
  const { GW, GH, CELL } = GRID;
  const fx = Math.min(GW - 1.001, Math.max(0, x / CELL - 0.5));
  const fy = Math.min(GH - 1.001, Math.max(0, y / CELL - 0.5));
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const c = iy * GW + ix;
  return (map[c] * (1 - tx) + map[c + 1] * tx) * (1 - ty) + (map[c + GW] * (1 - tx) + map[c + GW + 1] * tx) * ty;
}

/**
 * Marching cubes emits a triangle soup (3 vertices per triangle). Neighbouring
 * cubes compute bit-identical shared-edge vertices, so an exact numeric key on
 * the quantised position merges them — much faster than three's generic,
 * string-keyed mergeVertices. Positions are mapped from the cube to brain units.
 */
function indexSoup(local: Float32Array, normals: Float32Array, count: number): BufferGeometry {
  const Q = 1 << 17; // quantisation steps across [-1, 1]
  const key = (i: number) =>
    Math.round((local[i] + 1) * (Q / 2)) + Math.round((local[i + 1] + 1) * (Q / 2)) * (Q + 1) + Math.round((local[i + 2] + 1) * (Q / 2)) * (Q + 1) * (Q + 1);
  const seen = new Map<number, number>();
  const index = new Uint32Array(count);
  const pos: number[] = [];
  const nrm: number[] = [];
  for (let v = 0; v < count; v++) {
    const i = v * 3;
    const k = key(i);
    let id = seen.get(k);
    if (id === undefined) {
      id = pos.length / 3;
      seen.set(k, id);
      pos.push(CENTER.x + local[i] * HALF, CENTER.y + local[i + 1] * HALF, CENTER.z + local[i + 2] * HALF);
      nrm.push(normals[i], normals[i + 1], normals[i + 2]);
    }
    index[v] = id;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(pos), 3));
  geometry.setAttribute("normal", new BufferAttribute(Float32Array.from(nrm), 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

/**
 * Polygonises the domain's brain field (zero level set) once and caches the
 * result: the shape is scale-independent, only the mesh transform changes.
 */
export function brainSurface(): BrainSurface {
  if (sharedSurface) return sharedSurface;
  const field = brainField();
  const mc = new MarchingCubes(RESOLUTION, new MeshBasicMaterial(), false, false, 300_000);
  mc.isolation = 0;
  const n = RESOLUTION;
  const half = n / 2;
  // Voxels beyond the brain's depth or height only need to be "outside":
  // a cheap negative value instead of a full field lookup (~40% of the box).
  const margin = 2 * ((2 * HALF) / n);
  for (let z = 0; z < n; z++) {
    const nz = CENTER.z + ((z - half) / half) * HALF;
    const outZ = DEPTH_EXTENT + margin - Math.abs(nz);
    for (let y = 0; y < n; y++) {
      const ny = CENTER.y + ((y - half) / half) * HALF;
      const outY = Math.min(ny + margin, ASPECT + margin - ny);
      const row = z * n * n + y * n;
      if (outZ < 0 || outY < 0) {
        mc.field.fill(Math.min(outZ, outY, -margin), row, row + n);
        continue;
      }
      for (let x = 0; x < n; x++) mc.field[row + x] = field.surface(CENTER.x + ((x - half) / half) * HALF, ny, nz);
    }
  }
  mc.update();

  const geometry = indexSoup(mc.positionArray, mc.normalArray, mc.count);
  mc.geometry.dispose();
  (mc.material as MeshBasicMaterial).dispose();

  const pos = geometry.getAttribute("position") as BufferAttribute;
  const count = pos.count;
  const soft = softLobes();
  const vertexRegion = new Int8Array(count);
  const vertexWeights = new Float32Array(count * REGION_COUNT);
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const own = field.regionNear(x, y, pos.getZ(i));
    vertexRegion[i] = own;
    const o = i * REGION_COUNT;
    let total = 0;
    if (isCerebral(own)) {
      // Cerebral lobes blend with each other; cerebellum and brainstem stay crisp.
      for (let r = 0; r < LOBES; r++) total += vertexWeights[o + r] = bilinear(soft[r], x, y);
    }
    if (total < 1e-6) {
      vertexWeights.fill(0, o, o + REGION_COUNT);
      vertexWeights[o + own] = 1;
    } else {
      for (let r = 0; r < LOBES; r++) vertexWeights[o + r] /= total;
    }
  }
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.computeBoundingSphere();
  sharedSurface = { geometry, vertexRegion, vertexWeights };
  return sharedSurface;
}
