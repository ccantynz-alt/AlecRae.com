import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../components/page-header";
import { CodeBlock } from "../components/code-block";
import { Callout } from "../components/callout";
import { Table } from "../components/table";

export const metadata: Metadata = {
  title: "From Apple Mail to AlecRae — AlecRae Docs",
  description:
    "Step-by-step guide to migrating from Apple Mail to AlecRae using MBOX export and IMAP sync.",
};

export default function MigrateAppleMailPage(): React.JSX.Element {
  return (
    <div className="px-6 md:px-8 py-12 md:py-16 max-w-4xl mx-auto">
      <PageHeader
        title="From Apple Mail to AlecRae"
        description="Migrate from Apple Mail to AlecRae using MBOX export. All your emails, folders, and structure transfer seamlessly."
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
              <span>Apple Mail on your Mac</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">-</span>
              <span>Your emails stored locally or via iCloud</span>
            </li>
          </ul>
        </div>

        {/* Step 1 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">1. Export from Apple Mail</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Apple Mail stores emails in MBOX format, which AlecRae imports natively.
          </p>

          <h3 className="text-lg font-semibold text-white mb-2">Option A: Export specific mailboxes</h3>
          <ol className="space-y-2 text-blue-100/70 mb-6 list-decimal list-inside">
            <li>Open <strong className="text-white">Apple Mail</strong> on your Mac</li>
            <li>In the sidebar, select the mailbox you want to export</li>
            <li>
              Go to <strong className="text-white">Mailbox &gt; Export Mailbox...</strong>
            </li>
            <li>Choose a save location (e.g., your Desktop)</li>
            <li>Repeat for each mailbox you want to migrate</li>
          </ol>

          <h3 className="text-lg font-semibold text-white mb-2">Option B: Export everything</h3>
          <p className="text-blue-100/70 mb-4">
            Select <strong className="text-white">All Mail</strong> or each top-level mailbox and export each one.
            You will have <code className="text-cyan-300 font-mono text-xs">.mbox</code> files ready for import.
          </p>
        </div>

        {/* Step 2 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">2. Import into AlecRae</h2>

          <h3 className="text-lg font-semibold text-white mb-2">Via the web interface</h3>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            Open AlecRae, go to <strong className="text-white">Settings &gt; Import &gt; MBOX File</strong>, and drag and
            drop your <code className="text-cyan-300 font-mono text-xs">.mbox</code> file(s). AlecRae parses and imports
            all emails from the file.
          </p>

          <h3 className="text-lg font-semibold text-white mb-2">Via the API</h3>
          <CodeBlock
            code={`POST https://api.alecrae.com/v1/import/mbox
Authorization: Bearer $TOKEN
Content-Type: multipart/form-data

[Upload your .mbox file]`}
            language="http"
            title="Import MBOX via API"
          />
          <CodeBlock
            code={`GET https://api.alecrae.com/v1/import/status/:jobId`}
            language="http"
            title="Check import status"
          />
          <Callout type="info" title="Large files">
            AlecRae handles MBOX files up to 10GB. For larger files, split them or import in batches.
          </Callout>
        </div>

        {/* Step 3 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">3. Connect iCloud email (optional)</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            If you use an iCloud email address (@icloud.com, @me.com, @mac.com), connect it via IMAP for continuous sync.
          </p>
          <CodeBlock
            code={`POST https://api.alecrae.com/v1/connect/imap
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "host": "imap.mail.me.com",
  "port": 993,
  "secure": true,
  "username": "you@icloud.com",
  "password": "your-app-specific-password"
}`}
            language="http"
            title="Connect iCloud via IMAP"
          />
          <Callout type="warning" title="App-specific password required">
            Apple requires an app-specific password for IMAP access. Generate one at{" "}
            <a
              href="https://appleid.apple.com"
              className="text-cyan-300 hover:text-cyan-200 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              appleid.apple.com
            </a>{" "}
            &gt; Sign-In and Security &gt; App-Specific Passwords.
          </Callout>
        </div>

        {/* Step 4 */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">4. Import individual EML files</h2>
          <p className="text-blue-100/70 mb-4 leading-relaxed">
            If you have individual <code className="text-cyan-300 font-mono text-xs">.eml</code> files, go to{" "}
            <strong className="text-white">Settings &gt; Import &gt; EML Files</strong> and select them.
          </p>
          <CodeBlock
            code={`POST https://api.alecrae.com/v1/import/eml
Authorization: Bearer $TOKEN
Content-Type: multipart/form-data

[Upload .eml files]`}
            language="http"
            title="Import EML files"
          />
        </div>

        {/* What transfers */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">What transfers</h2>
          <Table
            headers={["Apple Mail Feature", "AlecRae Equivalent"]}
            rows={[
              ["Mailboxes", "Tags"],
              ["Smart Mailboxes", "AlecRae AI Rules (smarter)"],
              ["Flags", "Priority markers"],
              ["VIPs", "Smart Inbox priority contacts"],
              ["Contacts (via iCloud)", "AlecRae Contacts (via IMAP sync)"],
              ["Rules", "AlecRae AI Rules"],
              ["Signatures", "AlecRae Signatures"],
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
                <strong className="text-white">AI everywhere:</strong> Grammar checking, AI compose, dictation, and translation —
                features Apple Mail does not have.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">Cross-platform:</strong> AlecRae works on Mac, Windows, Linux, iOS, Android, and web.
                Apple Mail is Mac/iOS only.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">Speed:</strong> Local-first cache makes inbox load instant. Apple Mail can be slow with
                large IMAP accounts.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">Search:</strong> Sub-50ms full-text search. Apple Mail&apos;s Spotlight integration is
                often unreliable for email.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">+</span>
              <span>
                <strong className="text-white">Modern UI:</strong> AlecRae&apos;s interface is built for 2026, not 2012.
              </span>
            </li>
          </ul>
        </div>

        {/* Troubleshooting */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Troubleshooting</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">MBOX file is very large?</h3>
              <p className="text-blue-100/70 text-sm">
                AlecRae handles files up to 10GB. For larger files, split them using a tool like{" "}
                <code className="text-cyan-300 font-mono text-xs">formail</code> or import in batches.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Missing emails after import?</h3>
              <p className="text-blue-100/70 text-sm">
                Check if Apple Mail has emails in &quot;On My Mac&quot; mailboxes — these are stored locally and not in
                iCloud. Export those separately.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Attachments not importing?</h3>
              <p className="text-blue-100/70 text-sm">
                MBOX format includes attachments inline. If an attachment exceeds 25MB, it will be stored in AlecRae&apos;s
                R2 object storage separately.
              </p>
            </div>
          </div>
        </div>

        {/* Next steps */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Next steps</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { href: "/quickstart", title: "Quickstart", desc: "Navigate AlecRae efficiently" },
              { href: "/migrate-gmail", title: "From Gmail", desc: "Also switching from Gmail?" },
              { href: "/migrate-outlook", title: "From Outlook", desc: "Migrating from Outlook?" },
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
