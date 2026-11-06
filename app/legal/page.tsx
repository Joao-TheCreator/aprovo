import Link from "next/link";
import { LegalShell } from "./LegalShell";
import { LEGAL_DOCS } from "@/lib/legal/load";

export const metadata = { title: "Documentos legais" };

export default function LegalIndexPage() {
  return (
    <LegalShell>
      <h1 className="mb-4 text-3xl leading-9 font-bold">Documentos legais</h1>
      <ul className="flex flex-col gap-3">
        {LEGAL_DOCS.map((d) => (
          <li key={d.slug}>
            <Link href={`/legal/${d.slug}`} className="text-lg underline">
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
    </LegalShell>
  );
}
