import type { Metadata } from "next";
import { ThemeProvider, Box } from "@alecrae/ui";
import "./globals.css";

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
    <Box as="html" lang="en" className="h-full antialiased dark">
      <Box as="body" className="h-full bg-surface text-content font-sans">
        <ThemeProvider mode="dark">
          {children}
        </ThemeProvider>
      </Box>
    </Box>
  );
}
