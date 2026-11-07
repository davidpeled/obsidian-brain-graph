import { REGION_LABELS } from "../../domain/contracts/anatomy";
import { CATEGORY_LABEL, CATEGORY_REGION, Connectome, ParaCategory } from "../../domain/contracts/connectome";
import { clustersOf } from "../../domain/model/connectome/clusters";
import { CLUSTER_COLORS, OTHER_COLOR, Palette, RGB } from "./palette.mapper";

export type LegendTarget = { kind: "region"; region: number } | { kind: "cluster"; key: string } | { kind: "all" };

export interface LegendItem {
  color: RGB;
  title: string;
  subtitle: string;
  count: number;
  target: LegendTarget;
}

const PARA_ORDER: ParaCategory[] = ["projects", "areas", "resources", "archive", "other"];

export function toLegend(connectome: Connectome, palette: Palette): LegendItem[] {
  const { neurons } = connectome;
  if (connectome.paraMode) {
    return PARA_ORDER.map((cat) => {
      const region = CATEGORY_REGION[cat];
      return {
        color: palette.colors[region],
        title: CATEGORY_LABEL[cat],
        subtitle: REGION_LABELS[region],
        count: neurons.filter((n) => n.category === cat).length,
        target: { kind: "region", region },
      };
    });
  }
  const clusters = [...clustersOf(connectome).entries()].sort((a, b) => b[1].length - a[1].length);
  const items: LegendItem[] = clusters.slice(0, CLUSTER_COLORS.length).map(([key, idx]) => ({
    color: palette.colors[palette.colorOf[idx[0]]],
    title: neurons[idx[0]].clusterLabel,
    subtitle: "",
    count: idx.length,
    target: { kind: "cluster", key },
  }));
  if (clusters.length > CLUSTER_COLORS.length) {
    const rest = clusters.slice(CLUSTER_COLORS.length);
    items.push({
      color: OTHER_COLOR,
      title: `${rest.length} more folders`,
      subtitle: "",
      count: rest.reduce((sum, [, idx]) => sum + idx.length, 0),
      target: { kind: "all" },
    });
  }
  return items;
}
