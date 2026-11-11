import { App, ColorComponent, Plugin, PluginSettingTab, Setting, SettingControl, SettingDefinitionItem, TextComponent, debounce } from "obsidian";
import { COLOR_PRESETS, CUSTOM_PRESET, ColorKey, presetById } from "../../application/contracts/color-presets";
import type { PluginSettings, SettingsService } from "../../application/contracts/settings";
import { DEFAULT_PARA_PATTERNS, LayoutMode } from "../../domain/contracts/settings";
import { checkPattern } from "../../domain/model/connectome/para-detector";

const TYPING_PAUSE_MS = 400;

type FolderKey = "projectsFolders" | "areasFolders" | "resourcesFolders" | "archiveFolders";
type Key = keyof PluginSettings;

/** Free-text settings change structure (rebuild + save): commit once typing pauses, not per keystroke. */
const TYPED_KEYS: readonly Key[] = ["projectsFolders", "areasFolders", "resourcesFolders", "archiveFolders", "excludedFolders"];

/** One row of the tab: a plain control, or a custom row for the few that need more. */
interface Row {
  name: string;
  desc?: string;
  control?: SettingControl<Key>;
  custom?: (setting: Setting) => void;
}

interface Section {
  heading: string;
  rows: Row[];
}

/**
 * The settings tab. The rows are defined once (`sections()`) and shown through
 * Obsidian 1.13's declarative API, which makes them searchable in the settings
 * search. Older Obsidian never calls `getSettingDefinitions()`; it calls
 * `display()`, which draws the same rows imperatively.
 */
export class BrainSettingTab extends PluginSettingTab {
  /** The colour pickers currently on screen, so choosing a scheme can show its colours. */
  private readonly pickers = new Map<ColorKey, ColorComponent>();
  private readonly commits = new Map<Key, (value: unknown) => void>();

  constructor(
    app: App,
    plugin: Plugin,
    private readonly settings: SettingsService
  ) {
    super(app, plugin);
  }

  // --- Storage (read and written through the settings service, not plugin.settings) ----

