import "./obsidian-dom"; // before anything that mounts DOM: Obsidian's createEl helpers
import "../styles.css";
import "./demo.css";
import { createBrainContainer } from "../src/bootstrap/container";
import { DEFAULT_SETTINGS, PluginSettings } from "../src/application/contracts/settings";
import { COLOR_PRESETS, CUSTOM_PRESET, ColorKey, presetById } from "../src/application/contracts/color-presets";
import { DomContextMenu } from "../src/infrastructure/dom/dom-context-menu";
import { DomUiHost } from "../src/infrastructure/dom/dom-ui-host";
import { InMemorySettingsRepository } from "../src/infrastructure/in-memory/in-memory-settings.repository";
import { InMemoryVaultRepository } from "../src/infrastructure/in-memory/in-memory-vault.repository";
import { InMemoryWorkspaceGateway } from "../src/infrastructure/in-memory/in-memory-workspace.gateway";
import { createControls, h } from "./controls";
import { VaultKind, makeVault, withNewNote } from "./fake-vault";

// --- Demo state (persisted in the URL hash so reloads keep your setup) ---------

interface DemoState {
  vault: VaultKind;
  size: number;
  seed: number;
  theme: "dark" | "light";
  settings: Partial<PluginSettings>;
}

function loadState(): DemoState {
  const base: DemoState = { vault: "para", size: 1, seed: 42, theme: "dark", settings: {} };
  try {
    return { ...base, ...(JSON.parse(decodeURIComponent(location.hash.slice(1)) || "{}") as Partial<DemoState>) };
  } catch {
    return base;
  }
}
const state = loadState();
const persist = () => history.replaceState(null, "", "#" + encodeURIComponent(JSON.stringify(state)));

// --- Adapters: in-memory twins + plain DOM, wired through the real composition root ---

const vault = new InMemoryVaultRepository(makeVault(state.vault, state.size, state.seed));
const workspace = new InMemoryWorkspaceGateway();
const ui = new DomUiHost();

const container = await createBrainContainer({
  vault,
  workspace,
  menu: new DomContextMenu(),
  ui,
  settingsRepository: new InMemorySettingsRepository({ ...DEFAULT_SETTINGS, ...state.settings }, (s) => {
    state.settings = s;
    persist();
  }),
  refreshDelayMs: 200,
});
const settings = container.settings;

const toast = (msg: string) => {
  const t = document.body.createDiv({ cls: "demo-toast", text: msg });
  window.setTimeout(() => t.classList.add("is-leaving"), 1600);
  window.setTimeout(() => t.remove(), 2000);
};
workspace.onActiveNoteChanged((path) => {
  const last = workspace.opened[workspace.opened.length - 1];
  if (path && last) toast(`${last.mode === "tab" ? "Opened in new tab" : "Opened"}: ${path}`);
});

const stage = document.getElementById("stage") as HTMLElement;
let panel = container.mount(stage);

function applyTheme(): void {
  document.body.classList.toggle("theme-dark", state.theme === "dark");
  document.body.classList.toggle("theme-light", state.theme === "light");
  ui.notifyThemeChanged();
}

function regenerateVault(): void {
  vault.set(makeVault(state.vault, state.size, state.seed));
  persist();
  container.regrowAll();
}

// --- Control panel ------------------------------------------------------------------

const controls = createControls(document.getElementById("panel") as HTMLElement);
const { section, select, toggle, range, text, color, buttons, button } = controls;
settings.onChange(() => controls.sync());

const s = () => settings.get();
const update = (patch: Partial<PluginSettings>) => void settings.update(patch);

const v = section("Fake vault");
select<VaultKind>(
  v,
  "Structure",
  [
    ["para", "PARA (root)"],
    ["para-nested", "PARA (nested, emoji)"],
    ["free", "No PARA"],
  ],
  () => state.vault,
  (x) => {
    state.vault = x;
    regenerateVault();
  }
);
range(v, "Size ×", [0.25, 20, 0.25], () => state.size, (x) => (state.size = x), regenerateVault);
const vaultBtns = buttons(v);
button(vaultBtns, "New random vault", () => {
  state.seed = Math.floor(Math.random() * 1e9);
  regenerateVault();
});
button(vaultBtns, "Add a note", () => {
  const next = withNewNote(vault.snapshot());
  vault.set(next.vault);
  toast(`Created ${next.path}`);
});

