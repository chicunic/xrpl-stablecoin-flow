import { availableParallelism } from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Default config targets the local Docker rippled.

// Scale workers to CPUs but cap at 4: all files fund from one genesis account, so more workers mean more
// sequence collisions (retried in fund.helper.ts). CI runners (2 cores) get 2, dev machines get up to 4.
const MAX_WORKERS = Math.min(availableParallelism(), 4);
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    // No thresholds: line coverage of src is not a meaningful gate for integration suites
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{ts,js}"],
      exclude: ["src/**/*.d.ts", "src/index.ts"],
    },
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tests": path.resolve(__dirname, "./tests"),
    },
    testTimeout: 30000,
    // Files run in parallel; wallets are independent, shared-source funding retries collisions (fund.helper.ts).
    fileParallelism: true,
    maxWorkers: MAX_WORKERS,
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/setup-local.ts"],
    clearMocks: true,
    restoreMocks: true,
    env: {
      XRPL_NETWORK: "local",
    },
  },
});
