// ESLint: Obsidian's official plugin-review rules, plus the architecture's
// layering as import restrictions, so violations show up while you type.
// src/architecture.spec.ts stays the source of truth and fails the build;
// keep the two in step.
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

// --- Layering (mirrors src/architecture.spec.ts) ---------------------------------

/** An import of `layer`, by relative path ("../../infrastructure/dom/x"). */
const layer = (name) => `(^|/)${name}(/|$)`;
const restrict = (regex, message) => ({ regex, message });

const OUTWARD = {
  application: restrict(layer("application"), "Domain code must not depend on the application layer."),
  infrastructure: restrict(layer("infrastructure"), "Only infrastructure and bootstrap may import adapters."),
  bootstrap: restrict(layer("bootstrap"), "Only bootstrap may import the composition root."),
};
const OBSIDIAN = restrict("^obsidian$", "Only infrastructure/obsidian and bootstrap/plugin.ts may import `obsidian`; go through a port.");
const THREE = restrict("^three(/|$)", "Only infrastructure/webgl may import three.js.");
const LIVE_DOMAIN = restrict(
  "/domain/(?!(contracts|model)/anatomy)",
  "Renderers see only the read model (SceneView) and the brain's static anatomy, not live domain state."
);

/** One block per area: a later block's `no-restricted-imports` replaces an earlier one's, so each lists all its rules. */
const imports = (files, patterns) => ({ files, rules: { "no-restricted-imports": ["error", { patterns }] } });

/** DOM globals domain and application code must not touch (as in the architecture spec). */
const DOM_GLOBALS = ["document", "window", "HTMLElement", "HTMLCanvasElement", "Path2D", "CanvasRenderingContext2D", "requestAnimationFrame", "getComputedStyle"].map(
  (name) => ({ name, message: "Domain and application code must not touch the DOM; add a port or do it in infrastructure." })
);

/** The `no-restricted-globals` entries the Obsidian recommended config sets. */
function obsidianRestrictedGlobals() {
  const setting = obsidianmd.configs.recommended.map((c) => c.rules?.["no-restricted-globals"]).findLast(Array.isArray);
  return setting ? setting.slice(1) : [];
}

const layering = [
  imports(["src/domain/**/*.ts"], [OUTWARD.application, OUTWARD.infrastructure, OUTWARD.bootstrap, OBSIDIAN, THREE]),
  imports(["src/application/**/*.ts"], [OUTWARD.infrastructure, OUTWARD.bootstrap, OBSIDIAN, THREE]),
  imports(["src/infrastructure/**/*.ts"], [OUTWARD.bootstrap, OBSIDIAN, THREE]),
  imports(["src/infrastructure/obsidian/**/*.ts"], [OUTWARD.bootstrap, THREE]),
  imports(["src/infrastructure/webgl/**/*.ts"], [OUTWARD.bootstrap, OBSIDIAN, LIVE_DOMAIN]),
  imports(["src/bootstrap/**/*.ts"], [OBSIDIAN, THREE]),
  imports(["src/bootstrap/plugin.ts"], [THREE]),
  {
    files: ["src/domain/**/*.ts", "src/application/**/*.ts"],
    ignores: ["**/*.spec.ts"],
    // Added to the Obsidian config's own restricted globals (a rule set here replaces, not extends, theirs).
    rules: { "no-restricted-globals": ["error", ...obsidianRestrictedGlobals(), ...DOM_GLOBALS] },
  },
];

export default defineConfig([
  globalIgnores(["node_modules", "main.js", "demo/dist", "coverage"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        // Config files and Node scripts sit outside tsconfig.json.
        projectService: { allowDefaultProject: ["*.mjs", "vitest.config.ts", "scripts/*.mjs", "demo/*.mjs"] },
      },
    },
  },
  ...layering,

  // Tests stand in for Obsidian with stubs; the spec files can't use Obsidian's DOM helpers.
  {
    files: ["**/*.spec.ts", "src/test-support/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "obsidianmd/no-tfile-tfolder-cast": "off",
    },
  },

  // Obsidian rules that don't fit this plugin.
  {
    rules: {
      // The declarative settings API needs Obsidian 1.13; minAppVersion is 1.7.2.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },

  // The browser demo and its plain-DOM adapters never run inside Obsidian, so
  // there is no popout window and `document` is the active document. (They still use
  // Obsidian's createEl helpers and window timers; demo/obsidian-dom.ts provides createEl.)
  {
    files: ["demo/**/*.ts", "src/infrastructure/dom/dom-context-menu.ts", "src/infrastructure/dom/dom-ui-host.ts"],
    rules: { "obsidianmd/prefer-active-doc": "off" },
  },

  // Node scripts (build, dev server, vault install): not plugin code.
  {
    files: ["*.mjs", "scripts/**/*.mjs", "demo/**/*.mjs"],
    languageOptions: { globals: globals.node },
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off", // Obsidian's no-console: scripts report to the terminal
      "no-restricted-globals": "off", // `fetch` instead of Obsidian's requestUrl
    },
  },
]);
