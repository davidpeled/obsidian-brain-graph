/**
 * Runs `fn` once after `ms` milliseconds and returns a function that cancels it.
 * A port, so the application layer needs no timer globals: the host passes timers
 * from the window that shows the view (an Obsidian popout has its own), and tests
 * pass fake ones.
 */
export type Schedule = (fn: () => void, ms: number) => () => void;
