import { Logo } from "@/components/app/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="bg-card border-border w-full max-w-sm rounded-3xl border p-6 shadow-sm">
        <div className="mb-6 flex justify-center">
          <Logo height={40} />
        </div>
        {children}
      </div>
    </main>
  );
}
