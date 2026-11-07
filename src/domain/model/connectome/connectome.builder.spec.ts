import { describe, expect, it } from "vitest";
import { CEREBRUM_BITS, R_CEREBELLUM, R_FRONTAL, R_OCCIPITAL, R_TEMPORAL, regionBit } from "../../contracts/anatomy";
import { PARA_VAULT, structure, vault } from "../../../test-support/fixtures";
import { buildConnectome } from "./connectome.builder";

const byName = (c: ReturnType<typeof buildConnectome>, name: string) => c.neurons.find((n) => n.name === name)!;

describe("buildConnectome", () => {
  const c = buildConnectome(PARA_VAULT, structure());

  it("maps PARA categories to their cortex", () => {
    expect(c.paraMode).toBe(true);
    expect(byName(c, "Plan")).toMatchObject({ category: "projects", region: R_FRONTAL, allowed: regionBit(R_FRONTAL) });
    expect(byName(c, "Atomic Habits")).toMatchObject({ category: "resources", region: R_TEMPORAL });
    expect(byName(c, "Old")).toMatchObject({ category: "archive", region: R_CEREBELLUM });
    expect(byName(c, "Idea")).toMatchObject({ category: "other", region: R_OCCIPITAL });
    expect(byName(c, "Root note")).toMatchObject({ category: "other", clusterLabel: "Vault root" });
  });

  it("clusters by the first sub-folder of a PARA folder", () => {
    expect(byName(c, "Plan").clusterKey).toBe(byName(c, "Copy").clusterKey);
    expect(byName(c, "Plan").clusterLabel).toBe("Website");
    expect(byName(c, "Launch").clusterLabel).toBe("Projects");
  });

  it("de-duplicates links and drops self-loops and unresolved targets", () => {
    expect(c.synapses).toHaveLength(3);
    expect(byName(c, "Sleep").degree).toBe(0);
    expect(byName(c, "Plan").degree).toBe(2);
  });

  it("flags cross-lobe synapses as long tracts", () => {
    const plan = c.neurons.indexOf(byName(c, "Plan"));
    const copy = c.neurons.indexOf(byName(c, "Copy"));
    const local = c.synapses.find((s) => [s.a, s.b].includes(plan) && [s.a, s.b].includes(copy))!;
    expect(local.cross).toBe(false);
    expect(c.synapses.filter((s) => s.cross)).toHaveLength(1);
  });

  it("grows soma radius with degree", () => {
    expect(byName(c, "Plan").r).toBeGreaterThan(byName(c, "Sleep").r);
  });

  it("can exclude folders and orphans", () => {
    const filtered = buildConnectome(PARA_VAULT, structure({ excludedFolders: "4. Archive, /📥 Inbox/", showOrphans: false }));
    const names = filtered.neurons.map((n) => n.name).sort();
    expect(names).toEqual(["Atomic Habits", "Copy", "Plan"]);
    expect(filtered.synapses.every((s) => s.a < filtered.neurons.length && s.b < filtered.neurons.length)).toBe(true);
  });

  it("uses the whole cerebrum when there is no PARA", () => {
    const free = buildConnectome(vault(["Journal/a.md", "Work/b.md"]), structure());
    expect(free.paraMode).toBe(false);
    expect(free.neurons.every((n) => n.category === null && n.allowed === CEREBRUM_BITS)).toBe(true);
    expect(free.neurons.map((n) => n.clusterKey)).toEqual(["Journal", "Work"]);
  });
});

describe("paraFolders", () => {
  it("records the detected folder names per category, for captions", () => {
    const c = buildConnectome(vault(["01_ProJeCt/a.md", "02_aReAs/b.md", "02_aReAs/c.md", "Inbox/d.md"]), structure());
    expect(c.paraFolders).toEqual({ projects: ["01_ProJeCt"], areas: ["02_aReAs"] });
  });
});
