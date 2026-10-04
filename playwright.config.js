import { defineConfig } from "@playwright/test";
const port = Number(process.env.E2E_PORT || 3000);
const origin = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: origin, trace: "retain-on-failure" },
  webServer: {
    command: "node server/index.js",
    url: `${origin}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { DB_PATH: "data/e2e.db", APP_ORIGIN: origin, PORT: String(port) },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
