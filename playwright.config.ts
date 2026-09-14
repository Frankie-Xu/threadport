import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    browserName: "chromium",
    ...(process.env.THREADPORT_TEST_CHROME ? { channel: "chrome" } : {}),
    viewport: { width: 1280, height: 800 },
    trace: "off",
    screenshot: "off",
  },
  outputDir: "output/playwright/e2e",
});
