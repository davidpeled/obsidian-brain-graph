import { REGION_LABELS } from "../../domain/contracts/anatomy";
import { formatDate } from "./format-date";
import { CATEGORY_LABEL, Connectome, Neuron } from "../../domain/contracts/connectome";

export interface TooltipView {
  title: string;
  lines: string[];
}

export interface StatsView {
  summary: string;
  mode: string;
}

export function toTooltip(n: Neuron): TooltipView {
  const where = n.category ? `${CATEGORY_LABEL[n.category]} › ${n.clusterLabel}` : n.clusterLabel;
  const synapses = `${n.degree} synapse${n.degree === 1 ? "" : "s"}`;
  const lines = [where, n.category ? `${synapses} · ${REGION_LABELS[n.region]}` : synapses];
  if (n.created > 0) lines.push(`Created ${formatDate(n.created)}`);
  return { title: n.name, lines };
}

export function toStats(c: Connectome): StatsView {
  const root = c.paraRoot && c.paraRoot !== "/" ? ` (${c.paraRoot})` : "";
  return {
    summary: `${c.neurons.length} neurons · ${c.synapses.length} synapses`,
    mode: c.paraMode ? `PARA cortex${root}` : "No PARA detected — clustered by folder",
  };
}
