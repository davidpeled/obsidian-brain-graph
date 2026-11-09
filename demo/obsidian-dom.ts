/**
 * The browser demo's stand-in for Obsidian's DOM helpers (`createEl`, `createDiv`,
 * `createSpan` on elements), so the panel code can use them as it does in Obsidian.
 * Covers only the options this repo passes.
 */
interface DomInfo {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string>;
  title?: string;
}

function createEl<K extends keyof HTMLElementTagNameMap>(this: Node, tag: K, info?: string | DomInfo): HTMLElementTagNameMap[K] {
  const o: DomInfo = typeof info === "string" ? { cls: info } : (info ?? {});
  const el = (this.ownerDocument ?? (this as Document)).createElement(tag);
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
  if (o.text) el.textContent = o.text;
  if (o.title) el.title = o.title;
  for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
  this.appendChild(el);
  return el;
}

Object.defineProperties(Node.prototype, {
  createEl: { value: createEl, configurable: true },
  createDiv: {
    value(this: Node, info?: string | DomInfo) {
      return createEl.call(this, "div", info);
    },
    configurable: true,
  },
  createSpan: {
    value(this: Node, info?: string | DomInfo) {
      return createEl.call(this, "span", info);
    },
    configurable: true,
  },
});
