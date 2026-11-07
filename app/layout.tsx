import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Unbounded } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/components/app/theme";
import { Toaster } from "@/components/ui/sonner";

/** Display face: wide geometric, used only for headings and big numbers (docs/14). */
const display = Unbounded({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
  variable: "--font-display-face",
  display: "swap",
});

/** UI face: everything else. Poppins stays in the stack as a fallback. */
const ui = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "APROVO",
  description: "Planeje. Aprove. Publique.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Aprovo", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0816" },
    { media: "(prefers-color-scheme: light)", color: "#F7F5FF" },
  ],
  colorScheme: "dark light",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`h-full ${display.variable} ${ui.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme before paint (no flash). See components/app/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
