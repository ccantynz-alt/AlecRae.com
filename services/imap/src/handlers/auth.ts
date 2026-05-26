/**
 * IMAP Authentication Handlers
 * Implements LOGIN and AUTHENTICATE commands per RFC 9051 Section 6.2.
 *
 * These handlers validate credentials and transition the session
 * from "not_authenticated" to "authenticated" state.
 */

import type { ImapSession, ImapCommand, Result } from "../types.js";
import { ok, err } from "../types.js";
import {
  formatTagged,
  buildCapabilityString,
  parseQuotedString,
  parseAtom,
} from "../server/commands.js";
import { eq } from "drizzle-orm";
import { getDatabase, users, accounts } from "@alecrae/db";
import {
  hashPassword,
  constantTimeEqual,
  isRateLimited,
  recordFailedAttempt,
  clearRateLimit,
} from "./auth-crypto.js";

/**
 * Validate IMAP LOGIN/AUTHENTICATE credentials against the shared user store.
 *
 * Looks up the user by email, verifies the SHA-256 password hash in
 * constant time, and confirms the owning account is not suspended or
 * scheduled for deletion. Returns the canonical lower-cased email on
 * success.
 */
async function validateCredentials(
  username: string,
  password: string,
): Promise<Result<string, string>> {
  if (!username || !password) {
    return err("Empty username or password");
  }

  if (username.length > 255 || password.length > 1024) {
    return err("Credentials too long");
  }

  const email = username.toLowerCase().trim();
  const db = getDatabase();

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      accountId: users.accountId,
      accountStatus: accounts.status,
    })
    .from(users)
    .innerJoin(accounts, eq(users.accountId, accounts.id))
    .where(eq(users.email, email))
    .limit(1);

  if (!row || !row.passwordHash) {
    return err("Invalid credentials");
  }

  if (row.accountStatus !== "active") {
    return err(`Account is ${row.accountStatus}`);
  }

  const candidate = await hashPassword(password);
  if (!constantTimeEqual(candidate, row.passwordHash)) {
    return err("Invalid credentials");
  }

  return ok(row.email);
}

// ─── LOGIN Command ──────────────────────────────────────────────────────────

/**
 * Handle the LOGIN command per RFC 9051 Section 6.2.3.
 * Format: tag LOGIN username password
 *
 * Note: LOGIN sends credentials in plaintext. Clients SHOULD use
 * AUTHENTICATE with SASL mechanisms or require STARTTLS first.
 * The LOGINDISABLED capability can be advertised to prevent plaintext login.
 *
 * @param session - The current IMAP session.
 * @param command - The parsed LOGIN command.
 * @param writer - Function to write response data to the client.
 */
export async function handleLogin(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
): Promise<void> {
  // Check rate limiting
  if (isRateLimited(session.remoteAddress)) {
    writer(
      formatTagged(
        command.tag,
        "NO",
        "[ALERT] Too many failed login attempts. Try again later.",
      ),
    );
    return;
  }

  // Parse username and password from arguments
  const credentials = parseLoginArgs(command.args);
  if (!credentials) {
    writer(
      formatTagged(command.tag, "BAD", "Invalid LOGIN syntax. Expected: LOGIN username password"),
    );
    return;
  }

  const { username, password } = credentials;

  // Validate credentials
  const result = await validateCredentials(username, password);

  if (!result.ok) {
    session.failedAuthAttempts++;
    recordFailedAttempt(session.remoteAddress);

    writer(
      formatTagged(
        command.tag,
        "NO",
        "[AUTHENTICATIONFAILED] Invalid credentials",
      ),
    );
    return;
  }

  // Authentication successful — transition to authenticated state
  session.state = "authenticated";
  session.user = result.value;
  session.failedAuthAttempts = 0;
  clearRateLimit(session.remoteAddress);

  // Send capability update (capabilities may change after auth)
  writer(
    formatTagged(
      command.tag,
      "OK",
      `[${buildCapabilityString()}] LOGIN completed, welcome ${session.user}`,
    ),
  );
}

/**
 * Parse LOGIN command arguments.
 * Handles both quoted and unquoted username/password values.
 *
 * @param args - The argument string after "LOGIN".
 * @returns Parsed username and password, or null if invalid.
 */
function parseLoginArgs(args: string): { username: string; password: string } | null {
  let remaining = args.trim();
  if (!remaining) return null;

  // Parse username (may be quoted or atom)
  let username: string;
  if (remaining.startsWith('"')) {
    const parsed = parseQuotedString(remaining);
    if (!parsed) return null;
    username = parsed.value;
    remaining = parsed.rest;
  } else {
    const parsed = parseAtom(remaining);
    if (!parsed.value) return null;
    username = parsed.value;
    remaining = parsed.rest;
  }

  remaining = remaining.trim();
  if (!remaining) return null;

  // Parse password (may be quoted or atom)
  let password: string;
  if (remaining.startsWith('"')) {
    const parsed = parseQuotedString(remaining);
    if (!parsed) return null;
    password = parsed.value;
  } else {
    const parsed = parseAtom(remaining);
    if (!parsed.value) return null;
    password = parsed.value;
  }

  return { username, password };
}

