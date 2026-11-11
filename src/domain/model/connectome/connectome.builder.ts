import { CEREBRUM_BITS, R_FRONTAL, regionBit } from "../../contracts/anatomy";
import { CATEGORY_LABEL, CATEGORY_REGION, Connectome, Neuron, ParaCategory, Synapse } from "../../contracts/connectome";
import type { StructureSettings } from "../../contracts/settings";
import type { NoteRef, VaultSnapshot } from "../../contracts/vault";
import { hashString, mulberry32 } from "../shared/random";
import { growDendrites } from "./dendrites";
import { ParaLayout, detectPara } from "./para-detector";

function parseExcluded(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

interface Placement {
  category: ParaCategory | null;
  clusterKey: string;
  clusterLabel: string;
}

/**
 * Where a note lives in the brain. In PARA mode the cluster is the first
 * sub-folder of its PARA folder (e.g. "Projects/Website"); otherwise it is
 * the top-level folder.
 */
export function placeNote(path: string, para: ParaLayout | null): Placement {
  const folders = path.split("/").slice(0, -1);
  const top = folders[0];
  if (!para) return { category: null, clusterKey: top ?? "/", clusterLabel: top ?? "Vault root" };
  for (let i = 0; i < folders.length; i++) {
    const p = folders.slice(0, i + 1).join("/");
    const cat = para.folders.get(p);
    if (!cat) continue;
    const sub = i + 1 < folders.length;
    return {
      category: cat,
      clusterKey: `${cat}::${sub ? folders.slice(0, i + 2).join("/") : p}`,
      clusterLabel: sub ? folders[i + 1] : CATEGORY_LABEL[cat],
    };
  }
  return { category: "other", clusterKey: `other::${top ?? "/"}`, clusterLabel: top ?? "Vault root" };
}

function makeNeuron(note: NoteRef, placement: Placement): Neuron {
  const region = placement.category ? CATEGORY_REGION[placement.category] : R_FRONTAL;
  return {
    path: note.path,
    name: note.basename,
    created: note.created ?? 0,
    ...placement,
    region,
    allowed: placement.category ? regionBit(region) : CEREBRUM_BITS,
    r: 3,
    dendrites: growDendrites(hashString(note.path)),
    degree: 0,
    neighbors: [],
    synapses: [],
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    ax: 0,
    ay: 0,
    az: 0,
    fixed: false,
    activation: 0,
  };
}

/** Undirected, de-duplicated, self-loop-free pairs of neuron indices. */
function linkPairs(snapshot: VaultSnapshot, index: Map<string, number>): [number, number][] {
  const pairs: [number, number][] = [];
  const seen = new Set<number>();
  const n = index.size;
  for (const [from, to] of snapshot.links) {
    const a = index.get(from);
    const b = index.get(to);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a < b ? a * n + b : b * n + a;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([a, b]);
  }
  return pairs;
}

/** Build the connectome (neurons + synapses) for a vault under the given settings. */
export function buildConnectome(snapshot: VaultSnapshot, settings: StructureSettings): Connectome {
  const excluded = parseExcluded(settings.excludedFolders);
  const notes = snapshot.notes.filter((f) => !excluded.some((ex) => f.path === ex || f.path.startsWith(ex + "/")));
  const para = detectPara(snapshot.folders, settings);

  let neurons = notes.map((note) => makeNeuron(note, placeNote(note.path, para)));
  let index = new Map(neurons.map((n, i) => [n.path, i] as [string, number]));
  let pairs = linkPairs(snapshot, index);

  if (!settings.showOrphans) {
    const linked = new Set(pairs.flat());
    neurons = neurons.filter((_, i) => linked.has(i));
    index = new Map(neurons.map((n, i) => [n.path, i] as [string, number]));
    pairs = linkPairs(snapshot, index);
  }

  const synapses: Synapse[] = pairs.map(([a, b]) => {
    const rng = mulberry32((a * 73856093) ^ (b * 19349663));
    const cross = neurons[a].category !== null && neurons[a].region !== neurons[b].region;
    return { a, b, cross, curv: (rng() < 0.5 ? -1 : 1) * (cross ? 0.22 : 0.06 + rng() * 0.08) };
  });

  const sized = neurons.map((n) => ({ ...n, neighbors: [] as number[], synapses: [] as number[] }));
  synapses.forEach((s, i) => {
    sized[s.a].neighbors.push(s.b);
    sized[s.b].neighbors.push(s.a);
    sized[s.a].synapses.push(i);
    sized[s.b].synapses.push(i);
  });
  neurons = sized.map((n) => ({ ...n, degree: n.neighbors.length, r: Math.min(16, 3 + Math.sqrt(n.neighbors.length) * 1.6) }));

  const paraFolders: Partial<Record<ParaCategory, string[]>> = {};
  for (const [path, cat] of para?.folders ?? []) (paraFolders[cat] ??= []).push(path.split("/").pop() ?? path);
  for (const names of Object.values(paraFolders)) names?.sort((a, b) => a.localeCompare(b));

  return { neurons, synapses, paraMode: !!para, paraRoot: para?.root ?? null, paraFolders };
}
