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
      { id: "templates", label: "Templates", href: "/templates" },
      { id: "webhooks", label: "Webhooks", href: "/webhooks" },
      { id: "api-keys", label: "API Keys", href: "/api-keys" },
      { id: "suppressions", label: "Suppressions", href: "/suppressions" },
      { id: "bounces", label: "Bounces", href: "/bounces" },
      { id: "analytics", label: "Analytics", href: "/analytics" },
      { id: "billing", label: "Billing", href: "/billing" },
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
  const [mobileOpen, setMobileOpen] = useState(false);
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

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
        Emailed
      </Text>
      <Box
        as="button"
        className="text-content-tertiary hover:text-content transition-colors hidden md:block"
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
      <Box className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
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
      {/* Mobile header bar */}
      <Box className="fixed top-0 inset-x-0 z-40 flex items-center justify-between h-14 px-4 bg-surface border-b border-border md:hidden">
        <Box
          as="button"
          className="p-2 -ml-2 text-content-secondary hover:text-content transition-colors"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </Box>
        <Text variant="heading-sm" className="text-brand-600 font-bold">
          Emailed
        </Text>
        <Box className="w-8" />
      </Box>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <Box
          className="fixed inset-0 z-50 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <Box
            className="absolute left-0 top-0 bottom-0 w-72 bg-surface"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Sidebar
              brand={brand}
              sections={sectionsWithActive}
              footer={footer}
              collapsed={false}
            />
          </Box>
        </Box>
      )}

      {/* Desktop sidebar */}
      <Box className="hidden md:block">
        <Sidebar
          brand={brand}
          sections={sectionsWithActive}
          footer={footer}
          collapsed={collapsed}
        />
      </Box>

      <Box as="main" className="flex-1 flex flex-col min-h-0 overflow-hidden pt-14 md:pt-0">
        {children}
      </Box>
    </Box>
  );
}
