import type { Metadata } from "next";
import { ThemeProvider, Box } from "@emailed/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vieanna — The Email Client That Kills Gmail",
  description: "Email hasn't been reinvented since 2004. Vieanna is the AI-powered email client with on-device intelligence, zero-latency inbox, and the smartest compose ever built.",
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
