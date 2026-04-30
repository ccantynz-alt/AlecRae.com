/**
 * IMAP Mailbox Operation Handlers
 * Implements mailbox management commands per RFC 9051 Sections 6.3 and 7.2.
 *
 * These handlers operate on the shared mailbox storage layer that is also
 * used by the JMAP service, ensuring consistency across protocols.
 */

import type {
  ImapSession,
  ImapCommand,
  ImapMailbox,
} from "../types.js";
import { SYSTEM_FLAGS } from "../types.js";
import {
  formatTagged,
  formatUntagged,
  formatListResponse,
  formatLsubResponse,
  formatStatusResponse,
  formatFlags,
  parseQuotedString,
  parseAtom,
  parseParenList,
} from "../server/commands.js";

// ─── Mailbox Store ──────────────────────────────────────────────────────────

/**
 * In-memory mailbox store.
 * In production, this would be backed by the shared PostgreSQL database
 * and would be consistent with the JMAP mailbox operations.
 */
const mailboxStore = new Map<string, Map<string, ImapMailbox>>();

/** Hierarchy delimiter used for IMAP mailbox names. */
const HIERARCHY_DELIMITER = "/";

/**
 * Get or initialize the mailbox store for a user.
 * Creates default mailboxes (INBOX, Sent, Drafts, etc.) if the user is new.
 *
 * @param username - The authenticated username.
 * @returns The user's mailbox map (name -> ImapMailbox).
 */
function getUserMailboxes(username: string): Map<string, ImapMailbox> {
  let userBoxes = mailboxStore.get(username);
  if (userBoxes) return userBoxes;

  // Initialize default mailboxes per RFC 9051
  userBoxes = new Map<string, ImapMailbox>();
  const defaults: { name: string; attributes: string[] }[] = [
    { name: "INBOX", attributes: ["\\HasNoChildren"] },
    { name: "Drafts", attributes: ["\\HasNoChildren", "\\Drafts"] },
    { name: "Sent", attributes: ["\\HasNoChildren", "\\Sent"] },
    { name: "Junk", attributes: ["\\HasNoChildren", "\\Junk"] },
    { name: "Trash", attributes: ["\\HasNoChildren", "\\Trash"] },
    { name: "Archive", attributes: ["\\HasNoChildren", "\\Archive"] },
  ];

  for (const def of defaults) {
    userBoxes.set(def.name, createMailbox(def.name, def.attributes));
  }

  mailboxStore.set(username, userBoxes);
  return userBoxes;
}

/**
 * Create a new ImapMailbox with default values.
 */
function createMailbox(name: string, attributes: string[] = []): ImapMailbox {
  return {
    name,
    uidValidity: Math.floor(Date.now() / 1000),
    uidNext: 1,
    messageCount: 0,
    recentCount: 0,
    unseenCount: 0,
    firstUnseen: null,
    flags: [...SYSTEM_FLAGS],
    permanentFlags: [...SYSTEM_FLAGS.filter((f) => f !== "\\Recent"), "\\*"],
    delimiter: HIERARCHY_DELIMITER,
    attributes,
  };
}

// ─── Argument Parsing Helpers ───────────────────────────────────────────────

/**
 * Parse a mailbox name from command arguments.
 * Handles quoted strings and atoms. INBOX is case-insensitive per RFC 9051.
 *
 * @param args - The argument string.
 * @returns The mailbox name and remaining arguments.
 */
function parseMailboxName(args: string): { name: string; rest: string } | null {
  const trimmed = args.trim();
  if (!trimmed) return null;

  let name: string;
  let rest: string;

  if (trimmed.startsWith('"')) {
    const parsed = parseQuotedString(trimmed);
    if (!parsed) return null;
    name = parsed.value;
    rest = parsed.rest;
  } else {
    const parsed = parseAtom(trimmed);
    if (!parsed.value) return null;
    name = parsed.value;
    rest = parsed.rest;
  }

  // INBOX is always case-insensitive per RFC 9051 Section 5.1
  if (name.toUpperCase() === "INBOX") {
    name = "INBOX";
  }

  return { name, rest };
}

// ─── SELECT / EXAMINE ───────────────────────────────────────────────────────

/**
 * Handle SELECT command per RFC 9051 Section 6.3.1.
 * Opens a mailbox for read-write access.
 *
 * Response includes: FLAGS, EXISTS, RECENT, UIDVALIDITY, UIDNEXT,
 * first UNSEEN, and PERMANENTFLAGS.
 */
