import { App, TFile } from "obsidian";
import type { OpenMode, WorkspaceGateway } from "../../domain/interfaces/workspace.gateway";

export class ObsidianWorkspaceGateway implements WorkspaceGateway {
  constructor(private readonly app: App) {}

  activeNotePath(): string | null {
    return this.app.workspace.getActiveFile()?.path ?? null;
  }

  openNote(path: string, mode: OpenMode): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) void this.app.workspace.getLeaf(mode === "tab" ? "tab" : false).openFile(file);
  }

  onActiveNoteChanged(cb: (path: string | null) => void) {
    const ref = this.app.workspace.on("file-open", (file) => cb(file?.path ?? null));
    return () => this.app.workspace.offref(ref);
  }
}
