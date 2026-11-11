import type { Neuron } from "../../domain/contracts/connectome";
import type { Presence } from "../contracts/scene";

/** Playing the whole history takes this long, however long the vault has existed. */
export const TIMELINE_PLAY_SECONDS = 15;
/** A neuron grows in over this share of the history after its note was created. */
const GROW_SHARE = 0.03;
const MIN_GROW_MS = 1000;

export interface TimelineView {
  readonly active: boolean;
  /** Whether the notes carry enough different dates for a history to mean anything. */
  readonly available: boolean;
  readonly playing: boolean;
  /** Where the playhead is, 0..1. */
  readonly progress: number;
  /** Current moment (ms since epoch). */
  readonly time: number;
  readonly first: number;
  readonly last: number;
  /** Notes created so far / in total. */
  readonly shown: number;
  readonly total: number;
}

/**
 * The brain's history: a playhead over the notes' creation times. Neurons
 * appear (and grow in) as the playhead passes the moment their note was
 * created. While inactive every neuron is fully present.
 */
export class Timeline implements Presence {
  active = false;
  playing = false;
  private created: readonly number[] = [];
  /** The same times, ascending, for counting who is born in O(log n). */
  private sorted: Float64Array = new Float64Array(0);
  private first = 0;
  private end = 0;
  private grow = MIN_GROW_MS;
  private time = 0;
  private shown = 0;

  /** Called whenever the brain is rebuilt. Keeps the playhead's place (at the end stays at the end). */
  rebase(neurons: readonly Neuron[]): void {
    const atEnd = this.time >= this.end;
    const progress = this.end > this.first ? (this.time - this.first) / (this.end - this.first) : 1;
    this.created = neurons.map((n) => n.created);
    this.sorted = Float64Array.from(this.created).sort();
    // Notes without a date (0) sort first; the history starts at the first dated note.
    let from = 0;
    while (from < this.sorted.length && this.sorted[from] <= 0) from++;
    const dated = this.sorted.length > from;
    this.first = dated ? this.sorted[from] : 0;
    const last = dated ? this.sorted[this.sorted.length - 1] : 0;
    this.grow = Math.max(MIN_GROW_MS, (last - this.first) * GROW_SHARE);
    this.end = last + this.grow;
    this.time = atEnd ? this.end : this.first + progress * (this.end - this.first);
    this.count();
  }

  get available(): boolean {
    return this.end - this.grow > this.first;
  }

  setActive(on: boolean): void {
    this.active = on;
    this.playing = false;
    this.time = this.end; // opens showing the whole brain; play starts from the beginning
    this.count();
  }

  /** Move the playhead to a fraction of the history (stops playback). */
  seek(progress: number): void {
    this.playing = false;
    this.time = this.first + Math.min(1, Math.max(0, progress)) * (this.end - this.first);
    this.count();
  }

  play(): void {
    if (this.time >= this.end) this.time = this.first;
    this.playing = true;
    this.count();
  }

  pause(): void {
    this.playing = false;
  }

  step(dt: number): void {
    if (!this.active || !this.playing) return;
    this.time += (dt * (this.end - this.first)) / TIMELINE_PLAY_SECONDS;
    if (this.time >= this.end) {
      this.time = this.end;
      this.playing = false;
    }
    this.count();
  }

  presence(i: number): number {
    if (!this.active) return 1;
    return Math.min(1, Math.max(0, (this.time - this.created[i]) / this.grow));
  }

  /** Whether neuron `i` exists yet at the playhead. Always true while inactive. */
  born(i: number): boolean {
    return this.presence(i) > 0;
  }

  get signature(): number {
    return this.active ? this.shown : -1;
  }

  view(): TimelineView {
    return {
      active: this.active,
      available: this.available,
      playing: this.playing,
      progress: this.end > this.first ? (this.time - this.first) / (this.end - this.first) : 1,
      time: this.time,
      first: this.first,
      last: this.end - this.grow,
      shown: this.shown,
      total: this.created.length,
    };
  }

  /** Notes created strictly before the playhead: the first index whose time is >= `time`. */
  private count(): void {
    let lo = 0;
    let hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sorted[mid] < this.time) lo = mid + 1;
      else hi = mid;
    }
    this.shown = lo;
  }
}