export function handleSelect(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  selectOrExamine(session, command, writer, false);
}

/**
 * Handle EXAMINE command per RFC 9051 Section 6.3.2.
 * Opens a mailbox for read-only access.
 */
export function handleExamine(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  selectOrExamine(session, command, writer, true);
}

/**
 * Shared implementation for SELECT and EXAMINE.
 *
 * @param readOnly - If true, open as read-only (EXAMINE). Otherwise read-write (SELECT).
 */
function selectOrExamine(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
  readOnly: boolean,
): void {
  if (!session.user) {
    writer(formatTagged(command.tag, "NO", "Not authenticated"));
    return;
  }

  const parsed = parseMailboxName(command.args);
  if (!parsed) {
    writer(formatTagged(command.tag, "BAD", "Missing mailbox name"));
    return;
  }

  const mailboxes = getUserMailboxes(session.user);
  const mailbox = mailboxes.get(parsed.name);

  if (!mailbox) {
    writer(formatTagged(command.tag, "NO", `[NONEXISTENT] Mailbox does not exist: ${parsed.name}`));
    return;
  }

  // Update session state
  session.selectedMailbox = {
    name: parsed.name,
    readOnly,
    uidValidity: mailbox.uidValidity,
    uidNext: mailbox.uidNext,
  };
  session.state = "selected";

  // Send untagged responses per RFC 9051 Section 6.3.1
  writer(formatUntagged(`FLAGS ${formatFlags(mailbox.flags)}`));
  writer(formatUntagged(`${mailbox.messageCount} EXISTS`));
  writer(formatUntagged(`${mailbox.recentCount} RECENT`));

  if (mailbox.firstUnseen !== null) {
    writer(formatUntagged(`OK [UNSEEN ${mailbox.firstUnseen}] First unseen message`));
  }

  writer(formatUntagged(`OK [UIDVALIDITY ${mailbox.uidValidity}] UIDs valid`));
  writer(formatUntagged(`OK [UIDNEXT ${mailbox.uidNext}] Predicted next UID`));
  writer(
    formatUntagged(`OK [PERMANENTFLAGS ${formatFlags(mailbox.permanentFlags)}] Permanent flags`),
  );

  const accessMode = readOnly ? "READ-ONLY" : "READ-WRITE";
  const commandName = readOnly ? "EXAMINE" : "SELECT";
  writer(formatTagged(command.tag, "OK", `[${accessMode}] ${commandName} completed`));
}

// ─── CREATE ─────────────────────────────────────────────────────────────────

/**
 * Handle CREATE command per RFC 9051 Section 6.3.3.
 * Creates a new mailbox with the given name.
 */
