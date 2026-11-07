import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (docs/05, T12). They run against a PRODUCTION build served by `next start`
 * (`pnpm build` first) and a Postgres database that is already migrated (`pnpm db:migrate`).
 * See README "Testes" for the environment variables the server needs (IG_PUBLISHER=fake etc.).
 */
const port = 3000;

export default defineConfig({
  testDir: "tests/e2e",
  // One worker: the specs share one database and the scheduler claims any due publication.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start",
    port,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
