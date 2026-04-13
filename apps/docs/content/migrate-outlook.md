# From Outlook to AlecRae in 5 Minutes

Migrate from Outlook (Microsoft 365, Outlook.com, or Exchange) to AlecRae with full email history, contacts, and calendar events intact.

## Before you start

- A AlecRae account (free tier works)
- Access to your Outlook / Microsoft 365 account
- A stable internet connection

## Step 1: Connect your Outlook account

1. Open AlecRae at [mail.alecrae.com](https://mail.alecrae.com)
2. Go to **Settings → Accounts → Add Account**
3. Select **Outlook / Microsoft 365**
4. Sign in with your Microsoft account and authorize AlecRae
5. AlecRae connects via Microsoft Graph API — your credentials are never stored

```
POST https://api.alecrae.com/v1/connect/outlook
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "scopes": ["Mail.Read", "Mail.ReadWrite", "Contacts.Read"]
}
```

## Step 2: Import your emails

Once your Outlook account is connected:

1. Go to **Settings → Import → Outlook**
2. Choose what to import:
   - **All emails** (recommended) — imports your entire mailbox
   - **Specific folders** — pick which Outlook folders to bring over
   - **Date range** — only import emails from a specific period
3. Click **Start Import**

```
POST https://api.alecrae.com/v1/import/outlook
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "connectedAccountId": "acct_your_outlook_id",
  "includeFolders": true,
  "includeContacts": true
}
```

## Step 3: Check progress

The import runs in the background — you can use AlecRae immediately.

- Go to **Settings → Import → Status** to monitor progress
- Typical import speeds: ~5,000 emails per minute
- Outlook folders become AlecRae tags

```
GET https://api.alecrae.com/v1/import/status/:jobId
```

## Step 4: Verify your import

Once the import completes:

1. Check your inbox — all emails should be present
2. Check your folders/tags — Outlook folders are now AlecRae tags
3. Search for an old email to confirm everything transferred
4. Check contacts — Outlook contacts are now in AlecRae

## Step 5: Set up continuous sync (recommended)

AlecRae keeps your Outlook account in continuous sync:

- New emails arriving in Outlook appear in AlecRae within seconds
- Emails you send from AlecRae also appear in Outlook's Sent folder
- Deleting in one place deletes in both (if sync is bidirectional)

No forwarding rules needed — AlecRae handles it automatically.

## What transfers

| Outlook feature | AlecRae equivalent |
|---|---|
| Folders | Tags |
| Focused Inbox | Smart Inbox (AI-powered, much better) |
| Categories | Tags with colors |
| Contacts | AlecRae Contacts |
| Rules | AlecRae AI Rules (smarter) |
| Drafts | AlecRae Drafts |
| Calendar | AlecRae Calendar integration |
| Recall (Outlook) | AlecRae Recall (actually works) |

## What improves

- **Email Recall:** Outlook's recall only works within the same Exchange org. AlecRae's link-based recall works everywhere, against any recipient.
- **AI:** AlecRae includes grammar checking, dictation, and AI compose at no extra cost. Microsoft charges for Copilot.
- **Speed:** AlecRae's local-first architecture loads your inbox in under 100ms. Outlook Web is consistently 2-4 seconds.
- **Search:** Sub-50ms search powered by Meilisearch. Outlook search is notoriously slow and often inaccurate.
- **Multi-account:** Use Outlook alongside Gmail, iCloud, and IMAP accounts in one unified inbox.
- **No ads:** AlecRae never shows ads. Outlook.com free tier shows banner ads.

## Troubleshooting

**Microsoft auth error?**
Go to [Microsoft Account App Permissions](https://account.live.com/consent/Manage), revoke AlecRae, and reconnect.

**Import is slow?**
Microsoft Graph API has rate limits. For very large mailboxes (100K+ emails), the import may take 30-60 minutes. The status endpoint shows real-time progress.

**Exchange on-premise?**
AlecRae supports Exchange via IMAP. Go to Settings → Accounts → Add Account → IMAP and enter your Exchange server details.

**Shared mailboxes?**
AlecRae supports shared inboxes natively. Connect the shared mailbox as a separate account, then assign team members in Settings → Team.

## Next steps

- [Set up keyboard shortcuts](/quickstart) to navigate AlecRae like a power user
- [Configure AI Compose](/messages) to draft emails in your writing style
- [Set up E2E encryption](/authentication) for sensitive communications
