/**
 * Public Roadmap — single source of truth for /roadmap page.
 *
 * This is intentionally a plain TypeScript data file so it's:
 *   1. Type-checked at build time (no schema drift)
 *   2. Committed to the repo (no SaaS dependency, no credentials)
 *   3. Trivial to update (edit this file, commit, deploy)
 *
 * Mirrors the Tier 1-4 + Tier S/A/B/C backlog in CLAUDE.md.
 */

export type RoadmapStatus = "shipped" | "in_progress" | "planned";

export type RoadmapTier = "core" | "S" | "A" | "B" | "C";

export interface RoadmapItem {
  /** Stable identifier used for deep-linking and tracking. */
  id: string;
  /** Short display title. */
  title: string;
  /** One-sentence explanation of the value to the user. */
  description: string;
  /** Build status. */
  status: RoadmapStatus;
  /** Which roadmap tier this belongs to. */
  tier: RoadmapTier;
  /** Optional — month/year the item shipped (only for "shipped" items). */
  shippedAt?: string;
}

export interface RoadmapTierGroup {
  tier: RoadmapTier;
  label: string;
  description: string;
  items: RoadmapItem[];
}

const CORE_ITEMS: RoadmapItem[] = [
  { id: "imap-jmap-sync", title: "IMAP/JMAP sync engine", description: "Native support for IMAP and JMAP with background sync, delta updates, and offline cache.", status: "shipped", tier: "core", shippedAt: "2026-02" },
  { id: "gmail-oauth", title: "Gmail OAuth + API sync", description: "Connect any Gmail account with OAuth. Full message, label, and thread sync.", status: "shipped", tier: "core", shippedAt: "2026-02" },
  { id: "outlook-graph", title: "Outlook Graph API sync", description: "Connect any Outlook / Microsoft 365 account with OAuth via Graph API.", status: "shipped", tier: "core", shippedAt: "2026-02" },
  { id: "inbox-ui", title: "Inbox + thread view", description: "Three-pane inbox with threaded conversations, keyboard navigation, and sub-100ms response.", status: "shipped", tier: "core", shippedAt: "2026-02" },
  { id: "rich-compose", title: "Rich compose editor", description: "Tiptap-based rich text editor with inline images, links, attachments, and markdown shortcuts.", status: "shipped", tier: "core", shippedAt: "2026-02" },
  { id: "ai-compose", title: "AI compose", description: "Claude-powered draft generation from a short prompt. Adapts to your voice profile.", status: "shipped", tier: "core", shippedAt: "2026-02" },
  { id: "ai-triage", title: "AI triage + priority inbox", description: "Automatic priority ranking, category tagging, and smart inbox filtering.", status: "shipped", tier: "core", shippedAt: "2026-02" },
  { id: "indexeddb-cache", title: "Local IndexedDB cache", description: "Full local-first cache for offline access and sub-50ms inbox reads.", status: "shipped", tier: "core", shippedAt: "2026-02" },
  { id: "cmd-k", title: "Keyboard shortcuts + Cmd-K palette", description: "Every action keyboard-accessible. Cmd-K command palette for instant navigation.", status: "shipped", tier: "core", shippedAt: "2026-02" },
  { id: "search", title: "Search (Meilisearch + local)", description: "Sub-50ms full-text search with typo tolerance. Local index + server fallback.", status: "shipped", tier: "core", shippedAt: "2026-02" },
  { id: "ai-reply", title: "AI reply suggestions", description: "Three context-aware reply drafts generated from the incoming thread.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "ai-summary", title: "AI thread summary", description: "One-click summary of long threads. Surfaces decisions, action items, and open questions.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "snooze", title: "Snooze + schedule send", description: "Snooze emails until a specific time or event. Schedule outbound email for later delivery.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "undo-send", title: "Undo send", description: "Cancel an outbound email within a 10-30s window before it leaves your outbox.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "multi-account", title: "Multi-account", description: "Unlimited connected accounts across Gmail, Outlook, iCloud, Yahoo, IMAP. One unified inbox.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "themes", title: "Dark mode + themes", description: "Light/dark/system mode, 7 accent colors, 3 density options. Full theming API.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "billing", title: "Stripe billing", description: "Integrated billing with plan management, usage tracking, and invoices.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "passkeys", title: "Passkey auth (WebAuthn)", description: "Passwordless login via platform authenticators. Phishing-resistant by default.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "import", title: "Import & migration", description: "One-click import from Gmail, Outlook, MBOX, and EML. Full thread and label preservation.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "nl-search", title: "AI natural language search", description: "Search your inbox in plain English. &quot;Emails from Sarah about the Q4 budget.&quot;", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "calendar", title: "Calendar integration", description: "Two-way calendar sync. Inline meeting cards in email threads.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "contacts", title: "Contact management", description: "Automatic contact building from email history with enrichment and custom fields.", status: "shipped", tier: "core", shippedAt: "2026-03" },
  { id: "e2ee", title: "End-to-end encryption", description: "RSA-OAEP-4096 + AES-256-GCM. Keys never leave your device.", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "analytics", title: "Email analytics", description: "Open rates, click tracking, response times, and send-time intelligence — private to your account.", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "rules", title: "AI-powered rules & filters", description: "Natural-language filter creation. &quot;Every Stripe receipt into Finance folder.&quot;", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "followup", title: "AI follow-up reminders", description: "Detects promises you made and reminds you before they&apos;re overdue.", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "voice-profile", title: "Voice profile", description: "Learns your personal writing style so AI drafts sound like you, not a robot.", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "unsubscribe", title: "AI unsubscribe", description: "One-click unsubscribe from any list. AI navigates the unsubscribe flow automatically.", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "grammar", title: "Grammar agent", description: "Free, built-in grammar checking. Replaces Grammarly ($30/mo).", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "mta", title: "Own email hosting (full MTA)", description: "Custom-built mail transfer agent for outbound and inbound. No reliance on Postfix or SES.", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "desktop", title: "Desktop app (macOS/Windows/Linux)", description: "Native Electron app with system menus, tray icon, deep linking, and notifications.", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "mobile", title: "Mobile apps (iOS/Android)", description: "React Native apps with full feature parity, biometric unlock, and push notifications.", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "api", title: "Public API + webhooks", description: "REST + tRPC API with webhooks for every email event. Fully documented OpenAPI spec.", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "shared-inbox", title: "Team shared inboxes", description: "Assign emails to teammates, leave internal comments, and track resolution.", status: "shipped", tier: "core", shippedAt: "2026-04" },
  { id: "saml-sso", title: "Admin SAML SSO", description: "SAML 2.0 SP with SP metadata, ACS, SLO, and JIT provisioning. Enterprise-ready.", status: "shipped", tier: "core", shippedAt: "2026-04" },
];

