import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vienna API Docs — Developer Documentation",
  description: "Developer documentation for the Vienna email platform API.",
  applicationName: "Vienna Docs",
  openGraph: {
    title: "Vienna API Docs",
    description: "Developer documentation for the Vienna email platform.",
    url: "https://docs.48co.ai",
    siteName: "Vienna Docs",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

interface NavItem {
  readonly slug: string;
  readonly label: string;
}

const NAV: readonly NavItem[] = [
  { slug: "quickstart", label: "Quickstart" },
  { slug: "authentication", label: "Authentication" },
  { slug: "messages", label: "Messages" },
  { slug: "domains", label: "Domains" },
  { slug: "webhooks", label: "Webhooks" },
  { slug: "errors", label: "Errors" },
  { slug: "api-reference", label: "API Reference" },
];

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
        <div className="relative z-10 flex min-h-screen">
          <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-white/10 bg-slate-950/40 backdrop-blur-sm p-6">
            <Link href="/" className="mb-8 block">
              <div className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent">
                Vienna
              </div>
              <div className="text-xs uppercase tracking-wider text-blue-200/60 mt-1">Docs</div>
            </Link>
            <nav className="space-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.slug}
                  href={`/${item.slug}`}
                  className="block rounded-lg px-3 py-2 text-sm text-blue-100/70 hover:bg-white/5 hover:text-white transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto pt-8 text-xs text-blue-200/40">© 2026 Vienna</div>
          </aside>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