  getControlValue(key: string): unknown {
    const s = this.settings.get();
    // A colour scheme that no longer exists (or hand-picked colours) shows as "Custom".
    if (key === "colorPreset") return presetById(s.colorPreset) ? s.colorPreset : CUSTOM_PRESET;
    return s[key as Key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const k = key as Key;
    if (TYPED_KEYS.includes(k)) return this.commit(k, value);
    if (k === "colorPreset") {
      const preset = presetById(value as string);
      await this.settings.update(preset ? { colorPreset: preset.id, ...preset.colors } : { colorPreset: CUSTOM_PRESET });
      if (preset) for (const [color, picker] of this.pickers) picker.setValue(preset.colors[color]);
      return;
    }
    if (k.startsWith("color")) {
      await this.settings.update({ [k]: value, colorPreset: CUSTOM_PRESET });
      return;
    }
    await this.settings.update({ [k]: value });
  }

  private commit(key: Key, value: unknown): void {
    let commit = this.commits.get(key);
    if (!commit) {
      commit = debounce((v: unknown) => void this.settings.update({ [key]: v }), TYPING_PAUSE_MS, true);
      this.commits.set(key, commit);
    }
    commit(value);
  }

  // --- The rows ------------------------------------------------------------------------

  private sections(): Section[] {
    const folders: [FolderKey, string, string][] = [
      ["projectsFolders", "Projects pattern", "Mapped to the frontal lobe (planning & goal-directed action)."],
      ["areasFolders", "Areas pattern", "Mapped to the parietal lobe (ongoing integration & responsibility)."],
      ["resourcesFolders", "Resources pattern", "Mapped to the temporal lobe (memory & knowledge)."],
      ["archiveFolders", "Archive pattern", "Mapped to the cerebellum (long-term, automatic storage)."],
    ];
    const colors: [ColorKey, string][] = [
      ["colorProjects", "Projects color"],
      ["colorAreas", "Areas color"],
      ["colorResources", "Resources color"],
      ["colorArchive", "Archive color"],
      ["colorOther", "Inbox & other color"],
    ];
    const presets: Record<string, string> = Object.fromEntries(COLOR_PRESETS.map((p) => [p.id, p.name]));
    presets[CUSTOM_PRESET] = "Custom";

    return [
      {
        heading: "Structure",
        rows: [
          {
            name: "Layout mode",
            desc: "Auto uses PARA lobes when at least two PARA folders are found side by side.",
            control: {
              type: "dropdown",
              key: "layoutMode",
              options: { auto: "Auto-detect PARA", para: "Always PARA lobes", free: "Whole brain (cluster by folder)" } satisfies Record<LayoutMode, string>,
            },
          },
          {
            name: "PARA folder patterns",
            desc:
              "PARA folders are detected with regular expressions, matched case-insensitively against each folder name. " +
              "The defaults accept any numbering, separator or emoji prefix and singular or plural forms, e.g. 01_ProJeCt, 1. Projects, 🚀 projects.",
            custom: () => undefined,
          },
          ...folders.map(([key, name, desc]): Row => ({ name, desc, custom: (setting) => this.patternRow(setting, key, desc) })),
          {
            name: "Everything else",
            desc: "Everything outside PARA (Inbox, root notes, other folders) lives in the occipital lobe — incoming sensory input.",
            custom: () => undefined,
          },
          {
            name: "Excluded folders",
            desc: "Comma-separated folder paths to leave out of the brain.",
            control: { type: "text", key: "excludedFolders", placeholder: "Templates, Attachments" },
          },
          { name: "Show orphan notes", desc: "Include notes that have no links.", control: { type: "toggle", key: "showOrphans" } },
        ],
      },
      {
        heading: "Appearance",
        rows: [
          { name: "Color scheme", desc: "Colors of the PARA lobes, their neurons and labels.", control: { type: "dropdown", key: "colorPreset", options: presets } },
          ...colors.map(([key, name]): Row => ({ name, custom: (setting) => this.colorRow(setting, key) })),
          { name: "Ambient firing", desc: "Neurons spontaneously fire signals along synapses.", control: { type: "toggle", key: "ambientFiring" } },
          {
            name: "Firing rate",
            desc: "How often neurons fire on their own, from 1 to 10.",
            control: { type: "slider", key: "firingRate", min: 1, max: 10, step: 1, displayFormat: (v) => String(v) },
          },
          { name: "Show dendrites", control: { type: "toggle", key: "showDendrites" } },
          { name: "Show note labels when zoomed in", control: { type: "toggle", key: "showNodeLabels" } },
          { name: "Auto-rotate", desc: "Slowly spin the brain while you are not interacting with it.", control: { type: "toggle", key: "autoRotate" } },
          { name: "Show lobe labels", control: { type: "toggle", key: "showRegionLabels" } },
        ],
      },
    ];
  }

  /** A PARA pattern: a text field that flags an invalid regular expression, and a reset button. */
  private patternRow(setting: Setting, key: FolderKey, desc: string): void {
    const describe = (value: string) => {
      const check = checkPattern(value);
      setting.setDesc(check.ok ? desc : `Invalid regular expression (${check.error}); matched as plain text for now.`);
      setting.descEl.toggleClass("mod-warning", !check.ok);
    };
    let text: TextComponent;
    const current = String(this.getControlValue(key));
    describe(current);
    setting
      .addText((t) => {
        text = t;
        t.setValue(current).onChange((v) => {
          describe(v);
          void this.setControlValue(key, v);
        });
      })
      .addExtraButton((b) =>
        b
          .setIcon("rotate-ccw")
          .setTooltip("Reset to default")
          .onClick(async () => {
            const value = DEFAULT_PARA_PATTERNS[key];
            await this.settings.update({ [key]: value });
            text.setValue(value);
            describe(value);
          })
      );
  }

  private colorRow(setting: Setting, key: ColorKey): void {
    setting.addColorPicker((p) => {
      this.pickers.set(key, p);
      p.setValue(String(this.getControlValue(key))).onChange((v) => void this.setControlValue(key, v));
    });
  }

  // --- Declarative (Obsidian 1.13+) ------------------------------------------------------

  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.sections().map((section) => ({
      type: "group",
      heading: section.heading,
      items: section.rows.map((row) =>
        row.control
          ? { name: row.name, desc: row.desc, control: row.control }
          : { name: row.name, desc: row.desc, render: (setting: Setting) => row.custom?.(setting) }
      ),
    }));
  }

  // --- Fallback for Obsidian before 1.13 ------------------------------------------------------

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.pickers.clear();
    for (const section of this.sections()) {
      new Setting(containerEl).setName(section.heading).setHeading();
      for (const row of section.rows) {
        const setting = new Setting(containerEl).setName(row.name);
        if (row.desc) setting.setDesc(row.desc);
        if (row.custom) row.custom(setting);
        else if (row.control) this.legacyControl(setting, row);
      }
    }
  }

  private legacyControl(setting: Setting, row: Row): void {
    const c = row.control;
    if (!c) return;
    const value = this.getControlValue(c.key);
    const set = (v: unknown) => void this.setControlValue(c.key, v);
    switch (c.type) {
      case "toggle":
        setting.addToggle((t) => t.setValue(value as boolean).onChange(set));
        break;
      case "dropdown":
        setting.addDropdown((d) => d.addOptions(c.options).setValue(value as string).onChange(set));
        break;
      case "text":
        setting.addText((t) => t.setPlaceholder(c.placeholder ?? "").setValue(value as string).onChange(set));
        break;
      case "color":
        setting.addColorPicker((p) => p.setValue(value as string).onChange(set));
        break;
      case "slider": {
        // The value goes in the description: the old tooltip (`setDynamicTooltip`) is deprecated.
        const withValue = (v: number) => `${row.desc ?? ""} (now ${c.displayFormat?.(v) ?? v}).`.trim();
        setting.setDesc(withValue(value as number));
        setting.addSlider((s) =>
          s
            .setLimits(c.min, c.max, c.step)
            .setValue(value as number)
            .onChange((v) => {
              setting.setDesc(withValue(v));
              set(v);
            })
        );
        break;
      }
    }
  }
}
