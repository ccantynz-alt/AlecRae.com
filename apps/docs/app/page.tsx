import Link from "next/link";
import { CodeBlock } from "./components/code-block";

interface Card {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
}

interface CardGroup {
  readonly label: string;
  readonly cards: readonly Card[];
}

const CARD_GROUPS: readonly CardGroup[] = [
  {
    label: "Getting Started",
    cards: [
      { slug: "quickstart", title: "Quickstart", description: "Send your first email in under five minutes.", icon: "rocket" },
      { slug: "authentication", title: "Authentication", description: "API keys, OAuth 2.0, JWT bearer tokens, and scopes.", icon: "key" },
      { slug: "rate-limits", title: "Rate Limits", description: "Request quotas, retry strategies, and idempotency.", icon: "gauge" },
      { slug: "errors", title: "Errors", description: "Status codes, error shapes, and retry guidance.", icon: "alert" },
    ],
  },
  {
    label: "Endpoint Reference",
    cards: [
      { slug: "emails", title: "Emails", description: "Send, list, search, and manage email messages.", icon: "mail" },
      { slug: "threads", title: "Threads", description: "Thread-level operations and conversation view.", icon: "thread" },
      { slug: "contacts", title: "Contacts", description: "Contact management and address book.", icon: "contacts" },
      { slug: "calendar", title: "Calendar", description: "Calendar events and scheduling.", icon: "calendar" },
      { slug: "search", title: "Search", description: "Full-text and AI-powered semantic search.", icon: "search" },
      { slug: "ai", title: "AI", description: "Voice profile, compose assist, grammar, and translation.", icon: "ai" },
      { slug: "billing", title: "Billing", description: "Plans, checkout, portal, and usage tracking.", icon: "billing" },
      { slug: "webhooks", title: "Webhooks", description: "Webhook registration and event reference.", icon: "webhook" },
    ],
  },
  {
    label: "Migration Guides",
    cards: [
      { slug: "migrate-gmail", title: "From Gmail", description: "Switch from Gmail to AlecRae in 5 minutes — import labels, contacts, and all.", icon: "migrate" },
      { slug: "migrate-outlook", title: "From Outlook", description: "Migrate from Outlook / Microsoft 365 with full history and calendar.", icon: "migrate" },
      { slug: "migrate-apple-mail", title: "From Apple Mail", description: "Export MBOX from Apple Mail and import into AlecRae seamlessly.", icon: "migrate" },
    ],
  },
  {
    label: "More Resources",
    cards: [
      { slug: "domains", title: "Domains", description: "Domain verification, SPF, DKIM, DMARC.", icon: "globe" },
      { slug: "templates", title: "Templates", description: "Email template CRUD and variable rendering.", icon: "template" },
      { slug: "analytics", title: "Analytics", description: "Delivery and engagement metrics.", icon: "chart" },
      { slug: "suppressions", title: "Suppressions", description: "Manage bounce and complaint lists.", icon: "shield" },
    ],
  },
];

const QUICK_EXAMPLE = `curl https://api.alecrae.com/v1/messages \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "you@yourdomain.com",
    "to": ["customer@example.com"],
    "subject": "Welcome to AlecRae",
    "text": "Hello from the AlecRae API."
  }'`;

export default function DocsLanding(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-5xl mx-auto">
      <header className="mb-16">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </span>
          <span className="text-xs font-medium text-blue-100 tracking-wide uppercase">v0.1 Beta</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tighter bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent mb-4">
          AlecRae API
        </h1>
        <p className="text-xl text-blue-100/70 max-w-2xl leading-relaxed font-light">
          Send transactional and bulk email through the same infrastructure that powers AlecRae.
          Type-safe, edge-deployed, and built for developers who hate mailing-list plumbing.
        </p>
        <div className="flex gap-3 mt-6">
          <Link
            href="/quickstart"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium hover:from-blue-400 hover:to-cyan-400 transition-all"
          >
            Get Started
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link
            href="/api-reference"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm font-medium hover:bg-white/15 transition-all"
          >
            OpenAPI Spec
          </Link>
        </div>
      </header>

      <section className="mb-16">
        <CodeBlock
          code={QUICK_EXAMPLE}
          language="bash"
          title="Send an email"
        />
      </section>

      {CARD_GROUPS.map((group) => (
        <section key={group.label} className="mb-12">
          <h2 className="text-xs font-semibold text-blue-200/40 uppercase tracking-wider mb-4 px-1">
            {group.label}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.cards.map((card) => (
              <Link
                key={card.slug}
                href={`/${card.slug}`}
                className="group rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-5 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <div className="text-base font-semibold text-white mb-1 group-hover:text-cyan-200 transition-colors">
                  {card.title}
                </div>
                <div className="text-sm text-blue-100/50">{card.description}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 md:p-8">
        <h2 className="text-lg font-semibold text-white mb-2">Base URL</h2>
        <p className="text-sm text-blue-100/60 mb-4">All API requests use the following base URL.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 rounded-lg bg-slate-900/80 border border-white/10 px-4 py-3">
            <div className="text-xs text-blue-200/40 mb-1">Production</div>
            <code className="text-sm text-cyan-300 font-mono">https://api.alecrae.com</code>
          </div>
          <div className="flex-1 rounded-lg bg-slate-900/80 border border-white/10 px-4 py-3">
            <div className="text-xs text-blue-200/40 mb-1">Staging</div>
            <code className="text-sm text-cyan-300 font-mono">https://api.staging.alecrae.com</code>
          </div>
          <div className="flex-1 rounded-lg bg-slate-900/80 border border-white/10 px-4 py-3">
            <div className="text-xs text-blue-200/40 mb-1">Local</div>
            <code className="text-sm text-cyan-300 font-mono">http://localhost:3001</code>
          </div>
        </div>
      </section>
    </div>
  );
}
