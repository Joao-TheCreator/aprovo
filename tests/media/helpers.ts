import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorkspaceForUser } from "@/lib/workspace/create";
import { profiles, users } from "@/db/schema";
import { testDb } from "../setup";

export async function makeTempStorage(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aprovo-media-"));
  process.env.LOCAL_STORAGE_DIR = dir;
  process.env.STORAGE_DRIVER = "local";
  process.env.AUTH_SECRET ||= "test-secret";
  process.env.APP_URL ||= "http://localhost:3000";
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

export async function seedWorkspace(email = "a@x.co") {
  const [u] = await testDb.insert(users).values({ email }).returning();
  const ws = await createWorkspaceForUser(testDb, u);
  const [profile] = await testDb
    .insert(profiles)
    .values({ workspaceId: ws.id, igUsername: "cliente" })
    .returning();
  return { user: u, ws, profile };
}

/** Mock factory for lib/auth/require backed by the test DB; `mocks.user.id` selects the actor. */
export async function makeRequireMock(mocks: { user: { id: string } }) {
  const { eq } = await import("drizzle-orm");
  const { notFound } = await import("next/navigation");
  const { db } = await import("@/db/client");
  const schema = await import("@/db/schema");
  const { getMemberRole } = await import("@/lib/workspace/membership");
  const requireWorkspaceMember = async (workspaceId: string) => {
    const role = await getMemberRole(db, workspaceId, mocks.user.id);
    if (!role) notFound();
    return { user: mocks.user, workspaceId, role };
  };
  return {
    requireUser: async () => mocks.user,
    requireWorkspaceMember,
    requireWorkspaceForProfile: async (profileId: string) => {
      const [profile] = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, profileId))
        .limit(1);
      if (!profile) notFound();
      const m = await requireWorkspaceMember(profile.workspaceId);
      return { ...m, profile };
    },
  };
}
