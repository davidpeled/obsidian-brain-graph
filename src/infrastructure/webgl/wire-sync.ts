export interface WireWrite {
  positions: boolean;
  colors: boolean;
}

/**
 * Tracks what a set of GPU line buffers must rewrite. Changes are remembered
 * while the wires are hidden and flushed the next time they are shown, so a
 * hidden layer can never come back stale.
 */
export class WireSync {
  private positionsStale = true;
  private colorsStale = true;

  /** Record what changed in the scene this frame. */
  mark(moved: boolean, recolor: boolean): void {
    if (moved) this.positionsStale = true;
    if (recolor) this.colorsStale = true;
  }

  /** Everything is stale (new graph, new buffers). */
  reset(): void {
    this.positionsStale = true;
    this.colorsStale = true;
  }

  /** What to write now, or null. Clears what it returns; nothing is taken while hidden. */
  take(visible: boolean): WireWrite | null {
    if (!visible || (!this.positionsStale && !this.colorsStale)) return null;
    const write = { positions: this.positionsStale, colors: this.colorsStale };
    this.positionsStale = false;
    this.colorsStale = false;
    return write;
  }
}

export interface WireWrites {
  synapses: WireWrite | null;
  dendrites: WireWrite | null;
}

/**
 * The renderer's dirty tracking for both wire layers: turns the scene's
 * layout and focus versions into what each layer must rewrite this frame.
 * Synapses are always shown; dendrites only when the setting is on.
 */
export class WireTracker {
  private readonly synapses = new WireSync();
  private readonly dendrites = new WireSync();
  private layoutVersion = -1;
  private focusVersion = -1;

  /** New graph or new GPU buffers: everything must be rewritten. */
  reset(): void {
    this.synapses.reset();
    this.dendrites.reset();
  }

  frame(layoutVersion: number, focusVersion: number, showDendrites: boolean): WireWrites {
    const moved = layoutVersion !== this.layoutVersion;
    const recolor = focusVersion !== this.focusVersion;
    this.layoutVersion = layoutVersion;
    this.focusVersion = focusVersion;
    this.synapses.mark(moved, recolor);
    this.dendrites.mark(moved, recolor);
    return { synapses: this.synapses.take(true), dendrites: this.dendrites.take(showDendrites) };
  }
}
