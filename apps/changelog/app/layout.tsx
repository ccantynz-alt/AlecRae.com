import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vienna Changelog — Releases & Updates",
  description: "Every Vienna release. New features, fixes, and breaking changes.",
  applicationName: "Vienna Changelog",
  openGraph: {
    title: "Vienna Changelog",
    description: "Every Vienna release.",
    url: "https://changelog.48co.ai",
    siteName: "Vienna Changelog",
    type: "website",
  },
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
      <body className="h-full bg-slate-950 text-white font-sans">{children}</body>
    </html>
  );
}
