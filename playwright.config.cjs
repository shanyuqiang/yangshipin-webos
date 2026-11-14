const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.cjs',
  workers: 1,
  timeout: 15000,
  use: { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, baseURL: 'http://127.0.0.1:41973', viewport: { width: 1280, height: 720 }, trace: 'retain-on-failure' },
  webServer: { command: 'node tests/e2e/server.cjs', url: 'http://127.0.0.1:41973/fixture', reuseExistingServer: false }
});
