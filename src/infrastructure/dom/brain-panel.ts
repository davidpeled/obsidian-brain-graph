import { BrainController, KEY_SHORTCUTS } from "../../application/controllers/brain.controller";
import { TouchInteraction } from "../../application/controllers/touch-interaction";
import type { SettingsService } from "../../application/contracts/settings";
import type { Unsubscribe } from "../../domain/contracts/vault";
import { WebGLBrainRenderer } from "../webgl/webgl.renderer";
import type { UiHost } from "./ui-host";

/** Render at most this many device pixels per CSS pixel (phones have 3x screens: 9 pixels per CSS pixel is wasted on glowing dots). */
const MAX_PIXEL_RATIO = 4;
const MOBILE_MAX_PIXEL_RATIO = 2;
/** Narrow panels (phones, split panes) hide the legend behind a toggle. */
const COMPACT_WIDTH = 560;

export interface MountedPanel {
  readonly controller: BrainController;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  // Create in the parent's document so the panel works in Obsidian popout windows.
  const e = parent.ownerDocument.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

/**
 * The brain UI as plain DOM: WebGL canvas + label overlay, toolbar, stats, legend and tooltip.
 * Translates DOM events into controller input and runs the frame loop.
 * Works in any host page (Obsidian view or the browser demo).
 */
export function mountBrainPanel(host: HTMLElement, controller: BrainController, settings: SettingsService, ui: UiHost): MountedPanel {
  // The window that shows this panel: the main window or an Obsidian popout.
  // Its own animation frames and resize events keep running when the main window is hidden.
  const win = host.ownerDocument.defaultView ?? window;
  const offs: Unsubscribe[] = [];
  const on = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    cb: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions
  ) => {
    target.addEventListener(type, cb, opts);
    offs.push(() => target.removeEventListener(type, cb, opts));
  };

