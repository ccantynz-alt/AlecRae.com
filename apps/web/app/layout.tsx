import type { Metadata } from "next";
import { ThemeProvider, Box } from "@emailed/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Emailed - AI-Native Email Platform",
  description: "The intelligent email platform that works for you. AI-powered inbox management, smart composition, and enterprise-grade deliverability.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box as="html" lang="en" className="h-full antialiased">
      <Box as="body" className="h-full bg-surface text-content font-sans">
        <ThemeProvider mode="light">
          {children}
        </ThemeProvider>
      </Box>
    </Box>
  );
}
