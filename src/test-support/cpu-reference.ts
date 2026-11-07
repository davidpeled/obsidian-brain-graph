/**
 * A fixed CPU workload (typed-array arithmetic, like the startup geometry work),
 * timed to express performance budgets in machine-independent units.
 * Returns the median of `runs` timings, in ms.
 */
export function referenceMs(runs = 5): number {
  const n = 1 << 20;
  const a = new Float32Array(n);
  const times: number[] = [];
  let sink = 0;
  for (let r = 0; r < runs; r++) {
    const t = performance.now();
    for (let pass = 0; pass < 40; pass++) {
      for (let i = 0; i < n; i++) a[i] = Math.sqrt(a[i] * 0.5 + i * 0.25 + pass) * 0.999;
      sink += a[(pass * 7919) % n];
    }
    times.push(performance.now() - t);
  }
  if (Number.isNaN(sink)) throw new Error("unreachable");
  return times.sort((x, y) => x - y)[Math.floor(runs / 2)];
}
