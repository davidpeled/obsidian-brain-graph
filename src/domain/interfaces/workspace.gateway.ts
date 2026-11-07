import type { Unsubscribe } from "../contracts/vault";

export type OpenMode = "current" | "tab";

/** Outbound port: the editor around the brain (which note is open, opening notes). */
export interface WorkspaceGateway {
  activeNotePath(): string | null;
  openNote(path: string, mode: OpenMode): void;
  onActiveNoteChanged(cb: (path: string | null) => void): Unsubscribe;
}