const TIER_S_ITEMS: RoadmapItem[] = [
  { id: "S1-webgpu-ai", title: "WebGPU client-side AI", description: "Llama 3.1 8B running in the browser at 41 tok/sec. $0/token. Industry first.", status: "shipped", tier: "S", shippedAt: "2026-04" },
  { id: "S2-crdt-collab", title: "Real-time collaborative drafting", description: "Two people editing the same email with live cursors via Yjs CRDTs. Industry first for email.", status: "shipped", tier: "S", shippedAt: "2026-04" },
  { id: "S3-inbox-agent", title: "AI inbox agent (works while you sleep)", description: "Wakes up overnight, triages, drafts replies. You approve in the morning with one tap.", status: "shipped", tier: "S", shippedAt: "2026-04" },
  { id: "S4-voice-clone", title: "Voice cloning for AI replies", description: "Drafts that sound exactly like you. Per-profile style transfer beyond voice profile.", status: "shipped", tier: "S", shippedAt: "2026-04" },
  { id: "S5-semantic-search", title: "Semantic vector search", description: "Find emails by meaning, not keywords. &quot;Someone said we should consider the budget.&quot;", status: "shipped", tier: "S", shippedAt: "2026-04" },
  { id: "S6-newsletter-summary", title: "Newsletter auto-summary", description: "Every newsletter reduced to 3 bullets in inbox preview. Full text on demand.", status: "shipped", tier: "S", shippedAt: "2026-04" },
  { id: "S7-why-inbox", title: "Why is this in my inbox?", description: "Click any email → AI explains who, history, why it landed here, suggested action.", status: "shipped", tier: "S", shippedAt: "2026-04" },
  { id: "S8-task-sync", title: "Thread → action items (Todoist/Linear/Notion)", description: "Native integration with Things, Todoist, Linear, Notion. AI thread extraction.", status: "shipped", tier: "S", shippedAt: "2026-04" },
  { id: "S9-meeting-link", title: "Email thread → meeting transcript link", description: "If a thread leads to a call, auto-link the recording and transcript.", status: "shipped", tier: "S", shippedAt: "2026-04" },
  { id: "S10-send-time", title: "Predictive send-time optimization", description: "AI predicts the best send time based on recipient open patterns.", status: "shipped", tier: "S", shippedAt: "2026-04" },
];

