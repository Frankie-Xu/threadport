import { defineConfig } from "vitest/config";

/**
 * Test the TypeScript sources only.
 *
 * `npm run check` compiles into dist/ first. Newer Vitest majors will also
 * pick up dist/tests/*.js unless the include list is pinned here, which
 * then looks for fixtures next to the compiled files and fails.
 */
export default defineConfig({
  test: {
    // Native SQLite/Git/ACL fixtures must not oversubscribe shared runners.
    maxWorkers: 2,
    testTimeout: process.platform === "win32" ? 30000 : 5000,
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"]
  },
  coverage: {
    provider: "v8",
    include: ["src/**/*.ts"],
    exclude: ["src/**/*.d.ts"],
    reporter: ["text", "json-summary"],
    thresholds: {
      lines: 70,
      functions: 70,
      statements: 70,
      branches: 60
    }
  }
});
