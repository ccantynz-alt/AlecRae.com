import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { NavLink } from "./components/nav-link";
import { Search } from "./components/search";
import { MobileNav } from "./components/mobile-nav";
import { NAV_GROUPS } from "./components/nav-data";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlecRae API Documentation",
  description: "Developer documentation for the AlecRae email platform API. Send, receive, and manage email programmatically.",
  applicationName: "AlecRae Docs",
  openGraph: {
    title: "AlecRae API Documentation",
    description: "Developer documentation for the AlecRae email platform API.",
    url: "https://docs.alecrae.com",
    siteName: "AlecRae Docs",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white font-sans">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-10" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-10" />
        </div>

        <MobileNav groups={NAV_GROUPS} />

        <div className="relative z-10 flex min-h-screen">
          <aside className="hidden md:flex w-72 shrink-0 flex-col border-r border-white/10 bg-slate-950/60 backdrop-blur-md sticky top-0 h-screen overflow-y-auto">
            <div className="p-6 border-b border-white/10">
              <Link href="/" className="block mb-4">
                <div className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent">
                  AlecRae
                </div>
                <div className="text-xs uppercase tracking-wider text-blue-200/50 mt-1">API Documentation</div>
              </Link>
              <Search />
            </div>

            <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="text-xs font-semibold text-blue-200/40 uppercase tracking-wider mb-2 px-3">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink key={item.slug} href={`/${item.slug}`} label={item.label} />
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="p-4 border-t border-white/10">
              <div className="flex items-center gap-3 px-3">
                <a
                  href="https://api.alecrae.com/openapi.yaml"
                  className="text-xs text-blue-200/40 hover:text-cyan-300 transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenAPI Spec
                </a>
                <span className="text-white/10">|</span>
                <a
                  href="https://mail.alecrae.com"
                  className="text-xs text-blue-200/40 hover:text-cyan-300 transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Dashboard
                </a>
              </div>
              <div className="mt-3 px-3 text-xs text-blue-200/25">
                &copy; 2026 AlecRae &middot; alecrae.com
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
