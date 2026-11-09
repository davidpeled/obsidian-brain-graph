import { BrainController } from "../application/controllers/brain.controller";
import { createBrainGraphService } from "../application/services/brain-graph.service";
import { createSettingsService } from "../application/services/settings.service";
import type { Schedule } from "../application/contracts/schedule";
import type { SettingsService } from "../application/contracts/settings";
import type { ContextMenuGateway } from "../domain/interfaces/context-menu.gateway";
import type { SettingsRepository } from "../domain/interfaces/settings.repository";
import type { VaultRepository } from "../domain/interfaces/vault.repository";
import type { WorkspaceGateway } from "../domain/interfaces/workspace.gateway";
import { RandomSource } from "../domain/model/shared/random";
import { MountedPanel, mountBrainPanel } from "../infrastructure/dom/brain-panel";
import type { UiHost } from "../infrastructure/dom/ui-host";

/** Everything host-specific. Obsidian and the browser demo each provide one set. */
export interface BrainAdapters {
  vault: VaultRepository;
  workspace: WorkspaceGateway;
  menu: ContextMenuGateway;
  settingsRepository: SettingsRepository;
  ui: UiHost;
  random?: RandomSource;
  /** Debounce for vault change bursts (default 1500 ms). */
  refreshDelayMs?: number;
  /** Timers for debouncing (default: the panel's own window, so popouts work). */
  schedule?: Schedule;
}

export interface BrainContainer {
  settings: SettingsService;
  /** Mount a brain panel into `host`. Each panel grows its own brain. */
  mount(host: HTMLElement): MountedPanel;
  regrowAll(): void;
  dispose(): void;
}

/** Timers from the window that shows `host` (the main window or an Obsidian popout). */
const windowSchedule =
  (host: HTMLElement): Schedule =>
  (fn, ms) => {
    const win = host.ownerDocument.defaultView ?? window;
    const handle = win.setTimeout(fn, ms);
    return () => win.clearTimeout(handle);
  };

/** Composition root shared by the Obsidian plugin and the browser demo. */
export async function createBrainContainer(adapters: BrainAdapters): Promise<BrainContainer> {
  const settings = await createSettingsService(adapters.settingsRepository);
  const random = adapters.random ?? Math.random;
  const panels = new Set<MountedPanel>();

  const mount = (host: HTMLElement): MountedPanel => {
    const graph = createBrainGraphService({
      vault: adapters.vault,
      settings,
      random,
      refreshDelayMs: adapters.refreshDelayMs ?? 1500,
      schedule: adapters.schedule ?? windowSchedule(host),
    });
    const controller = new BrainController({ graph, settings, workspace: adapters.workspace, menu: adapters.menu });
    const panel = mountBrainPanel(host, controller, settings, adapters.ui);
    const tracked: MountedPanel = {
      controller,
      dispose() {
        panels.delete(tracked);
        panel.dispose();
      },
    };
    panels.add(tracked);
    return tracked;
  };

  return {
    settings,
    mount,
    regrowAll: () => panels.forEach((p) => p.controller.regrow()),
    dispose: () => [...panels].forEach((p) => p.dispose()),
  };
}
