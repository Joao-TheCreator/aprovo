import { describe, expect, it } from "vitest";
import { LEGAL_SLUGS, loadLegalDoc, type LegalSlug } from "@/lib/legal/load";

describe("legal docs", () => {
  it("lists the three slugs", () => {
    expect(LEGAL_SLUGS).toEqual(["politica-de-privacidade", "termos-de-uso", "exclusao-de-dados"]);
  });
  it.each(LEGAL_SLUGS)("loads %s with an h1", (slug) => {
    const doc = loadLegalDoc(slug as LegalSlug);
    expect(doc.html).toMatch(/<h1[ >]/);
    expect(doc.title.length).toBeGreaterThan(0);
  });
});
