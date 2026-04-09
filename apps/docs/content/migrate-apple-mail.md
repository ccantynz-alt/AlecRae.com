# From Apple Mail to Vienna

Migrate from Apple Mail to Vienna using MBOX export. All your emails, folders, and structure transfer seamlessly.

## Before you start

- A Vienna account (free tier works)
- Apple Mail on your Mac
- Your emails stored locally or via iCloud

## Step 1: Export from Apple Mail

Apple Mail stores emails in MBOX format, which Vienna imports natively.

### Option A: Export specific mailboxes

1. Open **Apple Mail** on your Mac
2. In the sidebar, select the mailbox you want to export
3. Go to **Mailbox → Export Mailbox...**
4. Choose a save location (e.g., your Desktop)
5. Repeat for each mailbox you want to migrate

### Option B: Export everything

1. Select **All Mail** or each top-level mailbox
2. Export each one as described above
3. You will have `.mbox` files ready for import

## Step 2: Import into Vienna

### Via the web interface

1. Open Vienna at [mail.48co.ai](https://mail.48co.ai)
2. Go to **Settings → Import → MBOX File**
3. Drag and drop your `.mbox` file(s) or click to browse
4. Vienna parses and imports all emails from the file

### Via the API

```
POST https://api.48co.ai/v1/import/mbox
Authorization: Bearer $TOKEN
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="Inbox.mbox"
Content-Type: application/mbox

[file contents]
--boundary--
```

For large MBOX files, Vienna processes them in chunks and reports progress:

```
GET https://api.48co.ai/v1/import/status/:jobId
```

## Step 3: Connect your iCloud email (optional)

If you use an iCloud email address (@icloud.com, @me.com, @mac.com):

1. Go to **Settings → Accounts → Add Account → IMAP**
2. Enter your iCloud email settings:
   - **IMAP Server:** `imap.mail.me.com`
   - **Port:** 993 (SSL)
   - **Username:** Your full iCloud email address
   - **Password:** An app-specific password (generate at [appleid.apple.com](https://appleid.apple.com))
3. Vienna will sync your iCloud mailbox going forward

```
POST https://api.48co.ai/v1/connect/imap
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "host": "imap.mail.me.com",
  "port": 993,
  "secure": true,
  "username": "you@icloud.com",
  "password": "your-app-specific-password"
}
```

## Step 4: Import individual EML files

If you have individual `.eml` files (exported from Apple Mail or elsewhere):

1. Go to **Settings → Import → EML Files**
2. Select one or more `.eml` files
3. Vienna imports each as an individual email

```
POST https://api.48co.ai/v1/import/eml
Authorization: Bearer $TOKEN
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="files"; filename="message.eml"
Content-Type: message/rfc822

[file contents]
--boundary--
```

## What transfers

| Apple Mail feature | Vienna equivalent |
|---|---|
| Mailboxes | Tags |
| Smart Mailboxes | Vienna AI Rules (smarter) |
| Flags | Priority markers |
| VIPs | Smart Inbox priority contacts |
| Contacts (via iCloud) | Vienna Contacts (via IMAP sync) |
| Rules | Vienna AI Rules |
| Signatures | Vienna Signatures |

## What improves

- **AI everywhere:** Vienna includes grammar checking, AI compose, dictation, and translation — features Apple Mail does not have at all
- **Cross-platform:** Vienna works on Mac, Windows, Linux, iOS, Android, and web. Apple Mail is Mac/iOS only.
- **Speed:** Vienna's local-first cache makes inbox load instant. Apple Mail can be slow with large IMAP accounts.
- **Search:** Sub-50ms full-text search. Apple Mail's Spotlight integration is often unreliable for email search.
- **Multi-account:** Unify Gmail, Outlook, iCloud, and any IMAP account in one inbox with one AI layer
- **Modern UI:** Vienna's interface is built for 2026, not 2012

## Troubleshooting

**MBOX file is very large?**
Vienna handles MBOX files up to 10GB. For larger files, split them using a tool like `formail` or import in batches.

**iCloud app-specific password?**
Go to [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords → Generate.

**Missing emails after import?**
Check if Apple Mail has emails in "On My Mac" mailboxes — these are stored locally and not in iCloud. Export those separately.

**Attachments not importing?**
MBOX format includes attachments inline. If an attachment exceeds 25MB, it will be stored in Vienna's R2 object storage separately.

## Next steps

- [Set up keyboard shortcuts](/quickstart) to navigate Vienna efficiently
- [Explore AI Compose](/messages) to draft emails faster
- [Configure Smart Inbox](/webhooks) for automatic email categorization
