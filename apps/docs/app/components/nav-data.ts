export interface NavItem {
  readonly slug: string;
  readonly label: string;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Getting Started",
    items: [
      { slug: "quickstart", label: "Quickstart" },
      { slug: "authentication", label: "Authentication" },
      { slug: "rate-limits", label: "Rate Limits" },
      { slug: "errors", label: "Errors" },
    ],
  },
  {
    label: "Email",
    items: [
      { slug: "emails", label: "Emails" },
      { slug: "threads", label: "Threads" },
      { slug: "templates", label: "Templates" },
      { slug: "domains", label: "Domains" },
      { slug: "suppressions", label: "Suppressions" },
    ],
  },
  {
    label: "Features",
    items: [
      { slug: "contacts", label: "Contacts" },
      { slug: "calendar", label: "Calendar" },
      { slug: "search", label: "Search" },
      { slug: "ai", label: "AI" },
      { slug: "analytics", label: "Analytics" },
    ],
  },
  {
    label: "Migration Guides",
    items: [
      { slug: "migrate-gmail", label: "From Gmail" },
      { slug: "migrate-outlook", label: "From Outlook" },
      { slug: "migrate-apple-mail", label: "From Apple Mail" },
    ],
  },
  {
    label: "Platform",
    items: [
      { slug: "billing", label: "Billing" },
      { slug: "webhooks", label: "Webhooks" },
      { slug: "api-reference", label: "OpenAPI Spec" },
    ],
  },
];

export function getAllSlugs(): string[] {
  return NAV_GROUPS.flatMap((group) => group.items.map((item) => item.slug));
}
