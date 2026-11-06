import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { createDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is not set.");

// Never let app code under test touch the dev database.
process.env.DATABASE_URL = url;

export const { db: testDb, client } = createDb(url, { max: 2 });

beforeAll(async () => {
  await runMigrations(url);
});

beforeEach(async () => {
  const rows = await testDb.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'`,
  );
  const names = [...rows].map((r) => `"public"."${r.tablename}"`);
  if (names.length) await testDb.execute(sql.raw(`truncate table ${names.join(", ")} cascade`));
});

afterAll(async () => {
  await client.end();
});
