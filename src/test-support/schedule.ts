import type { Schedule } from "../application/contracts/schedule";

/** Real timers, resolved on each call so `vi.useFakeTimers()` takes effect. */
export const realSchedule: Schedule = (fn, ms) => {
  const handle = globalThis.setTimeout(fn, ms);
  return () => globalThis.clearTimeout(handle);
};
