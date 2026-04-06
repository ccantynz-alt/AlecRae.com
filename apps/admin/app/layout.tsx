import type { Metadata } from "next";
import { ThemeProvider, Box, Sidebar, Text, type SidebarSection } from "@emailed/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Emailed Admin - Platform Management",
  description: "AI-powered administration dashboard for the Emailed platform.",
};

const adminNavSections: SidebarSection[] = [
  {
    title: "Overview",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/",
        active: false,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        id: "reputation",
        label: "Reputation",
        href: "/reputation",
      },
      {
        id: "support",
        label: "AI Support",
        href: "/support",
      },
      {
        id: "users",
        label: "Users",
        href: "/users",
      },
    ],
  },
  {
    title: "Intelligence",
    items: [
      {
        id: "analytics",
        label: "Analytics",
        href: "/analytics",
      },
      {
        id: "system",
        label: "System Health",
        href: "/system",
      },
    ],
  },
];

function AdminBrand() {
  return (
    <Box className="flex items-center gap-2">
      <Box className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
        <Text as="span" variant="body-sm" className="text-content-inverse font-bold">
          E
        </Text>
      </Box>
      <Box>
        <Text variant="heading-sm" className="leading-none">
          Emailed
        </Text>
        <Text variant="caption" muted>
          Admin Console
        </Text>
      </Box>
    </Box>
  );
}

function AdminFooter() {
  return (
    <Box className="flex flex-col gap-1">
      <Text variant="caption" muted>
        Platform v0.1.0
      </Text>
      <Text variant="caption" muted>
        AI Engine: Operational
      </Text>
    </Box>
  );
}

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box as="html" lang="en" className="h-full antialiased">
      <Box as="body" className="h-full bg-surface-secondary text-content font-sans">
        <ThemeProvider mode="light">
          <Box className="flex h-full">
            <Sidebar
              brand={<AdminBrand />}
              sections={adminNavSections}
              footer={<AdminFooter />}
            />
            <Box className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <AdminTopBar />
              <Box className="flex-1 overflow-auto">
                {children}
              </Box>
            </Box>
          </Box>
        </ThemeProvider>
      </Box>
    </Box>
  );
}

function AdminTopBar() {
  return (
    <Box className="flex items-center justify-between px-6 py-3 bg-surface border-b border-border">
      <Box className="flex items-center gap-4">
        <Text variant="body-sm" muted>
          Environment:
        </Text>
        <Box className="flex items-center gap-1.5">
          <Box className="w-2 h-2 rounded-full bg-status-success" />
          <Text variant="body-sm" className="font-medium text-status-success">
            Production
          </Text>
        </Box>
      </Box>
      <Box className="flex items-center gap-4">
        <Box className="flex items-center gap-1.5">
          <Box className="w-2 h-2 rounded-full bg-status-success" />
          <Text variant="caption" muted>
            All systems operational
          </Text>
        </Box>
        <Box className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
          <Text as="span" variant="caption" className="font-semibold text-brand-700">
            A
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
