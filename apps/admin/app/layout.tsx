import type { Metadata } from "next";
import { Italianno, Inter } from "next/font/google";
import { ThemeProvider, Box } from "@alecrae/ui";
import "./globals.css";

/**
 * Italianno — the signature-style handwritten script for the AlecRae brand mark.
 * Loaded here so the admin app can render the AR monogram and any wordmarks
 * in the same handwriting as the landing page.
 */
const italianno = Italianno({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-italianno",
  display: "swap",
});

/**
 * Inter — humanist sans for body copy and UI chrome.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AlecRae Admin - AI-Powered Email Infrastructure Dashboard",
  description: "Monitor and manage the AlecRae platform. AI-powered insights, reputation management, and real-time operational intelligence.",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      as="html"
      lang="en"
      className={`h-full antialiased dark ${italianno.variable} ${inter.variable}`}
    >
      <Box as="body" className="h-full bg-surface text-content font-sans">
        <ThemeProvider mode="dark">
          {children}
        </ThemeProvider>
      </Box>
    </Box>
  );
}
