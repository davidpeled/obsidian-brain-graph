import type { Connectome } from "../../contracts/connectome";
import type { BrainFiring, FiringConditions, Pulse } from "../../contracts/dynamics";
import { RandomSource, shuffle } from "../shared/random";

export const MAX_PULSES = 700;
const PULSE_SPEED = 150;
const FAN_OUT = 16;
const PROPAGATE_TO = 4;
const PROPAGATE_P = 0.7;
const ACTIVATION_DECAY = 2.4;

/**
 * Signals travelling along synapses. Firing a neuron activates it and emits
 * pulses on (up to FAN_OUT of) its synapses; a pulse arriving with depth > 0
 * may propagate onward, so firings cascade through the network.
 */
export class ActionPotentials implements BrainFiring {
  pulses: Pulse[] = [];
  private ambientAcc = 0;

  constructor(
    private readonly connectome: Connectome,
    private readonly rng: RandomSource
  ) {}

  private emit(synapse: number, from: number, depth: number, strong: boolean): void {
    if (this.pulses.length >= MAX_PULSES) return;
    const s = this.connectome.synapses[synapse];
    this.pulses.push({
      synapse,
      t: 0,
      forward: s.a === from,
      depth,
      speed: (0.75 + this.rng() * 0.6) * (strong ? 1.5 : 1),
      strong,
      source: from,
    });
  }

  /**
   * Continue from a previous brain after a rebuild: neurons keep their
   * activation and in-flight pulses keep travelling, matched by note path.
   * Pulses on links that no longer exist are dropped.
   */
  inherit(previous: ActionPotentials): void {
    const prev = previous.connectome;
    const cur = this.connectome;
    const index = new Map(cur.neurons.map((n, i) => [n.path, i]));
    const pair = (a: string, b: string) => (a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`);
    const synapseOf = new Map(cur.synapses.map((s, i) => [pair(cur.neurons[s.a].path, cur.neurons[s.b].path), i]));

    for (const n of prev.neurons) {
      const i = index.get(n.path);
      if (i !== undefined) cur.neurons[i].activation = n.activation;
    }
    for (const p of previous.pulses) {
      const old = prev.synapses[p.synapse];
      const a = prev.neurons[old.a].path;
      const b = prev.neurons[old.b].path;
      const synapse = synapseOf.get(pair(a, b));
      const source = index.get(prev.neurons[p.source].path);
      if (synapse === undefined || source === undefined || this.pulses.length >= MAX_PULSES) continue;
      const target = p.forward ? b : a;
      this.pulses.push({ ...p, synapse, source, forward: cur.neurons[cur.synapses[synapse].b].path === target });
    }
    this.ambientAcc = previous.ambientAcc;
  }

  fire(neuron: number, depth: number, strong = true): void {
    const n = this.connectome.neurons[neuron];
    if (!n) return;
    n.activation = 1;
    const out = n.synapses.length > FAN_OUT ? shuffle(n.synapses.slice(), this.rng).slice(0, FAN_OUT) : n.synapses;
    for (const s of out) this.emit(s, neuron, depth, strong);
  }

  /** Fire a random (preferably connected) neuron with a deep cascade. */
  fireRandom(eligible: (neuron: number) => boolean = () => true): void {
    const neurons = this.connectome.neurons;
    const all = neurons.map((_, i) => i).filter(eligible);
    if (!all.length) return;
    const linked = all.filter((i) => neurons[i].degree);
    const pool = linked.length ? linked : all;
    this.fire(pool[Math.floor(this.rng() * pool.length)], 4, true);
  }

  step(dt: number, cond: FiringConditions): void {
    const { neurons, synapses } = this.connectome;

    if (cond.ambient && synapses.length) {
      this.ambientAcc += dt * cond.rate * (0.3 + Math.sqrt(synapses.length) / 14);
      while (this.ambientAcc >= 1) {
        this.ambientAcc -= 1;
        const s = Math.floor(this.rng() * synapses.length);
        this.emit(s, this.rng() < 0.5 ? synapses[s].a : synapses[s].b, this.rng() < 0.08 ? 2 : 0, false);
      }
    }

    // Survivors and newly propagated pulses both land in the fresh array.
    const current = this.pulses;
    this.pulses = [];
    for (const p of current) {
      const s = synapses[p.synapse];
      const A = neurons[s.a];
      const B = neurons[s.b];
      const len = Math.max(8, Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z));
      p.t += (PULSE_SPEED * cond.speedScale * p.speed * dt) / len;
      if (p.t < 1) {
        this.pulses.push(p);
        continue;
      }
      const target = p.forward ? s.b : s.a;
      const tn = neurons[target];
      tn.activation = Math.max(tn.activation, p.strong ? 1 : 0.55);
      if (p.depth > 0) {
        const outs = shuffle(
          tn.synapses.filter((x) => x !== p.synapse),
          this.rng
        );
        for (const o of outs.slice(0, PROPAGATE_TO)) if (this.rng() < PROPAGATE_P) this.emit(o, target, p.depth - 1, p.strong);
      }
    }

    const decay = Math.exp(-dt * ACTIVATION_DECAY);
    for (const n of neurons) if (n.activation > 0.001) n.activation *= decay;
  }
}
