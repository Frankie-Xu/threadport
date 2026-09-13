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
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"]
  }
});
