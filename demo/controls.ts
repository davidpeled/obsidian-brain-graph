/**
 * The demo's control-panel builder: labelled rows of selects, toggles, ranges,
 * text inputs and buttons inside a root element. Each control reads its value
 * through `get`, and `sync()` refreshes them all (after settings change).
 */
export interface Controls {
  // Function-typed properties, not methods, so they can be destructured.
  section: (title: string) => HTMLElement;
  select: <T extends string>(parent: HTMLElement, label: string, options: [T, string][], get: () => T, set: (v: T) => void) => void;
  toggle: (parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void) => void;
  /** `[min, max, step]`; `commit` runs when the user lets go of the slider. */
  range: (parent: HTMLElement, label: string, limits: [number, number, number], get: () => number, set: (v: number) => void, commit?: () => void) => void;
  /** Committed on change (blur or Enter), not per keystroke. */
  text: (parent: HTMLElement, label: string, get: () => string, set: (v: string) => void) => void;
  color: (parent: HTMLElement, label: string, get: () => string, set: (v: string) => void) => void;
  buttons: (parent: HTMLElement) => HTMLElement;
  button: (parent: HTMLElement, label: string, onClick: () => void) => void;
  /** Re-read every control's value. */
  sync: () => void;
}

/** Create an element in `parent` with the given properties. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return parent.appendChild(Object.assign(document.createElement(tag), props));
}

export function createControls(root: HTMLElement): Controls {
  const syncers: (() => void)[] = [];
  const sync = () => syncers.forEach((f) => f());

  const row = (parent: HTMLElement, label: string, stack = false): [HTMLLabelElement, HTMLSpanElement] => {
    const r = h("label", parent, { className: stack ? "demo-row demo-row-stack" : "demo-row" });
    return [r, h("span", r, { textContent: label })];
  };

  return {
    section: (title) => {
      const s = h("div", root, { className: "demo-section" });
      h("div", s, { className: "demo-section-title", textContent: title });
      return s;
    },
    select: (parent, label, options, get, set) => {
      const sel = h("select", row(parent, label)[0]);
      for (const [value, text] of options) h("option", sel, { value, textContent: text });
      sel.addEventListener("change", () => set(sel.value as typeof options[number][0]));
      syncers.push(() => (sel.value = get()));
    },
    toggle: (parent, label, get, set) => {
      const cb = h("input", row(parent, label)[0], { type: "checkbox" });
      cb.addEventListener("change", () => set(cb.checked));
      syncers.push(() => (cb.checked = get()));
    },
    range: (parent, label, [min, max, step], get, set, commit) => {
      const [r, lab] = row(parent, label);
      const inp = h("input", r, { type: "range", min: String(min), max: String(max), step: String(step) });
      inp.addEventListener("input", () => {
        set(Number(inp.value));
        sync();
      });
      if (commit) inp.addEventListener("change", commit);
      syncers.push(() => {
        inp.value = String(get());
        lab.textContent = `${label} (${get()})`;
      });
    },
    text: (parent, label, get, set) => {
      const inp = h("input", row(parent, label, true)[0], { type: "text" });
      inp.addEventListener("change", () => set(inp.value));
      syncers.push(() => (inp.value = get()));
    },
    color: (parent, label, get, set) => {
      const inp = h("input", row(parent, label)[0], { type: "color" });
      inp.addEventListener("input", () => set(inp.value));
      syncers.push(() => (inp.value = get()));
    },
    buttons: (parent) => h("div", parent, { className: "demo-buttons" }),
    button: (parent, label, onClick) => {
      h("button", parent, { className: "demo-btn", textContent: label }).addEventListener("click", onClick);
    },
    sync,
  };
}
