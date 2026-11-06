import { Logo } from "@/components/app/Logo";

// Placeholder: the real approval logic arrives in Phase 4.
export default function ApprovalLinkPage() {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center p-4">
      <div className="border-border bg-card flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border p-8 text-center">
        <Logo height={36} />
        <h1 className="text-lg font-semibold">Este link não está mais ativo.</h1>
        <p className="text-muted-foreground text-[15px]">Peça um novo link ao seu social media.</p>
      </div>
    </main>
  );
}
