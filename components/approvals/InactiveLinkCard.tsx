import { Logo } from "@/components/app/Logo";
import { APPROVAL_ERROR_MESSAGES } from "@/lib/approvals/contracts";

const CODES = {
  expired: "link_expired",
  revoked: "link_revoked",
  inactive: "link_inactive",
} as const;

/** First sentence becomes the title, the remainder the body. */
function splitMessage(message: string): { title: string; body: string } {
  const i = message.indexOf(". ");
  if (i === -1) return { title: message, body: "" };
  return { title: message.slice(0, i + 1), body: message.slice(i + 2) };
}

export function InactiveLinkCard({ reason = "inactive" }: { reason?: keyof typeof CODES }) {
  const { title, body } = splitMessage(APPROVAL_ERROR_MESSAGES[CODES[reason]]);
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center p-4">
      <div className="border-border bg-card flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border p-8 text-center">
        <Logo height={36} />
        <h1 className="text-lg font-semibold">{title}</h1>
        {body ? <p className="text-muted-foreground text-[15px]">{body}</p> : null}
      </div>
    </main>
  );
}
