import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../components/page-header";
import { CodeBlock } from "../components/code-block";
import { Callout } from "../components/callout";
import { Table } from "../components/table";

export const metadata: Metadata = {
  title: "From Outlook to Vienna in 5 Minutes — Vienna Docs",
  description:
    "Step-by-step guide to migrating from Outlook (Microsoft 365, Outlook.com, Exchange) to Vienna.",
};

export default function MigrateOutlookPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="From Outlook to Vienna in 5 Minutes"
        description="Migrate from Outlook (Microsoft 365, Outlook.com, or Exchange) to Vienna with full email history, contacts, and calendar events intact."
        badge="Migration Guide"
      />

      <section className="space-y-10">
        {/* Prerequisites */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Before you start</h2>
          <ul className="space-y-2 text-blue-100/70">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>A Vienna account (free tier works)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>Access to your Outlook / Microsoft 365 account</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>A stable internet connection</span>
            </li>
          </ul>
        </div>

        {/* Step 1 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">1. Connect your Outlook account</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Open Vienna at{" "}
            <a href="https://mail.48co.ai" className="text-cyan-300 hover:text-cyan-200 underline">
              mail.48co.ai
            </a>
            , go to <strong className="text-white">Settings &gt; Accounts &gt; Add Account</strong>, and select{" "}
            <strong className="text-white">Outlook / Microsoft 365</strong>. Sign in with your Microsoft account and
            authorize Vienna. Your credentials are never stored — Vienna uses the Microsoft Graph API.
          </p>
          <CodeBlock
            code={`POST https://api.48co.ai/v1/connect/outlook
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "scopes": ["Mail.Read", "Mail.ReadWrite", "Contacts.Read"]
}`}
            language="http"
            title="Connect Outlook via API"
          />
        </div>

        {/* Step 2 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">2. Import your emails</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Once your Outlook account is connected, go to{" "}
            <strong className="text-white">Settings &gt; Import &gt; Outlook</strong> and choose what to import:
          </p>
          <ul className="space-y-2 text-blue-100/70 mb-4">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>
                <strong className="text-white">All emails</strong> (recommended)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>
                <strong className="text-white">Specific folders</strong> — pick which Outlook folders to bring over
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>
                <strong className="text-white">Date range</strong> — only import from a specific period
              </span>
            </li>
          </ul>
          <CodeBlock
            code={`POST https://api.48co.ai/v1/import/outlook
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "connectedAccountId": "acct_your_outlook_id",
  "includeFolders": true,
  "includeContacts": true
}`}
            language="http"
            title="Start Outlook import"
          />
        </div>

        {/* Step 3 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">3. Check progress</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            The import runs in the background — you can use Vienna immediately. Typical speed is approximately 5,000
            emails per minute. Outlook folders become Vienna tags.
          </p>
          <CodeBlock
            code={`GET https://api.48co.ai/v1/import/status/:jobId`}
            language="http"
            title="Check import status"
          />
        </div>

        {/* Step 4 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">4. Verify and sync</h2>
          <p className="text-blue-100/70 leading-relaxed">
            Vienna keeps your Outlook account in continuous sync: new emails arriving in Outlook appear in Vienna
            within seconds. Emails you send from Vienna also appear in Outlook&apos;s Sent folder.
          </p>
          <Callout type="tip" title="Continuous sync">
            No forwarding rules needed. Vienna handles bidirectional sync automatically.
          </Callout>
        </div>

        {/* What transfers */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">What transfers</h2>
          <Table
            headers={["Outlook Feature", "Vienna Equivalent"]}
            rows={[
              ["Folders", "Tags"],
              ["Focused Inbox", "Smart Inbox (AI-powered, much better)"],
              ["Categories", "Tags with colors"],
              ["Contacts", "Vienna Contacts"],
              ["Rules", "Vienna AI Rules (smarter)"],
              ["Drafts", "Vienna Drafts"],
              ["Calendar", "Vienna Calendar integration"],
              ["Recall (Outlook)", "Vienna Recall (actually works)"],
            ]}
          />
        </div>

        {/* What improves */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">What improves</h2>
          <ul className="space-y-3 text-blue-100/70">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">Email Recall:</strong> Outlook&apos;s recall only works within the same Exchange
                org. Vienna&apos;s link-based recall works everywhere.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">AI:</strong> Grammar checking, dictation, and AI compose at no extra cost.
                Microsoft charges for Copilot.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">Speed:</strong> Local-first architecture loads inbox in under 100ms. Outlook Web is
                consistently 2-4 seconds.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">Search:</strong> Sub-50ms search powered by Meilisearch. Outlook search is
                notoriously slow and inaccurate.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">No ads:</strong> Vienna never shows ads. Outlook.com free tier shows banner ads.
              </span>
            </li>
          </ul>
        </div>

        {/* Troubleshooting */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Troubleshooting</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Microsoft auth error?</h3>
              <p className="text-blue-100/70 text-sm">
                Go to{" "}
                <a
                  href="https://account.live.com/consent/Manage"
                  className="text-cyan-300 hover:text-cyan-200 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Microsoft Account App Permissions
                </a>
                , revoke Vienna, and reconnect.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Import is slow?</h3>
              <p className="text-blue-100/70 text-sm">
                Microsoft Graph API has rate limits. For very large mailboxes (100K+ emails), the import may take 30-60
                minutes. The status endpoint shows real-time progress.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Exchange on-premise?</h3>
              <p className="text-blue-100/70 text-sm">
                Vienna supports Exchange via IMAP. Go to Settings &gt; Accounts &gt; Add Account &gt; IMAP and enter
                your Exchange server details.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Shared mailboxes?</h3>
              <p className="text-blue-100/70 text-sm">
                Vienna supports shared inboxes natively. Connect the shared mailbox as a separate account, then assign
                team members in Settings &gt; Team.
              </p>
            </div>
          </div>
        </div>

        {/* Next steps */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Next steps</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { href: "/quickstart", title: "Quickstart", desc: "Navigate Vienna like a power user" },
              { href: "/migrate-gmail", title: "From Gmail", desc: "Also switching from Gmail?" },
              { href: "/migrate-apple-mail", title: "From Apple Mail", desc: "Migrating from Apple Mail?" },
              { href: "/emails", title: "Email API", desc: "Send and manage email programmatically" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 hover:border-white/20 transition-all group"
              >
                <div className="text-sm font-semibold text-white group-hover:text-cyan-200 transition-colors">
                  {item.title}
                </div>
                <div className="text-xs text-blue-100/50 mt-1">{item.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
