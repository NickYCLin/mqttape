import { defineConfig } from '@playwright/test'

const e2ePort = Number(process.env.MQTTAPE_E2E_PORT ?? 4174)

if (!Number.isInteger(e2ePort) || e2ePort < 1 || e2ePort > 65_535) {
  throw new Error('MQTTAPE_E2E_PORT must be an integer between 1 and 65535')
}

const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : 'line',
  outputDir: 'test-results/e2e',
  use: {
    baseURL: e2eBaseUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `npm run preview:web -- --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000
  }
})
