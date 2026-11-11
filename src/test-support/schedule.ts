import type { Schedule } from "../application/contracts/schedule";

/** Real timers, resolved on each call so `vi.useFakeTimers()` takes effect. */
export const realSchedule: Schedule = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
};
