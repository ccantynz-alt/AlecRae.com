import type { Metadata } from "next";
import { ThemeProvider, Box } from "@emailed/ui";
import { AdminSidebar } from "../components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Emailed Admin - AI-Powered Email Infrastructure Dashboard",
  description: "Monitor and manage the Emailed platform. AI-powered insights, reputation management, and real-time operational intelligence.",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box as="html" lang="en" className="h-full antialiased dark">
      <Box as="body" className="h-full bg-surface text-content font-sans">
        <ThemeProvider mode="dark">
          <Box className="flex h-full">
            <AdminSidebar />
            <Box as="main" className="flex-1 overflow-y-auto" role="main">
              <Box className="p-8 max-w-[1600px] mx-auto">
                {children}
              </Box>
            </Box>
          </Box>
        </ThemeProvider>
      </Box>
    </Box>
  );
}
