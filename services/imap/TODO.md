# IMAP Service — Pending Rewrite

Two files in this service are **excluded from `tsc --noEmit`** in
`tsconfig.json` and **not re-exported from `src/index.ts`** because they
reference older `ImapFetchItem` and `ImapMessage` shapes that no longer exist:

- `src/handlers/messages.ts` — FETCH/STORE/COPY/MOVE/SEARCH/APPEND/IDLE handlers.
- `src/server/imap-server.ts` — TCP server + command dispatcher.

## What drifted

The `ImapFetchItem` type in `src/types.ts` used to be a tagged union
(`{ type: "FLAGS" }`, `{ type: "BODY", section }`, …) and was refactored
into a structured record (`{ flags: boolean; envelope: boolean;
bodySections: ImapBodySection[]; … }`). `messages.ts` still switches on
`item.type` and reads `item.section`, producing a cascade of TS2339
errors.

`ImapMessage` lost its `body` / `rawHeaders` fields when the handler/
storage split landed — body retrieval is now expected to go through a
separate call on `MessageStore` rather than being embedded in the row.
`messages.ts` still reads `msg.body` / `msg.rawHeaders` directly.

`imap-server.ts` imports `handleUid` / `handleIdle` (never exported),
calls `handleStore` / `handleCopy` / `handleSearch` with 3 arguments
(they now take 5-7), imports `TLSServer` from `node:tls` (should be
`Server`), and uses a `TlsOptions.isServer` field that does not exist.

## What ships today

The following files **are** typechecked and production-ready:

- `src/types.ts` — the canonical type shapes.
- `src/server/commands.ts` — IMAP4rev2 command parser + response formatters.
- `src/handlers/auth.ts` + `src/handlers/auth-crypto.ts` — LOGIN/AUTHENTICATE
  wired to the shared `users` / `accounts` tables, SHA-256 password
  hashing kept in sync with the web auth route, 5/15-min rate limiter.
- `src/handlers/mailbox.ts` — SELECT/EXAMINE/CREATE/DELETE/RENAME/LIST/…
- `src/storage.ts` — Postgres adapter that implements the `MessageStore`
  contract from `src/store-types.ts`.
- `src/store-types.ts` — the abstract `MessageStore` / `AppendData` /
  `FlagOperation` / `UidMapping` contract.

## Rebuild plan

1. Rewrite `handlers/messages.ts::handleFetch` to walk the structured
   `ImapFetchItem` fields (`item.flags`, `item.envelope`,
   `item.bodySections`, …) instead of switching on `item.type`.
2. Add an explicit `fetchRawBody(uid, section?)` method to
   `MessageStore` and route body/header retrieval through it so
   `ImapMessage` rows stay lean.
3. Reimplement `server/imap-server.ts` against the current command-
   handler signatures (pass `session` + `command` + `writer` +
   `sendContinuation` through consistently; add the missing UID and
   IDLE dispatch).
4. Fix the `node:tls` import (`Server` not `TLSServer`) and drop the
   non-existent `TlsOptions.isServer` field.
5. Remove the entries from `tsconfig.json::exclude` and re-export the
   rebuilt handlers from `src/index.ts`.

Until then the IMAP service is **wired but not bootable** — the auth
and mailbox handlers compile cleanly, but no one starts a TCP listener.
