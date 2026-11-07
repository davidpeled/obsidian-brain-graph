import { App, Plugin, PluginSettingTab, Setting, debounce } from "obsidian";
import { COLOR_PRESETS, CUSTOM_PRESET, ColorKey, presetById } from "../../application/contracts/color-presets";
import type { PluginSettings, SettingsService } from "../../application/contracts/settings";
import { DEFAULT_PARA_PATTERNS, LayoutMode } from "../../domain/contracts/settings";
import { checkPattern } from "../../domain/model/connectome/para-detector";

const TYPING_PAUSE_MS = 400;

type FolderKey = "projectsFolders" | "areasFolders" | "resourcesFolders" | "archiveFolders";

export class BrainSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly settings: SettingsService
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.settings.get();
    const set = <K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) => void this.settings.update({ [key]: value });
    // Text fields change structure (rebuild + save): commit once typing pauses, not per keystroke.
    const typed = <K extends keyof PluginSettings>(key: K) =>
      debounce((value: PluginSettings[K]) => set(key, value), TYPING_PAUSE_MS, true);

    new Setting(containerEl).setName("Structure").setHeading();

    new Setting(containerEl)
      .setName("Layout mode")
      .setDesc("Auto uses PARA lobes when at least two PARA folders are found side by side.")
      .addDropdown((d) =>
        d
          .addOption("auto", "Auto-detect PARA")
          .addOption("para", "Always PARA lobes")
          .addOption("free", "Whole brain (cluster by folder)")
          .setValue(s.layoutMode)
          .onChange((v) => set("layoutMode", v as LayoutMode))
      );

    const folders: [FolderKey, string, string][] = [
      ["projectsFolders", "Projects pattern", "Mapped to the frontal lobe (planning & goal-directed action)."],
      ["areasFolders", "Areas pattern", "Mapped to the parietal lobe (ongoing integration & responsibility)."],
      ["resourcesFolders", "Resources pattern", "Mapped to the temporal lobe (memory & knowledge)."],
      ["archiveFolders", "Archive pattern", "Mapped to the cerebellum (long-term, automatic storage)."],
    ];
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "PARA folders are detected with regular expressions, matched case-insensitively against each folder name. " +
        "The defaults accept any numbering, separator or emoji prefix and singular or plural forms, e.g. 01_ProJeCt, 1. Projects, 🚀 projects.",
    });
    for (const [key, name, desc] of folders) {
      const commit = typed(key);
      const setting = new Setting(containerEl).setName(name);
      const describe = (value: string) => {
        const check = checkPattern(value);
        setting.setDesc(check.ok ? desc : `Invalid regular expression (${check.error}); matched as plain text for now.`);
        setting.descEl.toggleClass("mod-warning", !check.ok);
      };
      describe(s[key]);
      setting
        .addText((t) =>
          t.setValue(s[key]).onChange((v) => {
            describe(v);
            commit(v);
          })
        )
        .addExtraButton((b) =>
          b
            .setIcon("rotate-ccw")
            .setTooltip("Reset to default")
            .onClick(async () => {
              await this.settings.update({ [key]: DEFAULT_PARA_PATTERNS[key] });
              this.display();
            })
        );
    }
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Everything outside PARA (Inbox, root notes, other folders) lives in the occipital lobe — incoming sensory input.",
    });

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Comma-separated folder paths to leave out of the brain.")
      .addText((t) =>
        t
          .setPlaceholder("Templates, Attachments")
          .setValue(s.excludedFolders)
          .onChange(typed("excludedFolders"))
      );

    new Setting(containerEl)
      .setName("Show orphan notes")
      .setDesc("Include notes that have no links.")
      .addToggle((t) => t.setValue(s.showOrphans).onChange((v) => set("showOrphans", v)));

    new Setting(containerEl).setName("Appearance").setHeading();

    new Setting(containerEl)
      .setName("Color scheme")
      .setDesc("Colors of the PARA lobes, their neurons and labels.")
      .addDropdown((d) => {
        for (const p of COLOR_PRESETS) d.addOption(p.id, p.name);
        d.addOption(CUSTOM_PRESET, "Custom");
        d.setValue(presetById(s.colorPreset) ? s.colorPreset : CUSTOM_PRESET).onChange(async (id) => {
          const preset = presetById(id);
          await this.settings.update(preset ? { colorPreset: id, ...preset.colors } : { colorPreset: CUSTOM_PRESET });
          this.display();
        });
      });

    const colors: [ColorKey, string][] = [
      ["colorProjects", "Projects color"],
      ["colorAreas", "Areas color"],
      ["colorResources", "Resources color"],
      ["colorArchive", "Archive color"],
      ["colorOther", "Inbox & other color"],
    ];
    for (const [key, name] of colors) {
      new Setting(containerEl)
        .setName(name)
        .setClass("brain-graph-color-setting")
        .addColorPicker((c) => c.setValue(s[key]).onChange((v) => void this.settings.update({ [key]: v, colorPreset: CUSTOM_PRESET })));
    }

    new Setting(containerEl)
      .setName("Ambient firing")
      .setDesc("Neurons spontaneously fire signals along synapses.")
      .addToggle((t) => t.setValue(s.ambientFiring).onChange((v) => set("ambientFiring", v)));

    // The value is shown in the description: recent Obsidian shows it next to the slider
    // anyway, and the old tooltip (`setDynamicTooltip`) is deprecated.
    const rateDesc = (v: number) => `How often neurons fire on their own, from 1 to 10 (now ${v}).`;
    const rate = new Setting(containerEl).setName("Firing rate").setDesc(rateDesc(s.firingRate));
    rate.addSlider((sl) =>
      sl
        .setLimits(1, 10, 1)
        .setValue(s.firingRate)
        .onChange((v) => {
          rate.setDesc(rateDesc(v));
          set("firingRate", v);
        })
    );

    new Setting(containerEl)
      .setName("Show dendrites")
      .addToggle((t) => t.setValue(s.showDendrites).onChange((v) => set("showDendrites", v)));

    new Setting(containerEl)
      .setName("Show note labels when zoomed in")
      .addToggle((t) => t.setValue(s.showNodeLabels).onChange((v) => set("showNodeLabels", v)));

    new Setting(containerEl)
      .setName("Auto-rotate")
      .setDesc("Slowly spin the brain while you are not interacting with it.")
      .addToggle((t) => t.setValue(s.autoRotate).onChange((v) => set("autoRotate", v)));

    new Setting(containerEl)
      .setName("Show lobe labels")
      .addToggle((t) => t.setValue(s.showRegionLabels).onChange((v) => set("showRegionLabels", v)));
  }
}
