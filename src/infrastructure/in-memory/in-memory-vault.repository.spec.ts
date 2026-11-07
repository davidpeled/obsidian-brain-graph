import { vaultRepositoryContract } from "../../test-support/vault-repository.contract";
import { InMemoryVaultRepository } from "./in-memory-vault.repository";

vaultRepositoryContract("InMemoryVaultRepository", (vault) => {
  const repo = new InMemoryVaultRepository(vault);
  return { repo, changes: { set: () => repo.set(repo.snapshot()) } };
});
