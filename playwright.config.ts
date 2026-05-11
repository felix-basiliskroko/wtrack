import { defineConfig, devices } from '@playwright/test';

const dataDir = `/private/tmp/wtrack-playwright-${Date.now()}`;
const port = 8791;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: `npm run build && HOST=127.0.0.1 PORT=${port} WTRACK_DATA_DIR=${dataDir} npm run start`,
    url: `http://127.0.0.1:${port}/api/healthz`,
    reuseExistingServer: false,
    timeout: 40_000,
  },
});
