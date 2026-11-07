import { describe, expect, it } from "vitest";
import { DEFAULT_PARA_PATTERNS, migrateStructure } from "../../contracts/settings";
import { structure } from "../../../test-support/fixtures";
import { categoryPatterns, checkPattern, compilePattern, detectPara, matchCategory } from "./para-detector";

describe("default PARA patterns", () => {
  const patterns = categoryPatterns(structure());

  it.each([
    ["01_ProJeCt", "projects"],
    ["01_PROJECTS", "projects"],
    ["1. Projects", "projects"],
    ["1 - projects", "projects"],
    ["🚀 Projects", "projects"],
    ["Project", "projects"],
    ["_projects_2024", "projects"],
    ["02-AREAS", "areas"],
    ["2. Areas of Responsibility", "areas"],
    ["area", "areas"],
    ["03.ReSoUrCe", "resources"],
    ["📚 Resources", "resources"],
    ["04_Archive", "archive"],
    ["🗄 ARCHIVES", "archive"],
    ["99 Archived", "archive"],
  ])("%s -> %s", (name, cat) => expect(matchCategory(name, patterns)).toBe(cat));

  it.each(["Projectile", "Areal", "Resourceful", "Archivist", "My Projects", "Inbox", "Daily", ""])("%s -> none", (name) =>
    expect(matchCategory(name, patterns)).toBeNull()
  );
});

describe("custom patterns", () => {
  it("accepts user regexes, case-insensitive and Unicode-aware", () => {
    const p = categoryPatterns(structure({ projectsFolders: "^(proyectos|projets)$", areasFolders: String.raw`^\p{L}*áreas` }));
    expect(matchCategory("PROYECTOS", p)).toBe("projects");
    expect(matchCategory("Projets", p)).toBe("projects");
    expect(matchCategory("Áreas", p)).toBe("areas");
  });

  it("treats an invalid regex as literal text instead of failing", () => {
    expect(checkPattern("projects(")).toMatchObject({ ok: false });
    expect(compilePattern("projects(")!.test("My PROJECTS( folder")).toBe(true);
  });

  it("matches nothing for an empty pattern", () => {
    expect(compilePattern("  ")).toBeNull();
    expect(matchCategory("Archive", categoryPatterns(structure({ archiveFolders: "" })))).toBeNull();
  });
});

describe("migrateStructure", () => {
  it("upgrades the old plain-name defaults to regex patterns and keeps custom values", () => {
    const stored: Record<string, unknown> = { projectsFolders: "projects", areasFolders: "Areas, Area", resourcesFolders: "^res$" };
    const m = migrateStructure(stored);
    expect(m.projectsFolders).toBe(DEFAULT_PARA_PATTERNS.projectsFolders);
    expect(m.areasFolders).toBe(DEFAULT_PARA_PATTERNS.areasFolders);
    expect(m.resourcesFolders).toBe("^res$");
    expect(m.archiveFolders).toBeUndefined();
  });
});

describe("detectPara", () => {
  it("finds PARA in the vault root regardless of numbering and casing", () => {
    const para = detectPara(["01_ProJeCt", "02_aReAs", "03_RESOURCES", "04_archive", "Inbox"], structure());
    expect(para?.root).toBe("/");
    expect([...para!.folders.values()]).toEqual(["projects", "areas", "resources", "archive"]);
  });

  it("finds nested PARA with emoji and plural names", () => {
    const para = detectPara(["PARA", "PARA/🚀 Projects", "PARA/📚 Resources", "PARA/🗄 Archives", "Daily"], structure());
    expect(para?.root).toBe("PARA");
    expect(para?.folders.get("PARA/🗄 Archives")).toBe("archive");
  });

  it("matches folder names, not paths", () => {
    const para = detectPara(["Projects", "Areas", "Projects/Website", "Areas/Old Archive"], structure());
    expect([...para!.folders.keys()]).toEqual(["Projects", "Areas"]);
  });

  it("needs two categories side by side in auto mode", () => {
    expect(detectPara(["Projects", "Journal"], structure())).toBeNull();
    expect(detectPara(["A/Projects", "B/Areas"], structure())).toBeNull();
  });

  it("prefers the parent covering more categories", () => {
    const para = detectPara(["Projects", "Work/Projects", "Work/Areas", "Work/Resources"], structure());
    expect(para?.root).toBe("Work");
  });

  it("ignores folders deeper than three levels", () => {
    expect(detectPara(["a/b/c/Projects", "a/b/c/Areas"], structure())).toBeNull();
  });

  it("respects the layout mode", () => {
    expect(detectPara(["Projects", "Areas"], structure({ layoutMode: "free" }))).toBeNull();
    expect(detectPara(["Journal"], structure({ layoutMode: "para" }))).toEqual({ root: "/", folders: new Map() });
  });
});