export function handleCreate(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  if (!session.user) {
    writer(formatTagged(command.tag, "NO", "Not authenticated"));
    return;
  }

  const parsed = parseMailboxName(command.args);
  if (!parsed) {
    writer(formatTagged(command.tag, "BAD", "Missing mailbox name"));
    return;
  }

  // Cannot create INBOX per RFC 9051
  if (parsed.name === "INBOX") {
    writer(formatTagged(command.tag, "NO", "[CANNOT] Cannot create INBOX"));
    return;
  }

  const mailboxes = getUserMailboxes(session.user);

  if (mailboxes.has(parsed.name)) {
    writer(formatTagged(command.tag, "NO", "[ALREADYEXISTS] Mailbox already exists"));
    return;
  }

  // Create any intermediate hierarchy entries if needed
  const parts = parsed.name.split(HIERARCHY_DELIMITER);
  for (let i = 1; i < parts.length; i++) {
    const parentName = parts.slice(0, i).join(HIERARCHY_DELIMITER);
    if (!mailboxes.has(parentName)) {
      const parent = createMailbox(parentName, ["\\Noselect", "\\HasChildren"]);
      mailboxes.set(parentName, parent);
    } else {
      // Update parent to indicate it has children
      const parent = mailboxes.get(parentName);
      if (parent && !parent.attributes.includes("\\HasChildren")) {
        parent.attributes = parent.attributes.filter((a) => a !== "\\HasNoChildren");
        parent.attributes.push("\\HasChildren");
      }
    }
  }

  const mailbox = createMailbox(parsed.name, ["\\HasNoChildren"]);
  mailboxes.set(parsed.name, mailbox);

  writer(formatTagged(command.tag, "OK", "CREATE completed"));
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

/**
 * Handle DELETE command per RFC 9051 Section 6.3.4.
 * Deletes an existing mailbox.
 */
export function handleDelete(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  if (!session.user) {
    writer(formatTagged(command.tag, "NO", "Not authenticated"));
    return;
  }

  const parsed = parseMailboxName(command.args);
  if (!parsed) {
    writer(formatTagged(command.tag, "BAD", "Missing mailbox name"));
    return;
  }

  // Cannot delete INBOX per RFC 9051
  if (parsed.name === "INBOX") {
    writer(formatTagged(command.tag, "NO", "[CANNOT] Cannot delete INBOX"));
    return;
  }

  const mailboxes = getUserMailboxes(session.user);

  if (!mailboxes.has(parsed.name)) {
    writer(formatTagged(command.tag, "NO", "[NONEXISTENT] Mailbox does not exist"));
    return;
  }

  // Check for child mailboxes
  const hasChildren = [...mailboxes.keys()].some(
    (name) => name.startsWith(parsed.name + HIERARCHY_DELIMITER),
  );

  if (hasChildren) {
    // Per RFC 9051, if mailbox has inferiors, mark as \Noselect instead of deleting
    const mailbox = mailboxes.get(parsed.name);
    if (!mailbox) {
      writer(formatTagged(command.tag, "NO", "[NONEXISTENT] Mailbox does not exist"));
      return;
    }
    mailbox.attributes = mailbox.attributes.filter(
      (a) => a !== "\\HasNoChildren",
    );
    if (!mailbox.attributes.includes("\\Noselect")) {
      mailbox.attributes.push("\\Noselect");
    }
    writer(formatTagged(command.tag, "OK", "DELETE completed (marked \\Noselect)"));
    return;
  }

  // If this was the selected mailbox, deselect
  if (session.selectedMailbox?.name === parsed.name) {
    session.selectedMailbox = null;
    session.state = "authenticated";
  }

  mailboxes.delete(parsed.name);

  writer(formatTagged(command.tag, "OK", "DELETE completed"));
}

// ─── RENAME ─────────────────────────────────────────────────────────────────

/**
 * Handle RENAME command per RFC 9051 Section 6.3.5.
 * Renames a mailbox and all its children.
 */
export function handleRename(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  if (!session.user) {
    writer(formatTagged(command.tag, "NO", "Not authenticated"));
    return;
  }

  // Parse old name and new name
  const firstParsed = parseMailboxName(command.args);
  if (!firstParsed) {
    writer(formatTagged(command.tag, "BAD", "Missing source mailbox name"));
    return;
  }

  const secondParsed = parseMailboxName(firstParsed.rest);
  if (!secondParsed) {
    writer(formatTagged(command.tag, "BAD", "Missing destination mailbox name"));
    return;
  }

  const oldName = firstParsed.name;
  const newName = secondParsed.name;

  const mailboxes = getUserMailboxes(session.user);

  if (!mailboxes.has(oldName)) {
    writer(formatTagged(command.tag, "NO", "[NONEXISTENT] Source mailbox does not exist"));
    return;
  }

  if (mailboxes.has(newName)) {
    writer(formatTagged(command.tag, "NO", "[ALREADYEXISTS] Destination mailbox already exists"));
    return;
  }

  // Rename the mailbox and all children
  const oldMailbox = mailboxes.get(oldName);
  if (!oldMailbox) {
    writer(formatTagged(command.tag, "NO", "[NONEXISTENT] Source mailbox does not exist"));
    return;
  }
  const newMailbox = { ...oldMailbox, name: newName };
  mailboxes.delete(oldName);
  mailboxes.set(newName, newMailbox);

  // Rename children
  const prefix = oldName + HIERARCHY_DELIMITER;
  const childEntries: [string, ImapMailbox][] = [];

  for (const [name, mb] of mailboxes) {
    if (name.startsWith(prefix)) {
      childEntries.push([name, mb]);
    }
  }

  for (const [name, mb] of childEntries) {
    const newChildName = newName + HIERARCHY_DELIMITER + name.substring(prefix.length);
    mailboxes.delete(name);
    mailboxes.set(newChildName, { ...mb, name: newChildName });
  }

  // If INBOX was renamed, create a new empty INBOX per RFC 9051
  if (oldName === "INBOX") {
    mailboxes.set("INBOX", createMailbox("INBOX", ["\\HasNoChildren"]));
  }

  // Update selected mailbox if it was renamed
  if (session.selectedMailbox?.name === oldName) {
    session.selectedMailbox.name = newName;
  }

  writer(formatTagged(command.tag, "OK", "RENAME completed"));
}

// ─── LIST ───────────────────────────────────────────────────────────────────

/**
 * Handle LIST command per RFC 9051 Section 6.3.8.
 * Lists mailboxes matching a reference and pattern.
 *
 * Pattern wildcards:
 * - % matches any character except the hierarchy delimiter
 * - * matches any character including the hierarchy delimiter
 */
export function handleList(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  if (!session.user) {
    writer(formatTagged(command.tag, "NO", "Not authenticated"));
    return;
  }

  // Parse reference and mailbox pattern
  const { reference, pattern } = parseListArgs(command.args);

  // Special case: empty reference and empty pattern returns hierarchy delimiter
  if (reference === "" && pattern === "") {
    writer(formatUntagged(formatListResponse(["\\Noselect"], HIERARCHY_DELIMITER, "")));
    writer(formatTagged(command.tag, "OK", "LIST completed"));
    return;
  }

  const mailboxes = getUserMailboxes(session.user);
  const fullPattern = reference + pattern;
  const regex = imapPatternToRegex(fullPattern);

  for (const [name, mailbox] of mailboxes) {
    if (regex.test(name)) {
      writer(
        formatUntagged(
          formatListResponse(mailbox.attributes, HIERARCHY_DELIMITER, name),
        ),
      );
    }
  }

  writer(formatTagged(command.tag, "OK", "LIST completed"));
}

// ─── LSUB ───────────────────────────────────────────────────────────────────

/**
 * Handle LSUB command per RFC 9051 Section 6.3.9 (deprecated but supported).
 * Lists subscribed mailboxes matching a pattern.
 */
export function handleLsub(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  if (!session.user) {
    writer(formatTagged(command.tag, "NO", "Not authenticated"));
    return;
  }

  const { reference, pattern } = parseListArgs(command.args);

  // For now, all mailboxes are considered subscribed
  const mailboxes = getUserMailboxes(session.user);
  const fullPattern = reference + pattern;
  const regex = imapPatternToRegex(fullPattern);

  for (const [name, mailbox] of mailboxes) {
    if (regex.test(name)) {
      writer(
        formatUntagged(
          formatLsubResponse(mailbox.attributes, HIERARCHY_DELIMITER, name),
        ),
      );
    }
  }

  writer(formatTagged(command.tag, "OK", "LSUB completed"));
}

// ─── SUBSCRIBE / UNSUBSCRIBE ────────────────────────────────────────────────

/**
 * Handle SUBSCRIBE command per RFC 9051 Section 6.3.6.
 */
export function handleSubscribe(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  if (!session.user) {
    writer(formatTagged(command.tag, "NO", "Not authenticated"));
    return;
  }

  const parsed = parseMailboxName(command.args);
  if (!parsed) {
    writer(formatTagged(command.tag, "BAD", "Missing mailbox name"));
    return;
  }

  // In production, this would update the subscription state in the database
  // For now, all mailboxes are implicitly subscribed
  writer(formatTagged(command.tag, "OK", "SUBSCRIBE completed"));
}

/**
 * Handle UNSUBSCRIBE command per RFC 9051 Section 6.3.7.
 */
export function handleUnsubscribe(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  if (!session.user) {
    writer(formatTagged(command.tag, "NO", "Not authenticated"));
    return;
  }

  const parsed = parseMailboxName(command.args);
  if (!parsed) {
    writer(formatTagged(command.tag, "BAD", "Missing mailbox name"));
    return;
  }

  writer(formatTagged(command.tag, "OK", "UNSUBSCRIBE completed"));
}

// ─── STATUS ─────────────────────────────────────────────────────────────────

/**
 * Handle STATUS command per RFC 9051 Section 6.3.10.
 * Returns status information about a mailbox without selecting it.
 *
 * Status items: MESSAGES, RECENT, UIDNEXT, UIDVALIDITY, UNSEEN.
 */
export function handleStatus(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  if (!session.user) {
    writer(formatTagged(command.tag, "NO", "Not authenticated"));
    return;
  }

  // Parse mailbox name and status items
  const nameParsed = parseMailboxName(command.args);
  if (!nameParsed) {
    writer(formatTagged(command.tag, "BAD", "Missing mailbox name"));
    return;
  }

  const mailboxes = getUserMailboxes(session.user);
  const mailbox = mailboxes.get(nameParsed.name);

  if (!mailbox) {
    writer(formatTagged(command.tag, "NO", "[NONEXISTENT] Mailbox does not exist"));
    return;
  }

  // Parse the status data items list
  const { items } = parseParenList(nameParsed.rest);
  const statusItems: Partial<Record<string, number>> = {};

  for (const item of items) {
    const upper = item.toUpperCase();
    switch (upper) {
      case "MESSAGES":
        statusItems["MESSAGES"] = mailbox.messageCount;
        break;
      case "RECENT":
        statusItems["RECENT"] = mailbox.recentCount;
        break;
      case "UIDNEXT":
        statusItems["UIDNEXT"] = mailbox.uidNext;
        break;
      case "UIDVALIDITY":
        statusItems["UIDVALIDITY"] = mailbox.uidValidity;
        break;
      case "UNSEEN":
        statusItems["UNSEEN"] = mailbox.unseenCount;
        break;
      default:
        // Unknown status item — ignore per RFC 9051
        break;
    }
  }

  writer(formatUntagged(formatStatusResponse(nameParsed.name, statusItems)));
  writer(formatTagged(command.tag, "OK", "STATUS completed"));
}

// ─── CLOSE ──────────────────────────────────────────────────────────────────

/**
 * Handle CLOSE command per RFC 9051 Section 6.4.2.
 * Closes the selected mailbox. Messages marked \Deleted are expunged silently.
 */
export function handleClose(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  if (!session.selectedMailbox) {
    writer(formatTagged(command.tag, "NO", "No mailbox selected"));
    return;
  }

  // In production, this would expunge \Deleted messages silently
  // (no untagged EXPUNGE responses sent to the client)

  session.selectedMailbox = null;
  session.state = "authenticated";

  writer(formatTagged(command.tag, "OK", "CLOSE completed"));
}

// ─── NAMESPACE ──────────────────────────────────────────────────────────────

/**
 * Handle NAMESPACE command per RFC 2342.
 * Returns the namespace hierarchy for personal, other users, and shared mailboxes.
 */
export function handleNamespace(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): void {
  if (!session.user) {
    writer(formatTagged(command.tag, "NO", "Not authenticated"));
    return;
  }

  // Personal namespace with "/" delimiter, no other-users or shared namespaces
  writer(formatUntagged(`NAMESPACE (("" "${HIERARCHY_DELIMITER}")) NIL NIL`));
  writer(formatTagged(command.tag, "OK", "NAMESPACE completed"));
}

// ─── Pattern Matching Helpers ───────────────────────────────────────────────

/**
 * Convert an IMAP mailbox pattern to a JavaScript RegExp.
 *
 * - `%` matches any character except the hierarchy delimiter
 * - `*` matches any character including the hierarchy delimiter
 *
 * @param pattern - The IMAP pattern string.
 * @returns A RegExp that matches mailbox names fitting the pattern.
 */
function imapPatternToRegex(pattern: string): RegExp {
  let regexStr = "^";

  for (const ch of pattern) {
    switch (ch) {
      case "*":
        regexStr += ".*";
        break;
      case "%":
        regexStr += `[^${escapeRegex(HIERARCHY_DELIMITER)}]*`;
        break;
      case ".":
      case "+":
      case "?":
      case "^":
      case "$":
      case "{":
      case "}":
      case "(":
      case ")":
      case "[":
      case "]":
      case "|":
      case "\\":
        regexStr += `\\${ch}`;
        break;
      default:
        regexStr += ch;
        break;
    }
  }

  regexStr += "$";
  return new RegExp(regexStr, "i");
}

/**
 * Escape a character for use in a regex character class.
 */
function escapeRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse LIST/LSUB command arguments: reference SP pattern.
 */
function parseListArgs(args: string): { reference: string; pattern: string } {
  let remaining = args.trim();

  // Parse reference (may be quoted or atom)
  let reference: string;
  if (remaining.startsWith('"')) {
    const parsed = parseQuotedString(remaining);
    if (!parsed) return { reference: "", pattern: "*" };
    reference = parsed.value;
    remaining = parsed.rest.trim();
  } else {
    const parsed = parseAtom(remaining);
    reference = parsed.value;
    remaining = parsed.rest.trim();
  }

  // Parse pattern (may be quoted or atom)
  let pattern: string;
  if (remaining.startsWith('"')) {
    const parsed = parseQuotedString(remaining);
    if (!parsed) return { reference, pattern: "*" };
    pattern = parsed.value;
  } else {
    const parsed = parseAtom(remaining);
    pattern = parsed.value;
  }

  return { reference, pattern };
}

// ─── Exports for Other Handlers ─────────────────────────────────────────────

export { getUserMailboxes, createMailbox, HIERARCHY_DELIMITER };
