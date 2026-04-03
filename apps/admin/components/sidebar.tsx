"use client";

import { useState } from "react";
import { Box, Text } from "@emailed/ui";

interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: React.ReactNode;
}

const navItems: readonly NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: <DashboardIcon />,
  },
  {
    label: "Domains",
    href: "/domains",
    icon: <DomainIcon />,
  },
  {
    label: "Reputation",
    href: "/reputation",
    icon: <ReputationIcon />,
  },
  {
    label: "Queue",
    href: "/queue",
    icon: <QueueIcon />,
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: <AnalyticsIcon />,
  },
  {
    label: "Security",
    href: "/security",
    icon: <SecurityIcon />,
  },
  {
    label: "Users",
    href: "/users",
    icon: <UsersIcon />,
  },
] as const;

function DashboardIcon() {
  return (
    <Box as="svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <Box as="rect" x="3" y="3" width="7" height="7" rx="1" />
      <Box as="rect" x="14" y="3" width="7" height="7" rx="1" />
      <Box as="rect" x="3" y="14" width="7" height="7" rx="1" />
      <Box as="rect" x="14" y="14" width="7" height="7" rx="1" />
    </Box>
  );
}

function DomainIcon() {
  return (
    <Box as="svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <Box as="circle" cx="12" cy="12" r="10" />
      <Box as="path" d="M2 12h20" />
      <Box as="path" d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Box>
  );
}

function ReputationIcon() {
  return (
    <Box as="svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <Box as="path" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Box>
  );
}

function QueueIcon() {
  return (
    <Box as="svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <Box as="path" d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Box>
  );
}

function AnalyticsIcon() {
  return (
    <Box as="svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <Box as="path" d="M18 20V10" />
      <Box as="path" d="M12 20V4" />
      <Box as="path" d="M6 20v-6" />
    </Box>
  );
}

function SecurityIcon() {
  return (
    <Box as="svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <Box as="path" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Box>
  );
}

function UsersIcon() {
  return (
    <Box as="svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <Box as="path" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <Box as="circle" cx="9" cy="7" r="4" />
      <Box as="path" d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <Box as="path" d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Box>
  );
}

function CollapseIcon({ collapsed }: { readonly collapsed: boolean }) {
  return (
    <Box as="svg" className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <Box as="path" d="M11 17l-5-5 5-5" />
      <Box as="path" d="M18 17l-5-5 5-5" />
    </Box>
  );
}

export function AdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [activePath, setActivePath] = useState("/");

  return (
    <Box
      as="aside"
      className={`flex flex-col bg-surface border-r border-border h-screen sticky top-0 transition-all duration-200 ${collapsed ? "w-16" : "w-64"}`}
      role="navigation"
      aria-label="Admin navigation"
    >
      <Box className={`flex items-center border-b border-border h-16 ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
        {!collapsed && (
          <Box className="flex items-center gap-2">
            <Box className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Text as="span" variant="body-sm" className="text-white font-bold">E</Text>
            </Box>
            <Text variant="heading-sm" className="text-content font-semibold">Admin</Text>
          </Box>
        )}
        {collapsed && (
          <Box className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Text as="span" variant="body-sm" className="text-white font-bold">E</Text>
          </Box>
        )}
      </Box>

      <Box as="nav" className="flex-1 py-4 overflow-y-auto">
        <Box className="flex flex-col gap-1 px-2">
          {navItems.map((item) => {
            const isActive = activePath === item.href;
            return (
              <Box
                key={item.href}
                as="a"
                href={item.href}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  setActivePath(item.href);
                  window.location.href = item.href;
                }}
                className={`
                  flex items-center gap-3 rounded-lg transition-colors
                  ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"}
                  ${isActive
                    ? "bg-brand-600/10 text-brand-400"
                    : "text-content-secondary hover:bg-surface-secondary hover:text-content"
                  }
                `}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.label : undefined}
              >
                <Box className="flex-shrink-0">{item.icon}</Box>
                {!collapsed && (
                  <Text as="span" variant="body-sm" className="font-medium">
                    {item.label}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box className={`border-t border-border py-3 ${collapsed ? "px-2" : "px-2"}`}>
        <Box
          as="button"
          onClick={() => setCollapsed(!collapsed)}
          className={`
            flex items-center gap-3 rounded-lg px-3 py-2.5 w-full text-content-secondary
            hover:bg-surface-secondary hover:text-content transition-colors
            ${collapsed ? "justify-center" : ""}
          `}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <CollapseIcon collapsed={collapsed} />
          {!collapsed && (
            <Text as="span" variant="body-sm" className="font-medium">Collapse</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

AdminSidebar.displayName = "AdminSidebar";
