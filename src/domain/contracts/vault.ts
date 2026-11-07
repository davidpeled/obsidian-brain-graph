/** A note as the brain sees it: identity and display name, nothing host-specific. */
export interface NoteRef {
  path: string;
  basename: string;
}

/** Immutable picture of the vault at one moment, produced by a VaultRepository. */
export interface VaultSnapshot {
  name: string;
  notes: NoteRef[];
  /** Every folder path, excluding the root (e.g. "1. Projects/Website"). */
  folders: string[];
  /** Resolved links between notes, by path (direction is ignored). */
  links: ReadonlyArray<readonly [from: string, to: string]>;
}

export type Unsubscribe = () => void;
