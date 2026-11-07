import { expect, test } from "@playwright/test";

test.describe("scheduler endpoint", () => {
  test("rejects a request without the cron secret", async ({ request }) => {
    const res = await request.get("/api/publishing/run");
    expect(res.status()).toBe(401);
  });

  test("rejects a wrong cron secret", async ({ request }) => {
    const res = await request.get("/api/publishing/run", {
      headers: { "x-cron-secret": "wrong" },
    });
    expect(res.status()).toBe(401);
  });
});

test("anonymous visitors are sent to the login page", async ({ page }) => {
  await page.goto("/configuracoes");
  await expect(page).toHaveURL(/\/entrar/);
});
