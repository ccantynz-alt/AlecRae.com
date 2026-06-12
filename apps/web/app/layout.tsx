import type { Metadata, Viewport } from "next";
import { Italianno, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ConsentBanner } from "../components/ConsentBanner";

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
 * Playfair Display — editorial serif for display headlines on the marketing site.
 * Variable weight. Italianno signs the name; Playfair sets the headlines; Inter reads.
 */
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
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
    "The inbox you'd sign your name to. One subscription. All your accounts. Every detail considered.",
  applicationName: "AlecRae",
  authors: [{ name: "AlecRae" }],
  keywords: [
    "email client",
    "Gmail alternative",
    "Outlook alternative",
    "AI email",
    "sophisticated email",
    "AlecRae",
  ],
  openGraph: {
    title: "AlecRae — Email, Evolved.",
    description: "The inbox you'd sign your name to.",
    url: "https://alecrae.com",
    siteName: "AlecRae",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AlecRae — Email, Evolved.",
    description: "The inbox you'd sign your name to.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f4ef",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${italianno.variable} ${inter.variable} ${playfair.variable}`}
    >
      <body className="h-full bg-[#f5f4ef] text-neutral-900 font-sans">
        {children}
        <ConsentBanner />
      </body>
    </html>
  );
}