// ─── AUTHENTICATE Command ───────────────────────────────────────────────────

/**
 * Handle the AUTHENTICATE command per RFC 9051 Section 6.2.2.
 * Currently supports SASL PLAIN mechanism (RFC 4616).
 *
 * AUTHENTICATE PLAIN flow:
 * 1. Client sends: tag AUTHENTICATE PLAIN [initial-response]
 * 2. If no initial response, server sends continuation: +
 * 3. Client sends base64-encoded credentials: \0username\0password
 * 4. Server validates and responds OK or NO.
 *
 * With SASL-IR (Initial Response), the client can send credentials
 * in the initial AUTHENTICATE command.
 *
 * @param session - The current IMAP session.
 * @param command - The parsed AUTHENTICATE command.
 * @param writer - Function to write response data to the client.
 * @param sendContinuation - Function to send a continuation request to the client.
 */
export async function handleAuthenticate(
  session: ImapSession,
  command: ImapCommand,
  writer: (data: string) => void,
  sendContinuation: (text: string) => void,
): Promise<void> {
  // Check rate limiting
  if (isRateLimited(session.remoteAddress)) {
    writer(
      formatTagged(
        command.tag,
        "NO",
        "[ALERT] Too many failed authentication attempts. Try again later.",
      ),
    );
    return;
  }

  // Parse mechanism and optional initial response
  const parts = command.args.trim().split(/\s+/);
  const mechanism = parts[0]?.toUpperCase();
  const initialResponse = parts[1]; // SASL-IR per RFC 4959

  if (!mechanism) {
    writer(formatTagged(command.tag, "BAD", "Missing authentication mechanism"));
    return;
  }

  if (mechanism !== "PLAIN") {
    writer(
      formatTagged(
        command.tag,
        "NO",
        `[CANNOT] Unsupported authentication mechanism: ${mechanism}`,
      ),
    );
    return;
  }

  // Handle SASL PLAIN authentication
  if (initialResponse) {
    // Initial response provided (SASL-IR)
    await processSaslPlain(session, command.tag, initialResponse, writer);
  } else {
    // Request the credentials via continuation
    // The client will respond with the base64-encoded credentials.
    // Note: In a real implementation, we'd need async continuation handling.
    // For now, we send the continuation and the server's data handler
    // will route subsequent input back through the auth flow.
    sendContinuation("");
    // The actual credential processing happens when the client responds.
    // This requires the server to track that we're waiting for SASL data.
    // For simplicity in this bridge implementation, we rely on SASL-IR
    // (most modern clients support it). Non-SASL-IR clients will get an error.
    writer(
      formatTagged(command.tag, "NO", "SASL-IR required. Send credentials with AUTHENTICATE command."),
    );
  }
}

/**
 * Process SASL PLAIN authentication data.
 * The data format is: base64(\0username\0password) per RFC 4616.
 *
 * @param session - The current IMAP session.
 * @param tag - The command tag for the response.
 * @param base64Data - Base64-encoded SASL PLAIN credentials.
 * @param writer - Function to write response data to the client.
 */
async function processSaslPlain(
  session: ImapSession,
  tag: string,
  base64Data: string,
  writer: (data: string) => void,
): Promise<void> {
  // Decode base64
  let decoded: string;
  try {
    decoded = Buffer.from(base64Data, "base64").toString("utf-8");
  } catch {
    writer(formatTagged(tag, "BAD", "Invalid base64 encoding"));
    return;
  }

  // PLAIN format: [authzid]\0authcid\0passwd
  // authzid is the authorization identity (optional, typically empty)
  // authcid is the authentication identity (username)
  // passwd is the password
  const parts = decoded.split("\0");

  if (parts.length < 3) {
    writer(formatTagged(tag, "BAD", "Invalid SASL PLAIN format"));
    return;
  }

  // parts[0] = authzid (authorization identity, usually empty)
  // parts[1] = authcid (authentication identity = username)
  // parts[2] = password
  const username = parts[1] ?? "";
  const password = parts[2] ?? "";

  const result = await validateCredentials(username, password);

  if (!result.ok) {
    session.failedAuthAttempts++;
    recordFailedAttempt(session.remoteAddress);

    writer(
      formatTagged(tag, "NO", "[AUTHENTICATIONFAILED] Invalid credentials"),
    );
    return;
  }

  // Authentication successful
  session.state = "authenticated";
  session.user = result.value;
  session.failedAuthAttempts = 0;
  clearRateLimit(session.remoteAddress);

  writer(
    formatTagged(
      tag,
      "OK",
      `[${buildCapabilityString()}] AUTHENTICATE completed, welcome ${session.user}`,
    ),
  );
}

// ─── Exports for Testing ────────────────────────────────────────────────────

export {
  isRateLimited,
  recordFailedAttempt,
  clearRateLimit,
  hashPassword,
  constantTimeEqual,
};

