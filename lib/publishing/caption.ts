/** Limits from docs/12 section 3 (Instagram caption). */
export const CAPTION_MAX = 2200;
export const HASHTAGS_MAX = 30;

function normalizeHashtags(hashtags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of hashtags) {
    const tag = raw.trim().replace(/^#+/, "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= HASHTAGS_MAX) break;
  }
  return out;
}

/** Final Instagram caption: trimmed text, blank line, then `#tags` (max 30, total max 2200 chars). */
export function buildCaption(caption: string | null, hashtags: string[]): string {
  const text = (caption ?? "").trim();
  const tags = normalizeHashtags(hashtags).map((t) => `#${t}`);
  const join = (t: string[]): string => {
    if (t.length === 0) return text;
    const block = t.join(" ");
    return text ? `${text}\n\n${block}` : block;
  };
  while (tags.length > 0 && join(tags).length > CAPTION_MAX) tags.pop();
  const full = join(tags);
  return full.length > CAPTION_MAX ? full.slice(0, CAPTION_MAX).trimEnd() : full;
}
