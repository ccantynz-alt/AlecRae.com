import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vienna — Email, finally.",
  description:
    "The fastest, smartest, most beautiful email client ever made. One subscription. All your accounts. AI in every layer.",
  applicationName: "Vienna",
  authors: [{ name: "Vienna" }],
  keywords: [
    "email client",
    "Gmail alternative",
    "Outlook alternative",
    "AI email",
    "email app",
    "Vienna",
  ],
  openGraph: {
    title: "Vienna — Email, finally.",
    description:
      "The fastest, smartest, most beautiful email client ever made.",
    url: "https://48co.ai",
    siteName: "Vienna",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vienna — Email, finally.",
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
