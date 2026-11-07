import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // `obsidian` ships typings only (the app provides it at runtime), so tests
    // of the Obsidian adapters resolve it to a stub of the classes they use.
    alias: { obsidian: fileURLToPath(new URL("./src/test-support/obsidian.stub.ts", import.meta.url)) },
  },
});
