import { expect, it } from "vitest";
import { referenceMs } from "../../test-support/cpu-reference";

/**
 * Startup budget: building the brain's shape (brainField) and its shell mesh
 * (brainSurface) runs on the main thread when a view first opens.
 *
 * Measured in units of a fixed reference workload, so the budget holds on fast
 * laptops and slow CI runners alike. On 2026-11-07 it cost about 5 units
 * (~210 ms on an M-series Mac); before the section 2 fixes it was about 15.
 * The budget allows twice today's cost.
 */
const BUDGET_UNITS = 10;

it("builds the brain shape and shell within the startup budget", async () => {
  const before = referenceMs();
  // Import here so the module-level caches are cold (each spec file gets fresh modules).
  const { brainField } = await import("../../domain/model/anatomy/brain-volume");
  const { brainSurface } = await import("./brain-mesh");
  const t = performance.now();
  brainField();
  brainSurface();
  const work = performance.now() - t;
  const unit = Math.min(before, referenceMs());
  const units = work / unit;
  expect(units, `startup took ${work.toFixed(0)} ms = ${units.toFixed(1)} units of ${unit.toFixed(0)} ms (budget ${BUDGET_UNITS})`).toBeLessThan(BUDGET_UNITS);
}, 30_000);