const st = section("Plugin settings");
select(
  st,
  "Layout mode",
  [
    ["auto", "Auto-detect PARA"],
    ["para", "Always PARA"],
    ["free", "Whole brain"],
  ],
  () => s().layoutMode,
  (layoutMode) => update({ layoutMode })
);
text(st, "Projects pattern", () => s().projectsFolders, (projectsFolders) => update({ projectsFolders }));
text(st, "Areas pattern", () => s().areasFolders, (areasFolders) => update({ areasFolders }));
text(st, "Resources pattern", () => s().resourcesFolders, (resourcesFolders) => update({ resourcesFolders }));
text(st, "Archive pattern", () => s().archiveFolders, (archiveFolders) => update({ archiveFolders }));
text(st, "Excluded folders", () => s().excludedFolders, (excludedFolders) => update({ excludedFolders }));
toggle(st, "Show orphans", () => s().showOrphans, (showOrphans) => update({ showOrphans }));
toggle(st, "Ambient firing", () => s().ambientFiring, (ambientFiring) => update({ ambientFiring }));
range(st, "Firing rate", [1, 10, 1], () => s().firingRate, (firingRate) => update({ firingRate }));
toggle(st, "Dendrites", () => s().showDendrites, (showDendrites) => update({ showDendrites }));
toggle(st, "Note labels", () => s().showNodeLabels, (showNodeLabels) => update({ showNodeLabels }));
toggle(st, "Lobe labels", () => s().showRegionLabels, (showRegionLabels) => update({ showRegionLabels }));
toggle(st, "Auto-rotate", () => s().autoRotate, (autoRotate) => update({ autoRotate }));

const col = section("Colors");
select(
  col,
  "Scheme",
  [...COLOR_PRESETS.map((p) => [p.id, p.name] as [string, string]), [CUSTOM_PRESET, "Custom"]],
  () => (presetById(s().colorPreset) ? s().colorPreset : CUSTOM_PRESET),
  (id) => {
    const preset = presetById(id);
    update(preset ? { colorPreset: id, ...preset.colors } : { colorPreset: CUSTOM_PRESET });
  }
);
const colorRow = (label: string, key: ColorKey) =>
  color(col, label, () => s()[key], (value) => update({ [key]: value, colorPreset: CUSTOM_PRESET }));
colorRow("Projects", "colorProjects");
colorRow("Areas", "colorAreas");
colorRow("Resources", "colorResources");
colorRow("Archive", "colorArchive");
colorRow("Inbox & other", "colorOther");

const env = section("Environment");
select<"dark" | "light">(
  env,
  "Theme",
  [
    ["dark", "Dark"],
    ["light", "Light"],
  ],
  () => state.theme,
  (x) => {
    state.theme = x;
    persist();
    applyTheme();
  }
);
const envBtns = buttons(env);
button(envBtns, "Remount view", () => {
  panel.dispose();
  panel = container.mount(stage);
});
button(envBtns, "Reset all", () => {
  location.hash = "";
  location.reload();
});

const fps = h("div", document.getElementById("panel") as HTMLElement, { className: "demo-fps" });
let frames = 0;
let last = performance.now();
const countFrames = (t: number) => {
  frames++;
  if (t - last > 1000) {
    fps.textContent = `${Math.round((frames * 1000) / (t - last))} fps · ${vault.snapshot().notes.length} notes`;
    frames = 0;
    last = t;
  }
  window.requestAnimationFrame(countFrames);
};
window.requestAnimationFrame(countFrames);

document.getElementById("collapse")?.addEventListener("click", () => document.body.classList.toggle("panel-hidden"));

controls.sync();
applyTheme();

// Test hook: ?loseContext=<ms>[,<restoreAfterMs>] simulates a lost (and restored) GPU context.
const lose = new URLSearchParams(location.search).get("loseContext");
if (lose) {
  const [at, restoreAfter] = lose.split(",").map(Number);
  window.setTimeout(() => {
    const gl = document.querySelector<HTMLCanvasElement>(".brain-graph-canvas")?.getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_lose_context");
    ext?.loseContext();
    if (ext && restoreAfter) window.setTimeout(() => ext.restoreContext(), restoreAfter);
  }, at);
}

// Live reload from the esbuild dev server (`?nolive` disables it, e.g. for headless screenshots).
if (!new URLSearchParams(location.search).has("nolive")) {
  new EventSource("/esbuild").addEventListener("change", () => location.reload());
}
