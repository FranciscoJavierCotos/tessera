import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Auth e2e creates users through the Supabase Admin API (cloud project): load
// `.env.local` locally. Variables already set (CI secrets) win.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const port = 3000;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    timezoneId: "UTC",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI runs against the production build; locally reuse a running dev server.
    command: process.env.CI
      ? `pnpm start --port ${port}`
      : `pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
