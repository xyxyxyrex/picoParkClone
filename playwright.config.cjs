const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  workers: 1,
  webServer: {
    command: "node scripts/signaling-test.cjs",
    port: 9000,
    reuseExistingServer: true,
  },
  use: {
    baseURL: process.env.PARK_TEST_URL || "http://localhost:8788",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
  },
});
