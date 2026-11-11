import { describe, expect, it } from "vitest";
import { PARA_VAULT, vault } from "../../../test-support/fixtures";
import { vaultFingerprint } from "./vault-fingerprint";

describe("vaultFingerprint", () => {
  const base = vaultFingerprint(PARA_VAULT);

  it("ignores ordering, duplicate links, link direction and self-links", () => {
    const shuffled = {
      ...PARA_VAULT,
      notes: [...PARA_VAULT.notes].reverse(),
      folders: [...PARA_VAULT.folders].reverse(),
      links: [...PARA_VAULT.links.map(([a, b]) => [b, a] as const), ...PARA_VAULT.links, ["Root note.md", "Root note.md"] as const],
    };
    expect(vaultFingerprint(shuffled)).toBe(base);
  });

  it("changes when a note, folder or link changes", () => {
    expect(vaultFingerprint({ ...PARA_VAULT, notes: [...PARA_VAULT.notes, { path: "x.md", basename: "x" }] })).not.toBe(base);
    const [first, ...rest] = PARA_VAULT.notes;
    expect(vaultFingerprint({ ...PARA_VAULT, notes: [{ ...first, created: 123 }, ...rest] })).not.toBe(base);
    expect(vaultFingerprint({ ...PARA_VAULT, folders: [...PARA_VAULT.folders, "New"] })).not.toBe(base);
    expect(vaultFingerprint({ ...PARA_VAULT, links: [...PARA_VAULT.links, ["Root note.md", "4. Archive/Old.md"]] })).not.toBe(base);
    expect(vaultFingerprint(vault(["a.md"], [], "other"))).not.toBe(vaultFingerprint(vault(["a.md"], [], "test")));
  });
});
