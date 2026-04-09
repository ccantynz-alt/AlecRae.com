import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "48co — Email, finally.",
  description:
    "The fastest, smartest, most beautiful email client ever made. One subscription. All your accounts. AI in every layer.",
  applicationName: "48co",
  authors: [{ name: "48co" }],
  keywords: [
    "email client",
    "Gmail alternative",
    "Outlook alternative",
    "AI email",
    "email app",
    "48co",
  ],
  openGraph: {
    title: "48co — Email, finally.",
    description:
      "The fastest, smartest, most beautiful email client ever made.",
    url: "https://48co.ai",
    siteName: "48co",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "48co — Email, finally.",
    description:
      "The fastest, smartest, most beautiful email client ever made.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e3a8a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full bg-slate-950 text-white font-sans">
        {children}
      </body>
    </html>
  );
}
