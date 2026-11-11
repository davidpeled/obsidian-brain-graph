import type { SceneView } from "../../application/contracts/scene";
import type { RGB } from "../../application/mappers/palette.mapper";
import type { UiHost } from "../dom/ui-host";
import type { Theme3D } from "./theme";

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Screen-space text over the WebGL canvas: note names and lobe captions. */
export class LabelOverlay {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private px = new Float32Array(0);
  private py = new Float32Array(0);
  private pdepth = new Float32Array(0);
  private pscale = new Float32Array(0);
  private readonly scratch = { x: 0, y: 0, depth: 0, scale: 0 };
  private readonly point = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ui: Pick<UiHost, "fontFamily">
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PARA Brain: overlay 2D context unavailable");
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  draw(scene: SceneView, th: Theme3D): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawNodeLabels(scene, th);
    if (scene.display.showRegionLabels && scene.graph.paraMode) this.drawRegionLabels(scene, th);
  }

  private drawNodeLabels(scene: SceneView, th: Theme3D): void {
    const ctx = this.ctx;
    const { camera, focus, hover, graph, frame } = scene;
    const n = graph.count;
    // Project every neuron into reused typed arrays (no per-neuron objects each frame).
    if (this.px.length < n) {
      this.px = new Float32Array(n);
      this.py = new Float32Array(n);
      this.pdepth = new Float32Array(n);
      this.pscale = new Float32Array(n);
    }
    const { px, py, pdepth, pscale, point } = this;
    const tmp = this.scratch;
    for (let i = 0; i < n; i++) {
      point.x = frame.positions[i * 3];
      point.y = frame.positions[i * 3 + 1];
      point.z = frame.positions[i * 3 + 2];
      if (camera.projectTo(point, tmp)) {
        px[i] = tmp.x;
        py[i] = tmp.y;
        pdepth[i] = tmp.depth;
        pscale[i] = tmp.scale;
      } else {
        pscale[i] = 0; // behind the camera
      }
    }
    const onScreen = (i: number) => frame.presence[i] > 0.3 && pscale[i] > 0 && px[i] > -50 && py[i] > -50 && px[i] < this.w + 50 && py[i] < this.h + 50;
    let picks: number[];
    if (focus) {
      picks = [...focus].filter(onScreen).sort((a, b) => graph.degree[b] - graph.degree[a]).slice(0, 150);
    } else if (scene.display.showNodeLabels) {
      picks = [];
      for (let i = 0; i < n; i++) if (onScreen(i) && (graph.radius[i] * pscale[i] >= 6 || i === scene.active)) picks.push(i);
      picks = picks.sort((a, b) => pdepth[a] - pdepth[b]).slice(0, 120);
    } else {
      picks = [];
    }
    if (hover >= 0 && onScreen(hover)) picks = [hover, ...picks.filter((i) => i !== hover)];
    if (!picks.length) return;

    ctx.font = `11px ${this.ui.fontFamily()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = th.textStroke;
    ctx.fillStyle = th.text;
    const placed: [number, number, number, number][] = [];
    for (const i of picks) {
      if (!pscale[i]) continue;
      const name = graph.names[i];
      const x = px[i];
      const y = py[i] + graph.radius[i] * pscale[i] + 4;
      const label = name.length > 40 ? name.slice(0, 38) + "…" : name;
      const hw = ctx.measureText(label).width / 2 + 3;
      if (placed.some(([x0, y0, x1, y1]) => x + hw > x0 && x - hw < x1 && y + 14 > y0 && y < y1)) continue;
      placed.push([x - hw, y, x + hw, y + 14]);
      ctx.globalAlpha = i === hover ? 1 : 0.88;
      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /** Captions float over each region: the folder name only. */
  private drawRegionLabels(scene: SceneView, th: Theme3D): void {
    const ctx = this.ctx;
    const { graph } = scene;
    const font = this.ui.fontFamily();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.font = `600 13px ${font}`;
    ctx.lineWidth = 4;
    graph.captions.forEach((caption, r) => {
      if (!caption) return;
      const p = scene.camera.project(caption.at);
      if (!p) return;
      ctx.globalAlpha = graph.regionUsed[r] ? 0.95 : 0.4;
      ctx.strokeStyle = th.textStroke;
      ctx.strokeText(caption.text, p.x, p.y);
      ctx.fillStyle = rgba(scene.palette.colors[r], 1);
      ctx.fillText(caption.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;
  }
}
