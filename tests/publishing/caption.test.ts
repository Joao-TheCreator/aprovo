import { describe, expect, it } from "vitest";
import { CAPTION_MAX, HASHTAGS_MAX, buildCaption } from "@/lib/publishing/caption";

describe("buildCaption", () => {
  it("returns the trimmed caption without hashtags", () => {
    expect(buildCaption("  Olá mundo \n", [])).toBe("Olá mundo");
    expect(buildCaption(null, [])).toBe("");
  });

  it("normalizes # prefixes, skips empties and dedupes case-insensitively", () => {
    expect(buildCaption("Texto", ["#Moda", "moda", "", "  ", "##verao", "MODA"])).toBe(
      "Texto\n\n#Moda #verao",
    );
  });

  it("emits only hashtags when the caption is empty", () => {
    expect(buildCaption(null, ["a", "b"])).toBe("#a #b");
  });

  it("keeps at most 30 hashtags", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `tag${i}`);
    const out = buildCaption("x", tags);
    const found = out.split("\n\n")[1].split(" ");
    expect(found).toHaveLength(HASHTAGS_MAX);
    expect(found[29]).toBe("#tag29");
  });

  it("caps the total at 2200 chars, dropping hashtags before truncating text", () => {
    const tags = Array.from({ length: 10 }, (_, i) => `hashtag${i}`);
    const text = "a".repeat(CAPTION_MAX - 30);
    const out = buildCaption(text, tags);
    expect(out.length).toBeLessThanOrEqual(CAPTION_MAX);
    expect(out.startsWith(text)).toBe(true);
    for (const t of out.split("\n\n")[1]?.split(" ") ?? []) expect(t).toMatch(/^#hashtag\d$/);

    const long = buildCaption("b".repeat(5000), ["x"]);
    expect(long.length).toBeLessThanOrEqual(CAPTION_MAX);
    expect(long.startsWith("bbb")).toBe(true);
  });
});
