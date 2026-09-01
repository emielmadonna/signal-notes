import { defineConfig } from "@playwright/test";

/**
 * E2E + visual-evidence harness (THE-GATE §3: screenshots captured by a
 * headless browser for the UI rules). Specs live in e2e/; screenshots land in
 * shiplog/evidence/ so SHIPLOG and Change Cards can reference them by name.
 *
 * Credentials come from the environment (.env.local locally, secrets in CI):
 * the seeded test users from scripts/seed.ts sign in with SEED_USER_PASSWORD.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  timeout: 60_000,
  retries: 0,
  workers: 1, // shared seeded data; serial keeps runs deterministic
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    viewport: { width: 1440, height: 940 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/signin",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
