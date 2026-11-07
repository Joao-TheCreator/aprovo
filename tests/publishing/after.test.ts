import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importedPosts, posts, publications } from "@/db/schema";
import { testDb as db } from "../setup";
import { seedJob } from "./seed";

const mocks = vi.hoisted(() => ({
  published: vi.fn(),
  failed: vi.fn(),
  lost: vi.fn(),
  importProfile: vi.fn(),
}));
vi.mock("@/lib/email/send", () => ({
  sendPublishedEmail: mocks.published,
  sendPublishFailedEmail: mocks.failed,
  sendConnectionLostEmail: mocks.lost,
}));
vi.mock("@/lib/profiles/import", () => ({ importProfileFromProvider: mocks.importProfile }));

import { onFailed, onPublished } from "@/lib/publishing/after";
import { buildProfileFeed } from "@/lib/profiles/feed";

beforeEach(() => {
  process.env.APP_URL = "http://localhost:3000";
  mocks.published.mockReset().mockResolvedValue(undefined);
  mocks.failed.mockReset().mockResolvedValue(undefined);
  mocks.importProfile.mockReset().mockResolvedValue({ ok: true, imported: 1 });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function seedPublished() {
  const job = await seedJob();
  const publishedAt = new Date();
  const [pub] = await db
    .update(publications)
    .set({
      status: "published",
      igMediaId: "ig_live_1",
      permalink: "https://www.instagram.com/p/abc/",
      publishedAt,
      createdBy: job.user.id,
    })
    .where(eq(publications.id, job.pub.id))
    .returning();
  return { ...job, pub };
}

describe("onPublished", () => {
  it("e-mails the author with the permalink, imports the profile and keeps the post published", async () => {
    const { pub, post, profile } = await seedPublished();
    await onPublished(pub);

    const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(row.status).toBe("published");
    expect(row.publishedMediaId).toBe("ig_live_1");

    expect(mocks.published).toHaveBeenCalledTimes(1);
    expect(mocks.published).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@x.co",
        profileUsername: "cliente",
        postCaption: "Legenda",
        permalink: "https://www.instagram.com/p/abc/",
        publishedAt: pub.publishedAt,
      }),
    );
    expect(mocks.importProfile).toHaveBeenCalledWith(profile.id);
  });

  it("is idempotent", async () => {
    const { pub, post } = await seedPublished();
    await onPublished(pub);
    await onPublished(pub);
    const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(row.status).toBe("published");
    expect(row.publishedMediaId).toBe("ig_live_1");
  });

  it("never throws when the e-mail and the import both fail", async () => {
    const { pub } = await seedPublished();
    mocks.published.mockRejectedValue(new Error("resend down"));
    mocks.importProfile.mockRejectedValue(new Error("graph down"));
    await expect(onPublished(pub)).resolves.toBeUndefined();
    expect(mocks.importProfile).toHaveBeenCalled();
  });

  it("does not throw when the import reports an error result", async () => {
    const { pub } = await seedPublished();
    mocks.importProfile.mockResolvedValue({ ok: false, error: { code: "provider_down" } });
    await expect(onPublished(pub)).resolves.toBeUndefined();
  });

  it("does not e-mail when nobody is recorded as the author", async () => {
    const { pub } = await seedPublished();
    await onPublished({ ...pub, createdBy: null });
    expect(mocks.published).not.toHaveBeenCalled();
    expect(mocks.importProfile).toHaveBeenCalled();
  });
});

describe("feed after publication", () => {
  async function publishedPost() {
    const seeded = await seedPublished();
    await db
      .update(posts)
      .set({ status: "published", publishedMediaId: "ig_live_1" })
      .where(eq(posts.id, seeded.post.id));
    return seeded;
  }

  it("shows the published post once: planned until imported, then only the imported one", async () => {
    const { pub, post, profile } = await publishedPost();

    const before = await buildProfileFeed(profile.id);
    expect(before?.items.filter((i) => i.kind === "planned").map((i) => i.id)).toEqual([post.id]);
    expect(before?.items.filter((i) => i.kind === "imported")).toHaveLength(0);

    await db.insert(importedPosts).values({
      profileId: profile.id,
      igMediaId: pub.igMediaId!,
      mediaType: "image",
      permalink: pub.permalink,
      caption: "Legenda",
      publishedAt: pub.publishedAt,
    });
    const after = await buildProfileFeed(profile.id);
    expect(after?.items.filter((i) => i.kind === "planned")).toHaveLength(0);
    expect(after?.items.filter((i) => i.kind === "imported")).toHaveLength(1);
  });

  it("keeps a published post whose media id was not imported", async () => {
    const { profile } = await publishedPost();
    await db.insert(importedPosts).values({
      profileId: profile.id,
      igMediaId: "something_else",
      mediaType: "image",
    });
    const feed = await buildProfileFeed(profile.id);
    expect(feed?.items.filter((i) => i.kind === "planned")).toHaveLength(1);
  });
});

describe("onFailed", () => {
  async function seedFailed(code: string, message: string) {
    const job = await seedJob();
    const [pub] = await db
      .update(publications)
      .set({ status: "failed", lastErrorCode: code, lastError: message, createdBy: job.user.id })
      .where(eq(publications.id, job.pub.id))
      .returning();
    return { ...job, pub };
  }

  it("e-mails the friendly reason with a link to the post page", async () => {
    const reason = "O Instagram recusou a mídia. Confira o formato, o tamanho e a proporção.";
    const { pub, post, profile } = await seedFailed("media_rejected", reason);
    await onFailed(pub);
    expect(mocks.failed).toHaveBeenCalledTimes(1);
    expect(mocks.failed).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@x.co",
        profileUsername: "cliente",
        reason,
        url: `http://localhost:3000/perfis/${profile.id}/posts/${post.id}`,
      }),
    );
  });

  it("leaves account-level failures to the single connection e-mail", async () => {
    const { pub } = await seedFailed("token_expired", "x");
    await onFailed(pub);
    expect(mocks.failed).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    const { pub } = await seedFailed("network", "x");
    mocks.failed.mockRejectedValue(new Error("boom"));
    await expect(onFailed(pub)).resolves.toBeUndefined();
  });
});
