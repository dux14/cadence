import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/sync/**"],
      // orchestrator.ts is browser-trigger wiring (events, web locks, realtime);
      // it is exercised by the manual e2e checklist, not unit-testable in node.
      exclude: ["lib/sync/orchestrator.ts"],
      thresholds: { lines: 85, functions: 85, branches: 75 },
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
});
