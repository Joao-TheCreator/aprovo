import Link from "next/link";
import { LegalShell } from "./LegalShell";
import { LEGAL_DOCS } from "@/lib/legal/load";

export const metadata = { title: "Documentos legais" };

export default function LegalIndexPage() {
  return (
    <LegalShell>
      <h1 className="font-display text-h1 mb-6">Documentos legais</h1>
      <ul className="flex flex-col gap-3">
        {LEGAL_DOCS.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/legal/${d.slug}`}
              className="text-title text-brand-ink underline-offset-4 hover:underline"
            >
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
    </LegalShell>
  );
}
