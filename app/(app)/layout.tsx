import { AppShell } from "@/components/app/AppShell";
import { requireUser } from "@/lib/auth/require";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
