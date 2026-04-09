import Link from "next/link";

interface Card {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

const CARDS: readonly Card[] = [
  { slug: "quickstart", title: "Quickstart", description: "Send your first email in under five minutes." },
  { slug: "authentication", title: "Authentication", description: "API keys, bearer tokens, and scopes." },
  { slug: "messages", title: "Messages", description: "Send transactional and bulk email." },
  { slug: "domains", title: "Domains", description: "Add and verify sending domains with SPF, DKIM, and DMARC." },
  { slug: "webhooks", title: "Webhooks", description: "React to delivery, opens, clicks, and bounces." },
  { slug: "errors", title: "Errors", description: "Status codes, error shapes, and retry guidance." },
];

export default function DocsLanding(): React.JSX.Element {
  return (
    <div className="px-8 py-16 max-w-5xl mx-auto">
      <header className="mb-16">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </span>
          <span className="text-xs font-medium text-blue-100 tracking-wide uppercase">v0.1 · Beta</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tighter bg-gradient-to-r from-white via-blue-200 to-cyan-300 bg-clip-text text-transparent mb-4">
          Vienna API
        </h1>
        <p className="text-xl text-blue-100/70 max-w-2xl leading-relaxed font-light">
          Send transactional and bulk email through the same infrastructure that powers Vienna.
          Type-safe, edge-deployed, and built for developers who hate mailing-list plumbing.
        </p>
      </header>

      <section className="mb-16">
        <div className="rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-sm p-6 font-mono text-sm">
          <div className="text-blue-200/40 mb-2"># Send an email</div>
          <pre className="text-cyan-200 overflow-x-auto">
{`curl https://api.48co.ai/v1/messages \\
  -H "Authorization: Bearer $VIENNA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "you@yourdomain.com",
    "to": ["customer@example.com"],
    "subject": "Welcome to Vienna",
    "text": "Hello from the Vienna API."
  }'`}
          </pre>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CARDS.map((card) => (
          <Link
            key={card.slug}
            href={`/${card.slug}`}
            className="group rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 hover:bg-white/10 hover:border-white/20 transition-all"
          >
            <div className="text-lg font-semibold text-white mb-1 group-hover:text-cyan-200 transition-colors">
              {card.title}
            </div>
            <div className="text-sm text-blue-100/60">{card.description}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
