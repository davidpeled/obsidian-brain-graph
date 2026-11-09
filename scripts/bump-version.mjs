// Chooses the next release version and stamps it into the version files.
//   node scripts/bump-version.mjs [--dir <repo>] <existing tag>...
// - No tags yet: releases the manifest's version as written.
// - The manifest version is newer than every tag (someone bumped minor/major by hand): releases it as written.
// - Otherwise: the highest tag with its patch number + 1.
// Writes manifest.json, package.json, package-lock.json and versions.json, and prints the version.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dirAt = args.indexOf("--dir");
const root = dirAt >= 0 ? path.resolve(args.splice(dirAt, 2)[1]) : path.resolve(import.meta.dirname, "..");
const SEMVER = /^\d+\.\d+\.\d+$/;
const parse = (v) => v.split(".").map(Number);
const compare = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

const file = (name) => path.join(root, name);
const read = (name) => JSON.parse(readFileSync(file(name), "utf8"));
// Keep the files' own formatting: two-space JSON with a trailing newline.
const write = (name, data) => writeFileSync(file(name), `${JSON.stringify(data, null, 2)}\n`);

const manifest = read("manifest.json");
if (!SEMVER.test(manifest.version)) throw new Error(`manifest.json version "${manifest.version}" must be x.y.z`);
const latest = args.filter((t) => SEMVER.test(t)).sort(compare).at(-1);

let version = manifest.version;
if (latest && compare(manifest.version, latest) <= 0) {
  const [major, minor, patch] = parse(latest);
  version = `${major}.${minor}.${patch + 1}`;
}

manifest.version = version;
write("manifest.json", manifest);

const pkg = read("package.json");
pkg.version = version;
write("package.json", pkg);

// Only the root package entries: dependencies can share a version number.
const lock = read("package-lock.json");
lock.version = version;
if (lock.packages?.[""]) lock.packages[""].version = version;
write("package-lock.json", lock);

const versions = read("versions.json");
versions[version] = manifest.minAppVersion;
write("versions.json", versions);

console.log(version);
