import type { OpenMode, WorkspaceGateway } from "../../domain/interfaces/workspace.gateway";

export class InMemoryWorkspaceGateway implements WorkspaceGateway {
  /** Every openNote call, in order. */
  readonly opened: { path: string; mode: OpenMode }[] = [];
  private listeners = new Set<(path: string | null) => void>();

  constructor(private active: string | null = null) {}

  activeNotePath(): string | null {
    return this.active;
  }

  openNote(path: string, mode: OpenMode): void {
    this.opened.push({ path, mode });
    this.active = path;
    this.listeners.forEach((l) => l(path));
  }

  onActiveNoteChanged(cb: (path: string | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
