/**
 * Runtime stand-in for the `obsidian` package in tests (see vitest.config.ts).
 * Only the classes adapters check with `instanceof`; build them with the
 * fields the adapter reads.
 */
export class TAbstractFile {
  constructor(readonly path: string) {}
}

export class TFolder extends TAbstractFile {
  isRoot(): boolean {
    return this.path === "/";
  }
}
