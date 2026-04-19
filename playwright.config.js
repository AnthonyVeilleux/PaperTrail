// @ts-check
const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: './tests/e2e',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: 'http://localhost:8099',
  },
  webServer: {
    command: 'npx http-server tests/dist -p 8099 --cors -s',
    url: 'http://localhost:8099',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
