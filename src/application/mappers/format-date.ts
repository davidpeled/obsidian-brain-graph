const DATE = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

/** One date format for the whole UI (tooltip and timeline bar). */
export const formatDate = (ms: number): string => DATE.format(ms);
