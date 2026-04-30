import type { Metadata, Viewport } from "next";
import { Italianno, Inter } from "next/font/google";
import "./globals.css";

/**
 * Italianno — the signature-style handwritten script used for the AlecRae wordmark.
 * One weight (400). Calligraphic, elegant, confident.
 */
const italianno = Italianno({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-italianno",
  display: "swap",
});

/**
 * Inter — clean humanist sans for body copy, tagline, and UI.
 * Pairs with Italianno: the handwriting does the branding, Inter does the reading.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AlecRae — Email, Evolved.",
  description:
    "The email client that replaces Gmail, Grammarly, and 5 other subscriptions. AI-powered. Lightning fast. $9/month.",
  applicationName: "AlecRae",
  authors: [{ name: "AlecRae" }],
  keywords: [
    "email client",
    "Gmail alternative",
    "Outlook alternative",
    "AI email",
    "best email app",
    "AlecRae",
    "email AI",
    "smart inbox",
  ],
  openGraph: {
    title: "AlecRae — Email, Evolved.",
    description: "AI-powered email that replaces your entire stack. One app. $9/month.",
    url: "https://alecrae.com",
    siteName: "AlecRae",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AlecRae — Email, Evolved.",
    description: "AI-powered email that replaces your entire stack. One app. $9/month.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0f",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${italianno.variable} ${inter.variable}`}
    >
      <body className="h-full bg-[#0a0a0f] text-white font-sans">
        {children}
      </body>
    </html>
  );
}
