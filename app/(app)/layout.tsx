import { cookies } from "next/headers";

import { AppShell } from "@/components/app/AppShell";
import { requireUser } from "@/lib/auth/require";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const lastProfileId = (await cookies()).get("aprovo_last_profile")?.value ?? null;
  return (
    <AppShell user={user} lastProfileId={lastProfileId}>
      {children}
    </AppShell>
  );
}
