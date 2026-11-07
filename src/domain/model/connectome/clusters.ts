import type { Connectome } from "../../contracts/connectome";

/**
 * Neuron indices grouped by cluster (the sub-folder a note lives in, see
 * placeNote). Clusters come from the vault's folders; layout, colours and
 * the legend all build on them.
 */
export function clustersOf(connectome: Connectome): Map<string, number[]> {
  const clusters = new Map<string, number[]>();
  connectome.neurons.forEach((n, i) => {
    let list = clusters.get(n.clusterKey);
    if (!list) clusters.set(n.clusterKey, (list = []));
    list.push(i);
  });
  return clusters;
}
