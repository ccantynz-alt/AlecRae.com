"use client";

import { usePathname } from "next/navigation";
import { Box, Text } from "@emailed/ui";

const legalPages = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/aup", label: "Acceptable Use Policy" },
  { href: "/dpa", label: "Data Processing Agreement" },
  { href: "/sla", label: "Service Level Agreement" },
  { href: "/dmca", label: "DMCA / Copyright Policy" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/subprocessors", label: "Subprocessors" },
] as const;

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <Box className="min-h-full bg-surface">
      <Box
        as="header"
        className="border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-50"
      >
        <Box className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Box as="a" href="/" className="flex items-center gap-2">
            <Text variant="heading-md" className="text-brand-600 font-bold">
              Emailed
            </Text>
          </Box>
          <Text variant="body-sm" className="text-content-secondary">
            Legal
          </Text>
        </Box>
      </Box>

      <Box className="max-w-7xl mx-auto px-6 py-10 flex gap-10">
        <Box
          as="nav"
          className="hidden lg:block w-64 shrink-0"
          aria-label="Legal navigation"
        >
          <Box className="sticky top-24 space-y-1">
            <Text
              variant="caption"
              className="uppercase tracking-wider text-content-tertiary font-semibold mb-3 block px-3"
            >
              Legal Documents
            </Text>
            {legalPages.map((page) => {
              const isActive =
                pathname === page.href ||
                pathname?.startsWith(page.href + "/");
              return (
                <Box
                  key={page.href}
                  as="a"
                  href={page.href}
                  className={[
                    "block px-3 py-2 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : "text-content-secondary hover:text-content hover:bg-surface-hover",
                  ].join(" ")}
                >
                  <Text variant="body-sm" className={isActive ? "font-medium text-brand-700" : ""}>
                    {page.label}
                  </Text>
                </Box>
              );
            })}
          </Box>
        </Box>

        <Box as="main" className="flex-1 min-w-0 max-w-4xl">
          {children}
        </Box>
      </Box>

      <Box
        as="footer"
        className="border-t border-border mt-16 py-8"
      >
        <Box className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Text variant="caption" className="text-content-tertiary">
            &copy; 2026 Emailed, Inc. All rights reserved.
          </Text>
          <Box className="flex gap-6">
            <Box as="a" href="/">
              <Text variant="caption" className="text-content-tertiary hover:text-content transition-colors">
                Home
              </Text>
            </Box>
            <Box as="a" href="/terms">
              <Text variant="caption" className="text-content-tertiary hover:text-content transition-colors">
                Terms
              </Text>
            </Box>
            <Box as="a" href="/privacy">
              <Text variant="caption" className="text-content-tertiary hover:text-content transition-colors">
                Privacy
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
