"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Box, Text, Sidebar, type SidebarNavItem, type SidebarSection } from "@emailed/ui";

const navigationSections: SidebarSection[] = [
  {
    items: [
      { id: "inbox", label: "Inbox", href: "/inbox", badge: 12 },
      { id: "compose", label: "Compose", href: "/compose" },
    ],
  },
  {
    title: "Manage",
    items: [
      { id: "domains", label: "Domains", href: "/domains" },
      { id: "analytics", label: "Analytics", href: "/analytics" },
      { id: "settings", label: "Settings", href: "/settings" },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const sectionsWithActive: SidebarSection[] = navigationSections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      active: pathname === item.href || pathname?.startsWith(item.href + "/"),
    })),
  }));

  const brand = (
    <Box className="flex items-center justify-between">
      <Text variant="heading-md" className="text-brand-600 font-bold">
        Vieanna
      </Text>
      <Box
        as="button"
        className="text-content-tertiary hover:text-content transition-colors"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <Text as="span" variant="body-sm">
          {collapsed ? "\u276F" : "\u276E"}
        </Text>
      </Box>
    </Box>
  );

  const footer = (
    <Box className="flex items-center gap-3">
      <Box className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
        <Text variant="caption" className="text-brand-700 font-semibold">
          U
        </Text>
      </Box>
      {!collapsed && (
        <Box className="flex-1 min-w-0">
          <Text variant="body-sm" className="truncate font-medium">
            User
          </Text>
          <Text variant="caption" className="truncate">
            user@emailed.dev
          </Text>
        </Box>
      )}
    </Box>
  );

  return (
    <Box className="flex h-full">
      <Sidebar
        brand={brand}
        sections={sectionsWithActive}
        footer={footer}
        collapsed={collapsed}
      />
      <Box as="main" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </Box>
    </Box>
  );
}
