import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { CRON_SECRET, makeDueNow, seedScenario } from "./seed";

test("approval link per person, scheduling and publication by the cron (fake publisher)", async ({
  browser,
  request,
}) => {
  const s = await seedScenario("approval");
  const postUrl = `/perfis/${s.profileId}/posts/${s.postId}`;

  // Social media: send the draft for approval to one person.
  const smContext = await browser.newContext();
  await signIn(smContext, s);
  const page = await smContext.newPage();
  await page.goto(postUrl);
  await expect(page.getByText("Rascunho", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Enviar para aprovação" }).click();
  await expect(page.getByRole("heading", { name: "Enviar para aprovação" })).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill("Carlos");
  await page.getByRole("button", { name: "Gerar link", exact: true }).click();
  const linkInput = page.getByLabel("Link de aprovação de Carlos", { exact: true });
  await expect(linkInput).toBeVisible();
  const approvalUrl = await linkInput.inputValue();
  expect(approvalUrl).toMatch(/\/a\/[A-Za-z0-9_-]+$/);

  // Client: a fresh context without any cookie decides through the personal link.
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await client.goto(approvalUrl);
  await expect(client.getByText("Decidindo como Carlos")).toBeVisible();
  await client.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(client.getByText("Tudo decidido")).toBeVisible();
  await client.reload();
  await expect(client.getByRole("heading", { name: "Aprovação registrada" })).toBeVisible();
  await expect(client.getByRole("button", { name: "Aprovar", exact: true })).toHaveCount(0);
  await clientContext.close();

  // Social media: the post is approved, schedule it for tomorrow 10:00.
  await page.goto(postUrl);
  await expect(page.getByText("Aprovada", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Agendar", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Agendar publicação" })).toBeVisible();
  await sheet.getByLabel("Hora").fill("10:00");
  await sheet.getByRole("button", { name: "Agendar", exact: true }).click();
  await expect(page.getByText("Agendada", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Agendada para/)).toBeVisible();

  // Make it due now and trigger the scheduler the way production does.
  await makeDueNow(s.postId);
  const run = await request.get("/api/publishing/run", {
    headers: { "x-cron-secret": CRON_SECRET },
  });
  expect(run.status()).toBe(200);
  const counts = (await run.json()) as { published: number; failed: number };
  expect(counts.published).toBe(1);
  expect(counts.failed).toBe(0);

  await page.goto(postUrl);
  await expect(page.getByText("Publicada", { exact: true }).first()).toBeVisible();
  await page.goto(`/perfis/${s.profileId}/agendadas`);
  await expect(page.getByRole("region", { name: "Publicadas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir no Instagram" })).toBeVisible();
  await smContext.close();
});