  const wrap = el("div", "brain-graph-wrap", host);
  const mobile = ui.isMobile();
  wrap.classList.toggle("is-mobile", mobile);
  const canvas = el("canvas", "brain-graph-canvas", wrap);
  // Focusable so the keyboard can drive the camera (see controller.keyDown).
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    `PARA Brain. ${KEY_SHORTCUTS.orbit} rotate, ${KEY_SHORTCUTS.pan} pans, ${KEY_SHORTCUTS.zoom} zoom, ` +
      `${KEY_SHORTCUTS.fit} fits the brain, ${KEY_SHORTCUTS.autoRotate} toggles auto-rotate, / searches.`
  );
  const overlay = el("canvas", "brain-graph-overlay", wrap);
  let renderer: WebGLBrainRenderer;
  try {
    renderer = new WebGLBrainRenderer(canvas, overlay, ui);
  } catch (err) {
    // No WebGL (hardware acceleration off, unsupported GPU, too many contexts):
    // explain instead of leaving an empty pane.
    canvas.remove();
    overlay.remove();
    showMessage(
      wrap,
      "The 3D brain needs WebGL",
      "WebGL isn't available here. Turn on hardware acceleration in Obsidian's settings (or your browser), update your graphics drivers, then reopen this view.",
      err
    );
    return once({
      controller,
      dispose() {
        controller.dispose();
        wrap.remove();
      },
    });
  }

  // The GPU context can be lost (driver reset, GPU switch, too many contexts).
  // Pause until the browser restores it, then rebuild every GPU buffer.
  let contextLost = false;
  let lostNotice: HTMLElement | null = null;
  const onLost = (e: Event) => {
    e.preventDefault(); // allows the browser to restore the context
    contextLost = true;
    wrap.classList.add("is-context-lost"); // a lost canvas paints as a white, broken image
    lostNotice ??= showMessage(wrap, "Graphics context lost", "Restoring the 3D view…");
  };
  const onRestored = () => {
    contextLost = false;
    wrap.classList.remove("is-context-lost");
    lostNotice?.remove();
    lostNotice = null;
    renderer.invalidate();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  offs.push(() => {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
  });

  // Toolbar.
  const toolbar = el("div", "brain-graph-toolbar", wrap);
  const search = el("input", "brain-graph-search", toolbar);
  search.type = "search";
  search.placeholder = "Search neurons…";
  const button = (icon: string, label: string, onClick: () => void, shortcut?: string) => {
    // Real buttons: focusable, and Enter / Space activate them.
    const b = el("button", "clickable-icon brain-graph-btn", toolbar);
    b.type = "button";
    b.setAttribute("aria-label", shortcut ? `${label} (${shortcut})` : label);
    ui.renderIcon(b, icon);
    on(b, "click", onClick);
    return b;
  };
  button("maximize", "Fit brain", () => controller.fit(), KEY_SHORTCUTS.fit);
  button("zap", "Fire a random thought", () => controller.fireRandom());
  button("refresh-cw", "Regrow layout", () => controller.regrow());
  const firingBtn = button("activity", "Ambient firing", () => void controller.toggleAmbientFiring());
  const rotateBtn = button("rotate-3d", "Auto-rotate", () => void controller.toggleAutoRotate(), KEY_SHORTCUTS.autoRotate);
  // Only shown in narrow panels (CSS): the legend is collapsed there to leave room for the brain.
  const legendBtn = button("list", "Legend", () => {
    const open = wrap.classList.toggle("is-legend-open");
    setPressed(legendBtn, open);
  });
  legendBtn.classList.add("brain-graph-legend-toggle");
  const setPressed = (b: HTMLElement, on: boolean) => {
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", String(on));
  };
  const syncToggles = () => {
    setPressed(firingBtn, settings.get().ambientFiring);
    setPressed(rotateBtn, settings.get().autoRotate);
  };
  syncToggles();
  setPressed(legendBtn, false);
  offs.push(settings.onChange(syncToggles));

  on(search, "input", () => controller.search(search.value));
  on(search, "keydown", (e) => {
    if (e.key === "Enter") controller.focusFirstMatch();
    if (e.key === "Escape") {
      search.value = "";
      controller.search("");
    }
  });

  // Stats & legend.
  const stats = el("div", "brain-graph-stats", wrap);
  const legend = el("div", "brain-graph-legend", wrap);
  legend.setAttribute("role", "group");
  legend.setAttribute("aria-label", "Legend: focus a group");
  const renderChrome = () => {
    stats.replaceChildren();
    const s = controller.stats();
    if (s) {
      el("span", "", stats, s.summary);
      el("span", "brain-graph-stats-mode", stats, s.mode);
    }
    legend.replaceChildren();
    for (const item of controller.legend()) {
      const row = el("button", "brain-graph-legend-item", legend);
      row.type = "button";
      row.setAttribute("aria-label", `Focus ${item.title}${item.subtitle ? ` (${item.subtitle})` : ""}: ${item.count} ${item.count === 1 ? "note" : "notes"}`);
      if (!item.count) row.classList.add("is-empty");
      el("span", "brain-graph-legend-dot", row).style.setProperty("--dot-color", `rgb(${item.color.join(",")})`);
      const txt = el("span", "brain-graph-legend-text", row);
      el("span", "brain-graph-legend-title", txt, item.title);
      if (item.subtitle) el("span", "brain-graph-legend-sub", txt, item.subtitle);
      el("span", "brain-graph-legend-count", row, String(item.count));
      row.addEventListener("click", () => controller.focusLegend(item.target));
    }
    renderer.invalidate();
  };
  renderChrome();
  offs.push(controller.onGraphChanged(renderChrome));

  // Tooltip.
  const tooltip = el("div", "brain-graph-tooltip", wrap);
  offs.push(
    controller.onHoverChanged(() => {
      const t = controller.tooltip();
      tooltip.replaceChildren();
      if (t) {
        el("div", "brain-graph-tooltip-title", tooltip, t.title);
        for (const line of t.lines) el("div", "brain-graph-tooltip-sub", tooltip, line);
      }
      tooltip.classList.toggle("is-visible", !!t);
      canvas.classList.toggle("is-hovering", !!t);
    })
  );
  const placeTooltip = (e: PointerEvent, touch = false) => {
    // Under a finger the tooltip would sit beneath the hand: put it above the touch point instead.
    const x = Math.max(0, Math.min(e.offsetX + 14, wrap.clientWidth - 220));
    const y = touch ? Math.max(0, e.offsetY - 90) : Math.min(e.offsetY + 14, wrap.clientHeight - 70);
    tooltip.style.transform = `translate(${x}px, ${y}px)`;
  };

  // Keyboard: shortcuts work anywhere in the panel except while typing in the search box.
  on(wrap, "keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target === search) return;
    if (e.key === "/") {
      e.preventDefault();
      search.focus();
      return;
    }
    // Buttons keep their own Enter / Space.
    if (controller.keyDown(e.key, e.shiftKey)) e.preventDefault();
  });

  // Pointer input. Mouse goes straight to the controller; touch goes through TouchInteraction
  // (pinch / two-finger pan, tap-to-select, long-press), which holds the policy and is unit-tested.
  const touch = new TouchInteraction(controller, (fn, ms) => {
    const handle = win.setTimeout(fn, ms);
    return () => win.clearTimeout(handle);
  });
  offs.push(() => touch.dispose());

  on(canvas, "pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === "touch") touch.down(e.pointerId, e.offsetX, e.offsetY, e);
    else controller.pointerDown(e.offsetX, e.offsetY, e.button, e.shiftKey);
  });
  on(canvas, "pointermove", (e) => {
    if (e.pointerType === "touch") return touch.move(e.pointerId, e.offsetX, e.offsetY);
    controller.pointerMove(e.offsetX, e.offsetY);
    if (controller.hovering) placeTooltip(e);
  });
  on(canvas, "pointerup", (e) => {
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (e.pointerType !== "touch") return controller.pointerUp(e.metaKey || e.ctrlKey);
    if (touch.up(e.pointerId) && controller.hovering) placeTooltip(e, true);
  });
  // A touch "leaves" the canvas right after it lifts; that must not clear the selection.
  on(canvas, "pointerleave", (e) => {
    if (e.pointerType !== "touch") controller.pointerLeave();
  });
  on(canvas, "pointercancel", (e) => {
    if (e.pointerType === "touch") touch.cancel(e.pointerId);
    else controller.pointerCancel();
  });
  // A touch anywhere else (toolbar, legend, another pane) drops the tap selection.
  on(host.ownerDocument.documentElement, "pointerdown", (e) => {
    if (e.pointerType === "touch" && e.target !== canvas) controller.deselect();
  });
  on(
    canvas,
    "wheel",
    (e) => {
      e.preventDefault();
      controller.wheel(e.offsetX, e.offsetY, e.deltaY, e.ctrlKey);
    },
    { passive: false }
  );
  on(canvas, "dblclick", (e) => controller.doubleClick(e.offsetX, e.offsetY));
  on(canvas, "contextmenu", (e) => {
    // Touch long-press is handled above (Android also fires a contextmenu event for it).
    if (e.pointerType === "touch" || touch.ownsContextMenu) return e.preventDefault();
    if (controller.contextMenu(e.offsetX, e.offsetY, e)) e.preventDefault();
  });

  // Size & theme.
  const resize = () => {
    const w = Math.floor(wrap.clientWidth);
    const h = Math.floor(wrap.clientHeight);
    if (!w || !h) return;
    renderer.resize(w, h, Math.min(win.devicePixelRatio || 1, mobile ? MOBILE_MAX_PIXEL_RATIO : MAX_PIXEL_RATIO));
    wrap.classList.toggle("is-compact", w < COMPACT_WIDTH);
    controller.resize(w, h);
  };
  const observer = new win.ResizeObserver(resize);
  observer.observe(wrap);
  resize();
  offs.push(
    // The background follows the theme through CSS; the scene's colours are re-read.
    ui.onThemeChange(() => renderer.invalidate())
  );

  // Frame loop (skips work while the panel is hidden, e.g. a background tab).
  let raf = 0;
  let last = 0;
  const frame = (t: number) => {
    raf = win.requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    if (!wrap.isConnected || wrap.offsetParent === null || contextLost) return;
    controller.step(dt);
    const scene = controller.scene();
    if (scene) renderer.render(scene);
  };
  raf = win.requestAnimationFrame(frame);

  return once({
    controller,
    dispose() {
      win.cancelAnimationFrame(raf);
      observer.disconnect();
      offs.forEach((off) => off());
      controller.dispose();
      renderer.dispose();
      wrap.remove();
    },
  });
}

/** Make dispose idempotent: plugin unload and Obsidian's onClose may both call it. */
function once(panel: MountedPanel): MountedPanel {
  let disposed = false;
  return {
    controller: panel.controller,
    dispose() {
      if (disposed) return;
      disposed = true;
      panel.dispose();
    },
  };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "Unknown error";
}

/** A centred notice over the panel (no WebGL, lost context). */
function showMessage(parent: HTMLElement, title: string, detail: string, err?: unknown): HTMLElement {
  const box = el("div", "brain-graph-message", parent);
  el("div", "brain-graph-message-title", box, title);
  el("div", "brain-graph-message-detail", box, detail);
  if (err !== undefined) el("div", "brain-graph-message-error", box, describeError(err));
  return box;
}
