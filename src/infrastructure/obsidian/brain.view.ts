import { ItemView, WorkspaceLeaf } from "obsidian";
import type { MountedPanel } from "../dom/brain-panel";

export const VIEW_TYPE_BRAIN = "para-brain-view";

/** Thin Obsidian shell: hosts the DOM panel built by the composition root. */
export class BrainView extends ItemView {
  navigation = false;
  private panel: MountedPanel | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly mount: (host: HTMLElement) => MountedPanel
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_BRAIN;
  }

  getDisplayText(): string {
    return "PARA Brain";
  }

  getIcon(): string {
    return "brain";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("brain-graph-root");
    this.panel = this.mount(this.contentEl);
  }

  async onClose(): Promise<void> {
    this.panel?.dispose();
    this.panel = null;
  }
}
