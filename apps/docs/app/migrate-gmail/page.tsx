import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../components/page-header";
import { CodeBlock } from "../components/code-block";
import { Callout } from "../components/callout";
import { Table } from "../components/table";

export const metadata: Metadata = {
  title: "From Gmail to AlecRae in 5 Minutes — AlecRae Docs",
  description:
    "Step-by-step guide to migrating from Gmail to AlecRae. Import your entire mailbox, labels, contacts, and more.",
};

export default function MigrateGmailPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="From Gmail to AlecRae in 5 Minutes"
        description="Switch from Gmail to AlecRae without losing a single email. AlecRae's migration tools import your entire mailbox — labels, contacts, and all."
        badge="Migration Guide"
      />

      <section className="space-y-10">
        {/* Prerequisites */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Before you start</h2>
          <ul className="space-y-2 text-blue-100/70">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>A AlecRae account (free tier works)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>Access to your Gmail account</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>A stable internet connection (for large mailboxes)</span>
            </li>
          </ul>
        </div>

        {/* Step 1 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">1. Connect your Gmail account</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Open AlecRae at{" "}
            <a href="https://mail.alecrae.com" className="text-cyan-300 hover:text-cyan-200 underline">
              mail.alecrae.com
            </a>
            , go to <strong className="text-white">Settings &gt; Accounts &gt; Add Account</strong>, and select{" "}
            <strong className="text-white">Gmail / Google Workspace</strong>. Sign in with your Google account and
            grant AlecRae read access. AlecRae connects via OAuth — your password is never stored.
          </p>
          <CodeBlock
            code={`POST https://api.alecrae.com/v1/connect/gmail
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "scopes": ["gmail.readonly", "gmail.modify"]
}`}
            language="http"
            title="Connect Gmail via API"
          />
        </div>

        {/* Step 2 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">2. Import your emails</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Once connected, AlecRae begins syncing automatically. For a full historical import, go to{" "}
            <strong className="text-white">Settings &gt; Import &gt; Gmail</strong> and choose what to import:
          </p>
          <ul className="space-y-2 text-blue-100/70 mb-4">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>
                <strong className="text-white">All emails</strong> (recommended) — imports your entire mailbox
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>
                <strong className="text-white">Specific labels</strong> — pick which Gmail labels to bring over
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>
                <strong className="text-white">Date range</strong> — only import emails from a specific period
              </span>
            </li>
          </ul>
          <CodeBlock
            code={`POST https://api.alecrae.com/v1/import/gmail
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "connectedAccountId": "acct_your_gmail_id",
  "includeLabels": true,
  "includeContacts": true
}`}
            language="http"
            title="Start Gmail import"
          />
        </div>

        {/* Step 3 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">3. Check progress</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            AlecRae imports in the background. You can keep using the app while it works. Large mailboxes
            (50K+ emails) typically finish in 10-15 minutes. Gmail labels become AlecRae tags.
          </p>
          <CodeBlock
            code={`GET https://api.alecrae.com/v1/import/status/:jobId`}
            language="http"
            title="Check import status"
          />
        </div>

        {/* Step 4 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">4. Verify your import</h2>
          <p className="text-blue-100/70 leading-relaxed">
            Once complete, check your inbox — all emails should be present. Check your labels/tags, search for a
            specific old email to confirm it imported correctly, and verify contacts.
          </p>
        </div>

        {/* Step 5 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">5. Set up forwarding (optional)</h2>
          <p className="text-blue-100/70 leading-relaxed">
            AlecRae's continuous sync keeps both inboxes in sync automatically — no forwarding needed. If you
            prefer forwarding, go to Gmail&apos;s Settings &gt; Forwarding and add your AlecRae address.
          </p>
          <Callout type="tip" title="Automatic sync">
            AlecRae keeps your Gmail account synced in real time. New emails appear in AlecRae within seconds.
            No forwarding rules necessary.
          </Callout>
        </div>

        {/* What transfers */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">What transfers</h2>
          <Table
            headers={["Gmail Feature", "AlecRae Equivalent"]}
            rows={[
              ["Labels", "Tags"],
              ["Stars", "Priority markers"],
              ["Categories (Primary, Social, etc.)", "Smart Inbox categories (AI-powered)"],
              ["Contacts", "AlecRae Contacts"],
              ["Filters", "AlecRae AI Rules (smarter)"],
              ["Drafts", "AlecRae Drafts"],
              ["Sent mail", "Sent folder"],
              ["Trash", "Trash (30-day retention)"],
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
                <strong className="text-white">Search:</strong> AlecRae finds emails in under 50ms. Gmail search often takes 2-5 seconds.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">AI:</strong> Grammar agent, dictation, and compose assistant included free. Gmail charges $30/mo for Gemini.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">Privacy:</strong> AlecRae never scans your emails for ads. Gmail does.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">Speed:</strong> Inbox loads from local cache in under 100ms.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">Unified inbox:</strong> Gmail, Outlook, iCloud, and IMAP accounts in one place.
              </span>
            </li>
          </ul>
        </div>

        {/* Troubleshooting */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Troubleshooting</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Import seems stuck?</h3>
              <p className="text-blue-100/70 text-sm">
                Large mailboxes take time. Check the status endpoint — if progress is still increasing, the import is working.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Missing emails?</h3>
              <p className="text-blue-100/70 text-sm">
                Try reimporting with the &quot;All emails&quot; option. Some emails in Gmail&apos;s &quot;All Mail&quot;
                archive may not be in specific labels.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">OAuth error?</h3>
              <p className="text-blue-100/70 text-sm">
                Revoke AlecRae&apos;s access in{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  className="text-cyan-300 hover:text-cyan-200 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Account Permissions
                </a>
                , then reconnect from Settings &gt; Accounts.
              </p>
            </div>
          </div>
        </div>

        {/* Next steps */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Next steps</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { href: "/quickstart", title: "Quickstart", desc: "Navigate AlecRae like a power user" },
              { href: "/migrate-outlook", title: "From Outlook", desc: "Also switching from Outlook?" },
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
