import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  FrontSide,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import type { GraphView, SceneView } from "../../application/contracts/scene";
import { WORLD_UP } from "../../application/controllers/orbit-camera";
import type { RGB } from "../../application/mappers/palette.mapper";
import { REGION_COUNT } from "../../domain/contracts/anatomy";
import type { UiHost } from "../dom/ui-host";
import { SHELL_RESOLUTION, brainSurface } from "./brain-mesh";
import { LabelOverlay } from "./label-overlay";
import { glowMaterial, rimMaterial } from "./materials";
import { DARK_3D, Theme3D, sceneTheme } from "./theme";
import { WireTracker } from "./wire-sync";

const CURVE_SEGMENTS = 6;
const PULSE_TAIL = 3;

const rgb01 = (c: RGB): [number, number, number] => [c[0] / 255, c[1] / 255, c[2] / 255];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Points cloud with per-point position, tint, size and alpha. */
class GlowCloud {
  readonly points: Points;
  private readonly geometry = new BufferGeometry();
  readonly position: Float32Array;
  readonly tint: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;

  constructor(
    readonly capacity: number,
    readonly material: ShaderMaterial
  ) {
    this.position = new Float32Array(capacity * 3);
    this.tint = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    const attr = (name: string, arr: Float32Array, n: number) =>
      this.geometry.setAttribute(name, new BufferAttribute(arr, n).setUsage(DynamicDrawUsage));
    attr("position", this.position, 3);
    attr("tint", this.tint, 3);
    attr("size", this.size, 1);
    attr("alpha", this.alpha, 1);
    this.points = new Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  commit(count: number): void {
    this.geometry.setDrawRange(0, count);
    for (const name of ["position", "tint", "size", "alpha"]) this.geometry.getAttribute(name).needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Line segments with per-vertex colour, rebuilt when the layout moves. */
class Wires {
  readonly lines: LineSegments;
  private geometry = new BufferGeometry();
  position = new Float32Array(0);
  color = new Float32Array(0);

  constructor(readonly material: LineBasicMaterial) {
    this.lines = new LineSegments(this.geometry, material);
    this.lines.frustumCulled = false;
  }

  ensure(vertices: number): void {
    if (this.position.length === vertices * 3) return;
    this.geometry.dispose();
    this.geometry = new BufferGeometry();
    this.position = new Float32Array(vertices * 3);
    this.color = new Float32Array(vertices * 3);
    this.geometry.setAttribute("position", new BufferAttribute(this.position, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute("color", new BufferAttribute(this.color, 3).setUsage(DynamicDrawUsage));
    this.lines.geometry = this.geometry;
  }

  commit(positions: boolean, colors: boolean): void {
    if (positions) this.geometry.getAttribute("position").needsUpdate = true;
    if (colors) this.geometry.getAttribute("color").needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Renders a SceneView with three.js: a translucent brain shell tinted by lobe,
 * neurons as lit spheres with glowing halos, synapses as curved tracts, and
 * action potentials as travelling sparks. Labels go to a 2D overlay.
 *
 * Reads only the plain-data read model (GraphView per rebuild, FrameView per
 * frame); it never touches domain objects.
 */
export class WebGLBrainRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 1, 1e6);
  private readonly overlay: LabelOverlay;
  private theme: Theme3D = DARK_3D;

  private readonly shellFill: Mesh;
  private readonly shellRim: Mesh;
  private somas: InstancedMesh;
  private halos: GlowCloud;
  private sparks: GlowCloud;
  private readonly synapses = new Wires(new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  private readonly dendrites = new Wires(new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0.55 }));

  private readonly wires = new WireTracker();
  private setupKey = "";
  private w = 0;
  private h = 0;
  private dpr = 1;
  private readonly m = new Matrix4();
  /** Scratch control point for curves. */
  private readonly ctl = new Float64Array(3);
  private rgb = new Float32Array(0);
  private rgbFor: unknown = null;
  private readonly c = new Color();

  /** Shell grid for this platform: phones build a coarser one. */
  private get shellResolution(): number {
    return this.ui.isMobile() ? SHELL_RESOLUTION.mobile : SHELL_RESOLUTION.desktop;
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    private readonly ui: Pick<UiHost, "isDark" | "isMobile" | "themeColors" | "fontFamily">
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.overlay = new LabelOverlay(overlayCanvas, ui);

    this.scene.add(new AmbientLight(0xffffff, 0.55));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(-0.4, -1, 0.6);
    this.camera.add(key);
    const fill = new DirectionalLight(0xb9a8ff, 0.6);
    fill.position.set(0.8, 0.3, -0.5);
    this.camera.add(fill);
    this.scene.add(this.camera);

    const surface = brainSurface(this.shellResolution);
    this.shellFill = new Mesh(
      surface.geometry,
      new MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.45, metalness: 0, side: FrontSide })
    );
    this.shellRim = new Mesh(surface.geometry, rimMaterial(this.theme.glowBlending, this.theme.rimOpacity, this.theme.rimPower));
    this.shellFill.renderOrder = 1;
    this.shellRim.renderOrder = 2;

    this.somas = new InstancedMesh(new IcosahedronGeometry(1, 2), new MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }), 1);
    this.halos = new GlowCloud(1, glowMaterial(this.theme.glowBlending));
    this.sparks = new GlowCloud(1, glowMaterial(this.theme.glowBlending));
    this.halos.points.renderOrder = 3;
    this.sparks.points.renderOrder = 4;

    this.scene.add(this.synapses.lines, this.dendrites.lines, this.somas, this.shellFill, this.shellRim, this.halos.points, this.sparks.points);
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.overlay.resize(w, h, dpr);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Theme, palette or GPU context changed: rebuild colours and buffers on the next frame. */
  invalidate(): void {
    this.setupKey = "";
  }

  dispose(): void {
    (this.shellFill.material as MeshStandardMaterial).dispose();
    (this.shellRim.material as ShaderMaterial).dispose();
    this.somas.geometry.dispose();
    (this.somas.material as MeshStandardMaterial).dispose();
    this.somas.dispose();
    this.halos.dispose();
    this.sparks.dispose();
    this.synapses.dispose();
    this.dendrites.dispose();
    this.renderer.dispose();
  }

  // --- Per-graph / per-theme setup ------------------------------------------------

  /** Palette colours as 0..1 RGB triples, cached per palette. */
  private paletteRgb(palette: SceneView["palette"]): Float32Array {
    if (this.rgbFor !== palette.colors) {
      this.rgbFor = palette.colors;
      this.rgb = Float32Array.from(palette.colors.flatMap((c) => rgb01(c)));
    }
    return this.rgb;
  }

  private replaceCloud(old: GlowCloud, capacity: number, order: number): GlowCloud {
    this.scene.remove(old.points);
    old.dispose();
    const cloud = new GlowCloud(capacity, glowMaterial(this.theme.glowBlending));
    cloud.points.renderOrder = order;
    this.scene.add(cloud.points);
    return cloud;
  }

  private setup(scene: SceneView): void {
    const dark = this.ui.isDark();
    const { graph, palette } = scene;
    const key = `${graph.version}|${dark}|${palette.colors.flat().join(",")}`;
    if (key === this.setupKey) return;
    this.setupKey = key;
    this.theme = sceneTheme(dark, this.ui.themeColors(this.canvas));
    const th = this.theme;
    const n = graph.count;

    // Shell: lobe tints, brighter where notes live, blended across borders.
    this.shellFill.scale.setScalar(graph.volume.W);
    this.shellRim.scale.setScalar(graph.volume.W);
    const surface = brainSurface(this.shellResolution);
    const colors = surface.geometry.getAttribute("color") as BufferAttribute;
    const lit = Array.from({ length: REGION_COUNT }, (_, r) => {
      if (!graph.paraMode) return th.neutralShell.map((c) => c * th.usedRegion * 0.8);
      const k = graph.regionUsed[r] ? th.usedRegion : th.unusedRegion;
      return rgb01(palette.colors[r]).map((c) => c * k);
    });
    const W = surface.vertexWeights;
    for (let i = 0; i < surface.vertexRegion.length; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < REGION_COUNT; k++) {
        const w = W[i * REGION_COUNT + k];
        if (!w) continue;
        r += lit[k][0] * w;
        g += lit[k][1] * w;
        b += lit[k][2] * w;
      }
      colors.setXYZ(i, r, g, b);
    }
    colors.needsUpdate = true;
    (this.shellFill.material as MeshStandardMaterial).opacity = th.shellOpacity;
    const rim = this.shellRim.material as ShaderMaterial;
    rim.uniforms.uOpacity.value = th.rimOpacity;
    rim.uniforms.uPower.value = th.rimPower;
    this.synapses.material.opacity = th.synapseOpacity;

    // Neuron buffers sized for this graph.
    if (this.somas.count !== n || this.somas.instanceMatrix.count < n) {
      this.scene.remove(this.somas);
      this.somas.dispose();
      this.somas = new InstancedMesh(this.somas.geometry, this.somas.material, Math.max(1, n));
      this.somas.instanceMatrix.setUsage(DynamicDrawUsage);
      this.scene.add(this.somas);
    }
    if (this.halos.capacity < n) this.halos = this.replaceCloud(this.halos, n, 3);
    const sparkCapacity = graph.maxPulses * (PULSE_TAIL + 1);
    if (this.sparks.capacity < sparkCapacity) this.sparks = this.replaceCloud(this.sparks, sparkCapacity, 4);
    for (const mat of [rim, this.halos.material, this.sparks.material]) {
      mat.blending = th.glowBlending;
      mat.needsUpdate = true;
    }

    this.dendrites.ensure(graph.dendrites.reduce((s, d) => s + d.length / 4, 0) * 2);
    this.synapses.ensure(graph.synapseA.length * CURVE_SEGMENTS * 2);
    this.wires.reset();
  }

