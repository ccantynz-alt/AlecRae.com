# From Gmail to Vienna in 5 Minutes

Switch from Gmail to Vienna without losing a single email. Vienna's migration tools import your entire mailbox — labels, contacts, and all.

## Before you start

- A Vienna account (free tier works)
- Access to your Gmail account
- A stable internet connection (for large mailboxes)

## Step 1: Connect your Gmail account

1. Open Vienna at [mail.48co.ai](https://mail.48co.ai)
2. Go to **Settings → Accounts → Add Account**
3. Select **Gmail / Google Workspace**
4. Sign in with your Google account and grant Vienna read access
5. Vienna connects via OAuth — your password is never stored

```
POST https://api.48co.ai/v1/connect/gmail
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "scopes": ["gmail.readonly", "gmail.modify"]
}
```

## Step 2: Import your emails

Once connected, Vienna begins syncing automatically. For a full historical import:

1. Go to **Settings → Import → Gmail**
2. Choose what to import:
   - **All emails** (recommended) — imports your entire mailbox
   - **Specific labels** — pick which Gmail labels to bring over
   - **Date range** — only import emails from a specific period
3. Click **Start Import**

```
POST https://api.48co.ai/v1/import/gmail
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "connectedAccountId": "acct_your_gmail_id",
  "includeLabels": true,
  "includeContacts": true
}
```

## Step 3: Check progress

Vienna imports in the background. You can keep using the app while it works.

- Go to **Settings → Import → Status** to see progress
- Large mailboxes (50K+ emails) typically finish in 10-15 minutes
- Vienna preserves your Gmail labels as Vienna tags

```
GET https://api.48co.ai/v1/import/status/:jobId
```

## Step 4: Verify your import

Once complete:

1. Check your inbox — all emails should be present
2. Check your labels/tags — Gmail labels are now Vienna tags
3. Search for a specific old email to confirm it imported correctly
4. Check contacts — all Gmail contacts are imported to Vienna

## Step 5: Set up forwarding (optional)

If you want to keep receiving emails at your Gmail address but read them in Vienna:

1. In Gmail, go to **Settings → Forwarding and POP/IMAP**
2. Add your Vienna address as a forwarding destination
3. Confirm the forwarding verification email in Vienna
4. Select **Forward a copy** and choose what to do with the Gmail copy

Alternatively, Vienna's continuous sync keeps both inboxes in sync automatically — no forwarding needed.

## What transfers

| Gmail feature | Vienna equivalent |
|---|---|
| Labels | Tags |
| Stars | Priority markers |
| Categories (Primary, Social, etc.) | Smart Inbox categories (AI-powered) |
| Contacts | Vienna Contacts |
| Filters | Vienna AI Rules (smarter) |
| Drafts | Vienna Drafts |
| Sent mail | Sent folder |
| Trash | Trash (30-day retention) |

## What improves

- **Search:** Vienna's Meilisearch finds emails in under 50ms — Gmail search often takes 2-5 seconds
- **AI:** Vienna's grammar agent, dictation, and compose assistant are included free (Gmail charges $30/mo for Gemini)
- **Privacy:** Vienna never scans your emails for ads. Gmail does.
- **Speed:** Vienna loads your inbox from local cache in under 100ms. Gmail's web UI is consistently slower.
- **Unified inbox:** Keep your Gmail connected alongside Outlook, iCloud, and IMAP accounts in one place

## Troubleshooting

**Import seems stuck?**
Large mailboxes take time. Check the status endpoint — if progress is still increasing, the import is working.

**Missing emails?**
Try reimporting with the "All emails" option. Some emails in Gmail's "All Mail" archive may not be in specific labels.

**OAuth error?**
Revoke Vienna's access in [Google Account Permissions](https://myaccount.google.com/permissions), then reconnect from Settings → Accounts.

## Next steps

- [Set up keyboard shortcuts](/quickstart) to navigate Vienna like a power user
- [Configure AI Compose](/messages) to draft emails in your writing style
- [Explore Smart Inbox](/webhooks) to let Vienna automatically categorize your email
