import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>["db"];

export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 1, prepare: false });
  return { db: drizzle(client, { schema }), client };
}

const globalForDb = globalThis as unknown as { __aprovoDb?: Database };

function init(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  // max: 1 keeps one connection per serverless instance (Neon/Vercel friendly);
  // raise it for a long-lived server. The singleton survives dev hot reloads.
  return createDb(url, { max: 1 }).db;
}

export const db: Database = new Proxy({} as Database, {
  get(_t, prop, receiver) {
    globalForDb.__aprovoDb ??= init();
    return Reflect.get(globalForDb.__aprovoDb, prop, receiver);
  },
});
