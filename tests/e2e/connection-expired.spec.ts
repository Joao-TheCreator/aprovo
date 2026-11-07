import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { CRON_SECRET, seedDuePublication, seedScenario, setConnectionStatus } from "./seed";

test("expired connection fails the publication; reconnecting lets the user reschedule it", async ({
  browser,
  request,
}) => {
  const s = await seedScenario("expired");
  const caption = "Publicacao que vai falhar";
  await seedDuePublication(s, { caption, position: 2 });
  await setConnectionStatus(s.connectionId, "expired");

  const run = await request.get("/api/publishing/run", {
    headers: { "x-cron-secret": CRON_SECRET },
  });
  expect(run.status()).toBe(200);
  const counts = (await run.json()) as { published: number; failed: number };
  expect(counts.published).toBe(0);
  expect(counts.failed).toBe(1);

  const context = await browser.newContext();
  await signIn(context, s);
  const page = await context.newPage();
  const agendadas = `/perfis/${s.profileId}/agendadas`;
  await page.goto(agendadas);
  const failures = page.getByRole("region", { name: "Falhas" });
  await expect(failures).toContainText(caption);
  await expect(failures.getByRole("button", { name: "Reagendar" })).toBeVisible();

  // The user reconnects the account (simulated: the OAuth round trip needs Meta).
  await setConnectionStatus(s.connectionId, "active");
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: /Reagendar a 1 publicação que falhou/ }).click();
  await expect(page.getByText("1 publicação reagendada")).toBeVisible();

  await page.goto(agendadas);
  await expect(page.getByRole("region", { name: "Agendadas" })).toContainText(caption);
  await expect(page.getByRole("region", { name: "Falhas" })).toContainText("Nenhuma falha.");
  await context.close();
});
