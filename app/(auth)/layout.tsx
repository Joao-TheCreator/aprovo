// The auth screens (/entrar, /verificar) are full-screen landings that bring their own logo
// and chrome (app/(auth)/_components/AuthScreen.tsx), so this layout is a passthrough.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