const TIER_A_ITEMS: RoadmapItem[] = [
  { id: "A1-animations", title: "Magic UI animations", description: "Linear-style spring physics animations on every interaction.", status: "shipped", tier: "A", shippedAt: "2026-04" },
  { id: "A2-spatial-inbox", title: "3D spatial inbox", description: "Optional R3F-powered 3D view for power users. Configurable axes and clustering.", status: "shipped", tier: "A", shippedAt: "2026-04" },
  { id: "A3-heatmap", title: "Inbox heatmap", description: "GitHub-style contribution map showing when you&apos;re most productive.", status: "shipped", tier: "A", shippedAt: "2026-04" },
  { id: "A4-focus-mode", title: "Focus mode", description: "Hide everything except important emails. Full screen with Pomodoro timer.", status: "shipped", tier: "A", shippedAt: "2026-04" },
  { id: "A5-gestures", title: "Quick-reply gestures (mobile)", description: "Five-action swipe: reply, snooze, archive, flag, delete.", status: "shipped", tier: "A", shippedAt: "2026-04" },
  { id: "A6-drag-snooze", title: "Drag-to-snooze mini calendar", description: "Drag an email to a time slot to snooze. HTML5 DnD + touch long-press.", status: "shipped", tier: "A", shippedAt: "2026-04" },
  { id: "A7-gamification", title: "Inbox zero gamification", description: "Streaks, achievements, daily stats. Respects prefers-reduced-motion.", status: "shipped", tier: "A", shippedAt: "2026-04" },
];

const TIER_B_ITEMS: RoadmapItem[] = [
  { id: "B1-scripts", title: "Programmable email (TypeScript snippets)", description: "Apps Script, but type-safe. Runs on every email in a sandboxed runtime.", status: "shipped", tier: "B", shippedAt: "2026-04" },
  { id: "B2-sql-inbox", title: "SQL over inbox", description: "Treat your inbox as a queryable dataset. Natural language + SQL-like console.", status: "shipped", tier: "B", shippedAt: "2026-04" },
  { id: "B3-unsub-agent", title: "AI unsubscribe agent", description: "One click → AI navigates the unsubscribe page and confirms.", status: "shipped", tier: "B", shippedAt: "2026-04" },
  { id: "B4-translation", title: "Auto-translation badges", description: "35+ languages. &quot;Translated from Spanish&quot; badge with toggle to original.", status: "shipped", tier: "B", shippedAt: "2026-04" },
  { id: "B5-sender-verify", title: "Real-time sender verification", description: "SPF/DKIM/DMARC checks, domain age, typosquatting detection, trust badges.", status: "shipped", tier: "B", shippedAt: "2026-04" },
  { id: "B6-phishing", title: "Phishing protection with explainer", description: "&quot;This email is suspicious because…&quot; multi-signal AI explainer.", status: "shipped", tier: "B", shippedAt: "2026-04" },
  { id: "B7-calendar-slots", title: "AI calendar slot suggestions in compose", description: "Type &quot;let&apos;s meet next week&quot; → AI suggests slots inline.", status: "shipped", tier: "B", shippedAt: "2026-04" },
  { id: "B8-voice-replies", title: "Voice-to-voice replies", description: "Record a voice message as an attachment. Auto-transcribed for the recipient.", status: "shipped", tier: "B", shippedAt: "2026-04" },
];