  // --- Frame ----------------------------------------------------------------------

  render(scene: SceneView): void {
    if (!this.w || !this.h) return;
    this.setup(scene);
    const th = this.theme;
    const { graph, frame, palette, focus, hover } = scene;
    const pos = frame.positions;
    const act = frame.activation;
    const cam = scene.camera;

    // Camera.
    const eye = cam.eye;
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.up.set(WORLD_UP.x, WORLD_UP.y, WORLD_UP.z);
    this.camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
    this.camera.near = Math.max(1, cam.distance * 0.01);
    this.camera.far = cam.distance * 4 + graph.volume.W * 4;
    this.camera.updateProjectionMatrix();
    const proj = (this.h * this.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    for (const mat of [this.halos.material, this.sparks.material]) mat.uniforms.uProj.value = proj;

    const dim = (i: number) => !!focus && !focus.has(i);
    const rgb = this.paletteRgb(palette);
    const colorOf = palette.colorOf;

    // Somas & halos (every frame: activation changes continuously). No per-neuron allocations.
    const { position: hp, tint: ht } = this.halos;
    for (let i = 0; i < graph.count; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const born = frame.presence[i];
      const radius = graph.radius[i];
      const a = act[i];
      const s = radius * born * (1 + a * 0.35) * (i === hover ? 1.4 : 1);
      this.m.makeScale(s, s, s).setPosition(x, y, z);
      this.somas.setMatrixAt(i, this.m);
      const ci = colorOf[i] * 3;
      const r = rgb[ci];
      const g = rgb[ci + 1];
      const b = rgb[ci + 2];
      const fade = dim(i) ? 0.82 : 0;
      const glow = a * 0.6;
      this.c.setRGB(
        mix(mix(r, 1, glow), th.fade[0], fade),
        mix(mix(g, 1, glow), th.fade[1], fade),
        mix(mix(b, 1, glow), th.fade[2], fade)
      );
      this.somas.setColorAt(i, this.c);
      hp[i * 3] = x;
      hp[i * 3 + 1] = y;
      hp[i * 3 + 2] = z;
      ht[i * 3] = r;
      ht[i * 3 + 1] = g;
      ht[i * 3 + 2] = b;
      this.halos.size[i] = radius * (5 + a * 6) * (i === hover ? 1.6 : 1) * born;
      this.halos.alpha[i] = (th.glowBase + a * 0.9 + (i === scene.active ? 0.5 : 0)) * (dim(i) ? 0.12 : 1) * born;
    }
    this.somas.count = graph.count;
    this.somas.instanceMatrix.needsUpdate = true;
    if (this.somas.instanceColor) this.somas.instanceColor.needsUpdate = true;
    this.halos.commit(graph.count);

    // Wires: rewrite positions when the layout moved, colours when the focus changed.
    const writes = this.wires.frame(frame.layoutVersion, scene.focusVersion, scene.display.showDendrites);
    if (writes.synapses) this.writeSynapses(scene, writes.synapses.positions, writes.synapses.colors);
    this.dendrites.lines.visible = scene.display.showDendrites;
    if (writes.dendrites) this.writeDendrites(scene, writes.dendrites.positions, writes.dendrites.colors);

    // Action potentials with a short tail.
    let k = 0;
    const sparkSize = 7 * Math.sqrt(graph.volume.scale);
    const ctl = this.ctl;
    const { position: sp, tint: st } = this.sparks;
    for (const p of frame.pulses) {
      const e = p.synapse;
      const a = graph.synapseA[e];
      const b = graph.synapseB[e];
      if (frame.presence[a] === 0 || frame.presence[b] === 0) continue;
      const ci = colorOf[p.source] * 3;
      const fade = focus && !(focus.has(a) || focus.has(b)) ? 0.2 : 1;
      controlPoint(graph, pos, e, ctl);
      for (let t = 0; t <= PULSE_TAIL; t++) {
        const tt = p.t - t * 0.04;
        if (tt < 0) break;
        curvePoint(pos, a, b, ctl, p.forward ? tt : 1 - tt, sp, k * 3);
        st[k * 3] = rgb[ci];
        st[k * 3 + 1] = rgb[ci + 1];
        st[k * 3 + 2] = rgb[ci + 2];
        this.sparks.size[k] = sparkSize * (p.strong ? 1.5 : 1) * (1 - t * 0.2);
        this.sparks.alpha[k] = fade * (t === 0 ? 1 : 0.45 - t * 0.1);
        k++;
      }
    }
    this.sparks.commit(k);

    this.renderer.render(this.scene, this.camera);
    this.overlay.draw(scene, th);
  }

  private writeSynapses(scene: SceneView, positions: boolean, colors: boolean): void {
    const th = this.theme;
    const { graph, frame, focus, hover, palette } = scene;
    const out = this.synapses.position;
    const col = this.synapses.color;
    const rgbAll = this.paletteRgb(palette);
    let v = 0;
    for (let e = 0; e < graph.synapseA.length; e++) {
      const a = graph.synapseA[e];
      const b = graph.synapseB[e];
      // A link shows in full as soon as both ends exist; only neurons grow in gradually.
      const unborn = frame.presence[a] === 0 || frame.presence[b] === 0;
      let rgb: readonly number[] = graph.synapseCross[e] ? th.crossSynapse : th.synapse;
      let k = 1;
      if (hover >= 0 && (a === hover || b === hover)) {
        const ci = palette.colorOf[hover] * 3;
        rgb = [rgbAll[ci], rgbAll[ci + 1], rgbAll[ci + 2]];
        k = 2.2;
      } else if (focus) {
        k = focus.has(a) && focus.has(b) ? 1.2 : 0.15;
      }
      if (positions && unborn) {
        // A link to a note that does not exist yet collapses to a point.
        for (let o = v * 3, end = (v + 2 * CURVE_SEGMENTS) * 3; o < end; o += 3) {
          out[o] = frame.positions[a * 3];
          out[o + 1] = frame.positions[a * 3 + 1];
          out[o + 2] = frame.positions[a * 3 + 2];
        }
      } else if (positions) {
        // Segment s runs from curve point s to s + 1; each point is written straight into both ends.
        controlPoint(graph, frame.positions, e, this.ctl);
        for (let s = 0; s <= CURVE_SEGMENTS; s++) {
          const t = s / CURVE_SEGMENTS;
          if (s < CURVE_SEGMENTS) curvePoint(frame.positions, a, b, this.ctl, t, out, (v + 2 * s) * 3);
          if (s > 0) curvePoint(frame.positions, a, b, this.ctl, t, out, (v + 2 * s - 1) * 3);
        }
      }
      if (colors) {
        const r = rgb[0] * k;
        const g = rgb[1] * k;
        const bl = rgb[2] * k;
        for (let o = v * 3, end = (v + 2 * CURVE_SEGMENTS) * 3; o < end; o += 3) {
          col[o] = r;
          col[o + 1] = g;
          col[o + 2] = bl;
        }
      }
      v += 2 * CURVE_SEGMENTS;
    }
    this.synapses.commit(positions, colors);
  }

  private writeDendrites(scene: SceneView, positions: boolean, colors: boolean): void {
    const { graph, frame, focus, palette } = scene;
    const out = this.dendrites.position;
    const col = this.dendrites.color;
    const plane = graph.dendritePlane;
    const fadeTo = this.theme.fade;
    const rgb = this.paletteRgb(palette);
    let v = 0;
    for (let i = 0; i < graph.count; i++) {
      const d = graph.dendrites[i];
      const o = i * 6;
      const radius = graph.radius[i] * (frame.presence[i] === 0 ? 0 : 1);
      const x = frame.positions[i * 3];
      const y = frame.positions[i * 3 + 1];
      const z = frame.positions[i * 3 + 2];
      const ci = palette.colorOf[i] * 3;
      const f = focus && !focus.has(i) ? 0.85 : 0;
      for (let s = 0; s < d.length; s += 2) {
        if (positions) {
          const a = d[s] * radius;
          const c = d[s + 1] * radius;
          out[v * 3] = x + a * plane[o] + c * plane[o + 3];
          out[v * 3 + 1] = y + a * plane[o + 1] + c * plane[o + 4];
          out[v * 3 + 2] = z + a * plane[o + 2] + c * plane[o + 5];
        }
        if (colors) {
          col[v * 3] = mix(rgb[ci], fadeTo[0], f);
          col[v * 3 + 1] = mix(rgb[ci + 1], fadeTo[1], f);
          col[v * 3 + 2] = mix(rgb[ci + 2], fadeTo[2], f);
        }
        v++;
      }
    }
    this.dendrites.commit(positions, colors);
  }
}

/**
 * Quadratic-curve control point for synapse `e`, written into `out`. Local
 * tracts bow slightly sideways; cross-lobe tracts bow toward the brain's core.
 */
function controlPoint(graph: GraphView, pos: Float32Array, e: number, out: Float64Array): void {
  const a = graph.synapseA[e] * 3;
  const b = graph.synapseB[e] * 3;
  const mx = (pos[a] + pos[b]) / 2;
  const my = (pos[a + 1] + pos[b + 1]) / 2;
  const mz = (pos[a + 2] + pos[b + 2]) / 2;
  const curv = graph.synapseCurv[e];
  if (graph.synapseCross[e]) {
    const c = graph.volume.center;
    const k = Math.abs(curv) * 1.6;
    out[0] = mx + (c.x - mx) * k;
    out[1] = my + (c.y - my) * k;
    out[2] = mz + (c.z - mz) * k;
    return;
  }
  // Perpendicular offset in the horizontal plane, proportional to the link length.
  const dx = pos[b] - pos[a];
  const dy = pos[b + 1] - pos[a + 1];
  const dz = pos[b + 2] - pos[a + 2];
  const l = Math.hypot(dz, dx) || 1;
  const k = (Math.hypot(dx, dy, dz) * curv) / l;
  out[0] = mx + dz * k;
  out[1] = my;
  out[2] = mz - dx * k;
}

/** Point at parameter t on the curve from neuron a → ctl → neuron b, written into `out` at `o`. */
function curvePoint(pos: Float32Array, a: number, b: number, ctl: Float64Array, t: number, out: Float32Array, o: number): void {
  const it = 1 - t;
  const wa = it * it;
  const wc = 2 * it * t;
  const wb = t * t;
  out[o] = wa * pos[a * 3] + wc * ctl[0] + wb * pos[b * 3];
  out[o + 1] = wa * pos[a * 3 + 1] + wc * ctl[1] + wb * pos[b * 3 + 1];
  out[o + 2] = wa * pos[a * 3 + 2] + wc * ctl[2] + wb * pos[b * 3 + 2];
}
