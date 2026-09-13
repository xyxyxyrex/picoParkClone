const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  workers: 1,
  webServer: [
    {
      command: "npm run dev:test",
      port: 8788,
      reuseExistingServer: true,
    },
    {
      command: "node scripts/signaling-test.cjs",
      port: 9000,
      reuseExistingServer: true,
    },
    /* Relay plus the built static site, mirroring the VPS layout. */
    {
      command: "node scripts/relay-test-server.cjs",
      port: 8789,
      reuseExistingServer: true,
    },
  ],
  use: {
    baseURL: process.env.PARK_TEST_URL || "http://localhost:8788",
    /* Override to "chromium" on machines without Edge installed. */
    channel: process.env.PARK_TEST_CHANNEL || "msedge",
    headless: true,
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
  },
});