const TIER_C_ITEMS: RoadmapItem[] = [
  { id: "C1-status", title: "Status page", description: "Public uptime and incident history at status.alecrae.com.", status: "shipped", tier: "C", shippedAt: "2026-04" },
  { id: "C2-api-docs", title: "Public API docs", description: "22-page developer documentation with endpoint reference and code examples.", status: "shipped", tier: "C", shippedAt: "2026-04" },
  { id: "C3-saml", title: "Admin console SSO (SAML)", description: "SAML 2.0 SP for enterprise auth providers.", status: "shipped", tier: "C", shippedAt: "2026-04" },
  { id: "C4-soc2", title: "SOC 2 Type I → Type II", description: "Third-party audit certifying our security controls. Required for enterprise.", status: "planned", tier: "C" },
  { id: "C5-dpa", title: "GDPR DPA template", description: "Signed Data Processing Agreement workflow for enterprise customers.", status: "planned", tier: "C" },
  { id: "C6-bounty", title: "Bug bounty program", description: "Responsible disclosure via security.txt and /security. HackerOne program to follow.", status: "in_progress", tier: "C" },
  { id: "C7-roadmap", title: "Public roadmap", description: "This page. Live view of what&apos;s shipped, in progress, and planned.", status: "shipped", tier: "C", shippedAt: "2026-04" },
  { id: "C8-changelog", title: "Changelog page", description: "Public changelog at changelog.alecrae.com with release notes and breaking changes.", status: "shipped", tier: "C", shippedAt: "2026-04" },
  { id: "C9-migration-guides", title: "Migration guides", description: "Step-by-step guides: &quot;From Gmail to alecrae.com in 5 minutes.&quot;", status: "shipped", tier: "C", shippedAt: "2026-04" },
  { id: "C10-spellcheck", title: "Multi-language spell check", description: "Native browser spell-check integration with user-editable custom dictionary.", status: "shipped", tier: "C", shippedAt: "2026-04" },
];

export const ROADMAP: readonly RoadmapTierGroup[] = [
  {
    tier: "core",
    label: "Core product",
    description:
      "The tiers 1-4 foundation: everything a modern email client needs, built from scratch and shipped.",
    items: CORE_ITEMS,
  },
  {
    tier: "S",
    label: "Industry firsts",
    description:
      "Features no other email client has ever shipped. These are the reasons to switch.",
    items: TIER_S_ITEMS,
  },
  {
    tier: "A",
    label: "Cutting-edge UX",
    description:
      "Delightful interactions that make the email client feel alive.",
    items: TIER_A_ITEMS,
  },
  {
    tier: "B",
    label: "Power features",
    description:
      "Features power users dream about. Programmable email, SQL over inbox, voice replies.",
    items: TIER_B_ITEMS,
  },
  {
    tier: "C",
    label: "Polish & trust",
    description:
      "Everything that turns a great product into an enterprise-ready one.",
    items: TIER_C_ITEMS,
  },
] as const;

export interface RoadmapStats {
  total: number;
  shipped: number;
  inProgress: number;
  planned: number;
  percentShipped: number;
}

export function computeStats(): RoadmapStats {
  const allItems = ROADMAP.flatMap((tier) => tier.items);
  const total = allItems.length;
  const shipped = allItems.filter((i) => i.status === "shipped").length;
  const inProgress = allItems.filter((i) => i.status === "in_progress").length;
  const planned = allItems.filter((i) => i.status === "planned").length;
  const percentShipped = total > 0 ? Math.round((shipped / total) * 100) : 0;
  return { total, shipped, inProgress, planned, percentShipped };
}
