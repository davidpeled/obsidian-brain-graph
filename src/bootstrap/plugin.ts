import { Plugin } from "obsidian";
import { BrainView, VIEW_TYPE_BRAIN } from "../infrastructure/obsidian/brain.view";
import { ObsidianContextMenu } from "../infrastructure/obsidian/obsidian-context-menu";
import { ObsidianSettingsRepository } from "../infrastructure/obsidian/obsidian-settings.repository";
import { ObsidianUiHost } from "../infrastructure/obsidian/obsidian-ui-host";
import { ObsidianVaultRepository } from "../infrastructure/obsidian/obsidian-vault.repository";
import { ObsidianWorkspaceGateway } from "../infrastructure/obsidian/obsidian-workspace.gateway";
import { BrainSettingTab } from "../infrastructure/obsidian/settings.tab";
import { BrainContainer, createBrainContainer } from "./container";

/** Obsidian entry point: binds the Obsidian adapters and registers the UI. */
export default class BrainGraphPlugin extends Plugin {
  private container: BrainContainer | null = null;

  async onload(): Promise<void> {
    const container = await createBrainContainer({
      vault: new ObsidianVaultRepository(this.app),
      workspace: new ObsidianWorkspaceGateway(this.app),
      menu: new ObsidianContextMenu(),
      settingsRepository: new ObsidianSettingsRepository(this),
      ui: new ObsidianUiHost(this.app),
    });
    this.container = container;

    this.registerView(VIEW_TYPE_BRAIN, (leaf) => new BrainView(leaf, (host) => container.mount(host)));
    this.addRibbonIcon("brain", "Open brain graph", () => void this.activateView());
    this.addCommand({ id: "open-brain-graph", name: "Open view", callback: () => void this.activateView() });
    this.addCommand({ id: "regrow-brain-graph", name: "Regrow brain layout", callback: () => container.regrowAll() });
    this.addSettingTab(new BrainSettingTab(this.app, this, container.settings));
  }

  onunload(): void {
    this.container?.dispose();
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_BRAIN)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_BRAIN, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
