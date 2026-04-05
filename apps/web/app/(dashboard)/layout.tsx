"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Box, Text, Sidebar, type SidebarSection } from "@emailed/ui";
import { authApi } from "../../lib/api";

const navigationSections: SidebarSection[] = [
  {
    items: [
      { id: "inbox", label: "Inbox", href: "/inbox" },
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

interface UserInfo {
  name: string;
  email: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<UserInfo>({ name: "User", email: "" });

  useEffect(() => {
    authApi
      .me()
      .then((res) => {
        setUser({ name: res.data.name, email: res.data.email });
      })
      .catch(() => {
        // Fallback to stored token info or defaults
      });
  }, []);

  const sectionsWithActive: SidebarSection[] = navigationSections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      active: pathname === item.href || pathname?.startsWith(item.href + "/"),
    })),
  }));

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  const brand = (
    <Box className="flex items-center justify-between">
      <Text variant="heading-md" className="text-brand-600 font-bold">
        Vienna
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

  const handleLogout = () => {
    authApi.logout();
    window.location.href = "/login";
  };

  const footer = (
    <Box className="flex items-center gap-3">
      <Box className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
        <Text variant="caption" className="text-brand-700 font-semibold">
          {initials}
        </Text>
      </Box>
      {!collapsed && (
        <>
          <Box className="flex-1 min-w-0">
            <Text variant="body-sm" className="truncate font-medium">
              {user.name}
            </Text>
            <Text variant="caption" className="truncate">
              {user.email}
            </Text>
          </Box>
          <Box
            as="button"
            className="text-content-tertiary hover:text-content transition-colors p-1"
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
          >
            <Text as="span" variant="caption">
              Sign out
            </Text>
          </Box>
        </>
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
