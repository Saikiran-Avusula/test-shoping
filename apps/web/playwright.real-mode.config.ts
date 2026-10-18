import { defineConfig, devices } from "@playwright/test";

// Real-account MODE tests without a database: the site is built with NEXT_PUBLIC_API_URL set (so it behaves as it does with the
// real store API: no sample data, sign-in required) and the API's answers are faked inside the browser by the tests.
// For the real server and MySQL see playwright.api.config.ts.
const port = 3101;

export default defineConfig({
  testDir: "./e2e-real-mode",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: { command: `serve out --listen ${port} --no-clipboard`, url: `http://localhost:${port}`, reuseExistingServer: false, timeout: 30_000 },
});
