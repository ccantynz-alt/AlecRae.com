import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vienna Status — System Status & Uptime",
  description:
    "Real-time status, uptime, and incident history for the Vienna email platform.",
  applicationName: "Vienna Status",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Vienna Status",
    description: "Real-time system status for Vienna.",
    url: "https://status.48co.ai",
    siteName: "Vienna Status",
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
      <body className="h-full bg-slate-950 text-white font-sans">
        {children}
      </body>
    </html>
  );
}
