import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { BottomNav } from "@/components/bottom-nav";
import { SwRegister } from "@/components/sw-register";
import { SyncBoot } from "@/components/sync-boot";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cadence",
  description: "Your daily cadence — tasks, projects, and ideas in one calm place.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Cadence", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: shrink the layout viewport when the keyboard shows, so
  // bottom-anchored sheets stay visible. iOS ignores this; see ui/sheet.tsx.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f151c" },
  ],
};

// Set the theme class before paint to avoid a flash.
const themeScript = `(()=>{try{var t=localStorage.getItem('cadence-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jakarta.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full antialiased">
        <SwRegister />
        <AppShell>
          <AuthGate>
            <SyncBoot />
            {/* h-dvh + scrolling <main>: lists scroll under the fixed nav. */}
            <div className="mx-auto flex h-dvh max-w-md flex-col md:max-w-3xl md:flex-row xl:max-w-5xl">
              <BottomNav />
              <main className="order-first min-w-0 flex-1 overflow-y-auto overscroll-contain md:order-none">
                {children}
              </main>
            </div>
          </AuthGate>
        </AppShell>
      </body>
    </html>
  );
}
