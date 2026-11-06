import { Logo } from "@/components/app/Logo";
import { APPROVAL_ERROR_MESSAGES } from "@/lib/approvals/contracts";

export function InactiveLinkCard() {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center p-4">
      <div className="border-border bg-card flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border p-8 text-center">
        <Logo height={36} />
        <h1 className="text-lg font-semibold">Este link não está mais ativo.</h1>
        <p className="text-muted-foreground text-[15px]">
          {APPROVAL_ERROR_MESSAGES.link_inactive.replace("Este link não está mais ativo. ", "")}
        </p>
      </div>
    </main>
  );
}
