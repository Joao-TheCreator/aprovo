import { cookies } from "next/headers";

import { AppShell } from "@/components/app/AppShell";
import { getCurrentWorkspace, requireUser } from "@/lib/auth/require";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [cookieStore, ws] = await Promise.all([
    cookies(),
    user.id ? getCurrentWorkspace(user.id) : Promise.resolve(null),
  ]);
  const lastProfileId = cookieStore.get("aprovo_last_profile")?.value ?? null;
  return (
    <AppShell user={user} lastProfileId={lastProfileId} workspaceName={ws?.name ?? null}>
      {children}
    </AppShell>
  );
}
