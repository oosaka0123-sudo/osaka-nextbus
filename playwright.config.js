const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8123",
    headless: true,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "python3 -m http.server 8123",
    url: "http://127.0.0.1:8123",
    reuseExistingServer: true,
    timeout: 15000,
  },
});
