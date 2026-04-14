"use client";

import { useEffect, useState } from "react";
import { Box } from "@alecrae/ui";
import { AdminSidebar } from "./sidebar";
import { ssoClient } from "../lib/sso";

interface AuthShellProps {
  readonly children: React.ReactNode;
}

/**
 * Wraps authenticated admin pages with the sidebar and auth check.
 * Redirects to /login if no valid session exists.
 */
export function AuthShell({ children }: AuthShellProps): React.ReactElement {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const session = ssoClient.isAuthenticated();
    if (session) {
      setAuthenticated(true);
      setChecking(false);
      return;
    }

    // Also check for legacy API key auth
    if (typeof window !== "undefined") {
      const apiKey =
        localStorage.getItem("alecrae_admin_key") ??
        localStorage.getItem("alecrae_api_key");
      if (apiKey) {
        setAuthenticated(true);
        setChecking(false);
        return;
      }
    }

    // Not authenticated — redirect to login
    setChecking(false);
    window.location.href = "/login";
  }, []);

  if (checking) {
    return (
      <Box className="flex h-full items-center justify-center">
        <Box className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </Box>
    );
  }

  if (!authenticated) {
    return (
      <Box className="flex h-full items-center justify-center">
        <Box className="text-content-secondary">Redirecting to login...</Box>
      </Box>
    );
  }

  return (
    <Box className="flex h-full">
      <AdminSidebar />
      <Box as="main" className="flex-1 overflow-y-auto" role="main">
        <Box className="p-8 max-w-[1600px] mx-auto">{children}</Box>
      </Box>
    </Box>
  );
}

AuthShell.displayName = "AuthShell";
