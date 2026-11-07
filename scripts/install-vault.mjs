// Install the plugin into a local Obsidian vault and enable it (development only).
//
//   npm run link:vault -- /path/to/vault    symlink <vault>/.obsidian/plugins/<id> → this repo (relative link)
//   npm run deploy     -- /path/to/vault    copy main.js, manifest.json, styles.css instead
//
// With the link, every `npm run build` / `npm run dev` lands in the vault
// directly; reload the plugin in Obsidian to see it. Never touches notes.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const link = args.includes("--link");
const vault = args.find((a) => !a.startsWith("--")) ?? process.env.VAULT;
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (!vault) fail("Usage: npm run link:vault -- /path/to/vault");
if (!existsSync(vault) || !statSync(vault).isDirectory()) fail(`Not a folder: ${vault}`);
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const files = ["main.js", "manifest.json", "styles.css"];
for (const f of files) if (!existsSync(path.join(root, f))) fail(`Missing ${f}; run "npm run build" first.`);

// The config folder must be a directory. An empty placeholder file is replaced; anything else is left alone.
const config = path.join(vault, ".obsidian");
if (existsSync(config) && !statSync(config).isDirectory()) {
  if (statSync(config).size !== 0) fail(`${config} is a non-empty file, not a folder. Refusing to touch it.`);
  rmSync(config);
  console.log(`Replaced empty file ${config} with a folder.`);
}
const plugins = path.join(config, "plugins");
mkdirSync(plugins, { recursive: true });

const target = path.join(plugins, manifest.id);
const existing = existsSync(target) || (() => {
  try {
    return !!lstatSync(target);
  } catch {
    return false;
  }
})();
if (existing) {
  const st = lstatSync(target);
  if (st.isSymbolicLink()) rmSync(target);
  else if (link) fail(`${target} already exists as a real folder. Remove it first to link instead.`);
}

if (link) {
  const rel = path.relative(plugins, root);
  symlinkSync(rel, target, "dir");
  console.log(`Linked ${target} → ${rel}`);
} else {
  mkdirSync(target, { recursive: true });
  for (const f of files) copyFileSync(path.join(root, f), path.join(target, f));
  console.log(`Copied ${files.join(", ")} into ${target}`);
}

const listFile = path.join(config, "community-plugins.json");
const enabled = existsSync(listFile) ? JSON.parse(readFileSync(listFile, "utf8")) : [];
if (!enabled.includes(manifest.id)) {
  enabled.push(manifest.id);
  writeFileSync(listFile, JSON.stringify(enabled, null, 2) + "\n");
}
console.log(`Enabled plugins: ${enabled.join(", ")}`);
