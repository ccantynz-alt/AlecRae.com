import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../components/page-header";
import { CodeBlock } from "../components/code-block";
import { Callout } from "../components/callout";

export const metadata: Metadata = {
  title: "Quickstart — AlecRae API Docs",
  description: "Send your first email through the AlecRae API in under five minutes.",
};

export default function QuickstartPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="Quickstart"
        description="Send your first email through the AlecRae API in under five minutes."
      />

      <section className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">1. Get an API key</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Sign in to the{" "}
            <a href="https://mail.alecrae.com/settings/api" className="text-cyan-300 hover:text-cyan-200 underline">
              AlecRae dashboard
            </a>
            , navigate to Settings &gt; API Keys, and create a new key. Treat it like a password — anyone with the key can
            send mail on your behalf.
          </p>
          <CodeBlock
            code={`export ALECRAE_API_KEY=vn_live_xxxxxxxxxxxxxxxxxxxxxxxx`}
            language="bash"
            title="Set your API key"
          />
          <Callout type="tip" title="Test keys">
            Keys prefixed with <code className="text-cyan-300 font-mono text-xs">vn_test_</code> simulate sends without delivering real email.
            Use them during development to avoid accidental sends.
          </Callout>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">2. Verify a sending domain</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Before you can send from <code className="text-cyan-300 font-mono text-xs">you@yourdomain.com</code>, you need to verify the domain.
            AlecRae will give you SPF, DKIM, and DMARC records to add to your DNS.
          </p>
          <CodeBlock
            code={`curl https://api.alecrae.com/v1/domains \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "domain": "yourdomain.com" }'`}
            language="bash"
            title="Add a domain"
          />
          <p className="text-blue-100/70 mt-3">
            See <Link href="/domains" className="text-cyan-300 hover:text-cyan-200 underline">Domains</Link> for the full walkthrough.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">3. Send a message</h2>

          <CodeBlock
            code={`curl https://api.alecrae.com/v1/messages \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "you@yourdomain.com",
    "to": ["customer@example.com"],
    "subject": "Hello from AlecRae",
    "text": "It worked.",
    "html": "<p>It worked.</p>"
  }'`}
            language="bash"
            title="curl"
          />

          <CodeBlock
            code={`const response = await fetch("https://api.alecrae.com/v1/messages", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.ALECRAE_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "you@yourdomain.com",
    to: ["customer@example.com"],
    subject: "Hello from AlecRae",
    text: "It worked.",
    html: "<p>It worked.</p>",
  }),
});

const data = await response.json();
console.log(data.id); // msg_01HX...`}
            language="javascript"
            title="JavaScript (fetch)"
          />

          <CodeBlock
            code={`import requests

response = requests.post(
    "https://api.alecrae.com/v1/messages",
    headers={
        "Authorization": f"Bearer {ALECRAE_API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "from": "you@yourdomain.com",
        "to": ["customer@example.com"],
        "subject": "Hello from AlecRae",
        "text": "It worked.",
        "html": "<p>It worked.</p>",
    },
)

data = response.json()
print(data["id"])  # msg_01HX...`}
            language="python"
            title="Python (requests)"
          />

          <p className="text-blue-100/70 mt-3">
            You will receive a <code className="text-cyan-300 font-mono text-xs">messageId</code> you can use to look up delivery status.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">4. Listen for events</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Configure a <Link href="/webhooks" className="text-cyan-300 hover:text-cyan-200 underline">webhook</Link> to
            receive delivery, open, click, bounce, and complaint events in real time.
          </p>
          <CodeBlock
            code={`curl https://api.alecrae.com/v1/webhooks \\
  -H "Authorization: Bearer $ALECRAE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://yourdomain.com/hooks/alecrae",
    "events": ["message.delivered", "message.bounced", "message.opened"]
  }'`}
            language="bash"
            title="Create a webhook"
          />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Next steps</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { href: "/authentication", title: "Authentication", desc: "API keys, scopes, and bearer tokens" },
              { href: "/emails", title: "Emails", desc: "All the ways to send and manage mail" },
              { href: "/errors", title: "Errors", desc: "Status codes and retry guidance" },
              { href: "/rate-limits", title: "Rate Limits", desc: "Quotas and throttling" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 hover:border-white/20 transition-all group"
              >
                <div className="text-sm font-semibold text-white group-hover:text-cyan-200 transition-colors">{item.title}</div>
                <div className="text-xs text-blue-100/50 mt-1">{item.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
