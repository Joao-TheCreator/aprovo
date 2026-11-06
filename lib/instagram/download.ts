/**
 * Remote image downloader, isolated in its own module so tests can vi.mock it.
 * Returns null on any failure (caller logs and continues without a thumbnail).
 */
const MAX_BYTES = 20 * 1024 * 1024;

export async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const res = await fetch(u, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null;
  } catch {
    return null;
  }
}
