/**
 * Reviewer access helpers (docs/10 §9).
 *   pnpm reviewer:hash <senha>   → prints the value for REVIEWER_PASSWORD_HASH
 *   pnpm reviewer:revoke         → deletes the reviewer's sessions (needs DATABASE_URL and REVIEWER_EMAIL)
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) if (existsSync(file)) config({ path: file });

const [cmd, arg] = process.argv.slice(2);

async function main() {
  const { hashPassword, revokeReviewerSessions } = await import("@/lib/auth/reviewer");
  if (cmd === "hash") {
    if (!arg) throw new Error("Uso: pnpm reviewer:hash <senha>");
    console.log(hashPassword(arg));
    return;
  }
  if (cmd === "revoke") {
    const email = process.env.REVIEWER_EMAIL?.trim().toLowerCase();
    if (!email) throw new Error("Defina REVIEWER_EMAIL no ambiente.");
    const { createDb } = await import("@/db/client");
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Defina DATABASE_URL no ambiente.");
    const { db, client } = createDb(url);
    try {
      const n = await revokeReviewerSessions(db, email);
      console.log(`Sessões do revisor removidas: ${n}`);
    } finally {
      await client.end();
    }
    return;
  }
  throw new Error("Comando desconhecido. Use `hash <senha>` ou `revoke`.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
