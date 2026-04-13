import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlecRae Changelog — Releases & Updates",
  description: "Every AlecRae release. New features, fixes, and breaking changes.",
  applicationName: "AlecRae Changelog",
  openGraph: {
    title: "AlecRae Changelog",
    description: "Every AlecRae release.",
    url: "https://changelog.alecrae.com",
    siteName: "AlecRae Changelog",
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
