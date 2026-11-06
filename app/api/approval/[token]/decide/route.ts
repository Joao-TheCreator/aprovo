import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { APPROVAL_ERROR_MESSAGES, decideSchema } from "@/lib/approvals/contracts";
import { decideByToken } from "@/lib/approvals/decide";
import { allow } from "@/lib/approvals/rate-limit";
import { hashToken } from "@/lib/approvals/token";

export const dynamic = "force-dynamic";

function err(status: number, code: string, message?: string) {
  return NextResponse.json(
    { ok: false, code, message: message ?? APPROVAL_ERROR_MESSAGES[code] ?? "Erro." },
    { status },
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ip = rawIp && isIP(rawIp) ? rawIp : null;
  if (!allow(`ip:${rawIp ?? "unknown"}`) || !allow(`tok:${hashToken(token)}`)) {
    return err(429, "rate_limited");
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid_input", "Requisição inválida.");
  }
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return err(400, "invalid_input", parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const { status, result } = await decideByToken(token, parsed.data, {
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  return NextResponse.json(result, { status });
}
