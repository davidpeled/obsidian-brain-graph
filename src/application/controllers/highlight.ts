import type { Connectome } from "../../domain/contracts/connectome";
import type { Unsubscribe } from "../../domain/contracts/vault";

/**
 * What is highlighted: the hovered neuron (with its neighbours) or the search
 * hits; everything else is dimmed. Hover is tracked by note path so it
 * survives rebuilds, where indices change meaning.
 */
export class Highlight {
  private hovered = -1;
  private hoveredPath: string | null = null;
  private neighbourhood: Set<number> | null = null;
  private term = "";
  private hits: Set<number> | null = null;
  /** Increments whenever `focus()` may have changed (hover or search). Renderers compare it to recolour. */
  version = 0;
  private readonly listeners = new Set<() => void>();

  get hover(): number {
    return this.hovered;
  }

  get matches(): ReadonlySet<number> | null {
    return this.hits;
  }

  /** Highlighted neurons: the hover neighbourhood, else the search hits, else null (nothing dimmed). */
  focus(): Set<number> | null {
    return this.hovered >= 0 ? this.neighbourhood : this.hits;
  }

  onHoverChanged(cb: () => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** `force` re-resolves even if the index is unchanged (after a rebuild, indices mean new neurons). */
  setHover(i: number, connectome: Connectome | null, force = false): void {
    if (i === this.hovered && !force) return;
    const n = i >= 0 ? connectome?.neurons[i] : undefined;
    this.hovered = n ? i : -1;
    this.hoveredPath = n?.path ?? null;
    this.neighbourhood = n ? new Set([i, ...n.neighbors]) : null;
    this.version++;
    this.listeners.forEach((l) => l());
  }

  search(term: string, connectome: Connectome | null): void {
    this.term = term.trim().toLowerCase();
    if (!connectome || !this.term) {
      this.hits = null;
    } else {
      const m = new Set<number>();
      connectome.neurons.forEach((n, i) => n.name.toLowerCase().includes(this.term) && m.add(i));
      this.hits = m;
    }
    this.version++;
  }

  /** After a rebuild: keep hovering the same note if it survived, and re-run the search. */
  rebase(connectome: Connectome, indexOf: (path: string | null) => number): void {
    this.setHover(indexOf(this.hoveredPath), connectome, true);
    this.search(this.term, connectome);
  }

  dispose(): void {
    this.listeners.clear();
  }
}
