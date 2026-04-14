/**
 * Mailto Unsubscribe Runner
 *
 * Parses an RFC 2368 `mailto:` unsubscribe URI and dispatches a blank
 * unsubscribe email through the caller-supplied send function. The send
 * function is injected so this module can stay free of any direct dependency
 * on the API service's outbound queue (which lives in `apps/api`).
 *
 * Typical wiring (in apps/api):
 *
 *   import { sendUnsubscribeMailto } from "@alecrae/ai-engine/unsubscribe/mailto-runner";
 *   await sendUnsubscribeMailto(mailto, async (msg) => {
 *     await getSendQueue().add("send", { from: userEmail, ...msg });
 *   });
 */

export interface ParsedMailto {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
}

export interface OutboundUnsubscribeMessage {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
}

export type SendFn = (msg: OutboundUnsubscribeMessage) => Promise<void>;

export interface MailtoRunResult {
  success: boolean;
  parsed: ParsedMailto;
  error?: string;
}

/**
 * Parse a `mailto:` URI into its components. Handles multiple recipients,
 * `cc`, `bcc`, `subject` and `body` query parameters.
 */
export function parseMailto(mailto: string): ParsedMailto {
  if (!mailto.toLowerCase().startsWith("mailto:")) {
    throw new Error(`Not a mailto: URI — ${mailto}`);
  }

  // Strip the scheme. Use indexOf — `URL` doesn't expose the path of mailto cleanly.
  const rest = mailto.slice("mailto:".length);
  const qIdx = rest.indexOf("?");
  const recipientsRaw = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
  const queryRaw = qIdx >= 0 ? rest.slice(qIdx + 1) : "";

  const to = recipientsRaw
    .split(",")
    .map((s) => decodeURIComponent(s.trim()))
    .filter((s) => s.length > 0);

  const cc: string[] = [];
  const bcc: string[] = [];
  let subject = "unsubscribe";
  let body = "";

  if (queryRaw) {
    for (const pair of queryRaw.split("&")) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx < 0) continue;
      const key = decodeURIComponent(pair.slice(0, eqIdx)).toLowerCase();
      const value = decodeURIComponent(pair.slice(eqIdx + 1).replace(/\+/g, " "));
      if (key === "subject") subject = value;
      else if (key === "body") body = value;
      else if (key === "cc") cc.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
      else if (key === "bcc") bcc.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
      else if (key === "to") to.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }

  return { to, cc, bcc, subject, body };
}

/**
 * Send an unsubscribe email derived from a `mailto:` URI. The actual
 * delivery is delegated to the caller-supplied `send` function.
 */
export async function sendUnsubscribeMailto(
  mailto: string,
  send: SendFn,
): Promise<MailtoRunResult> {
  let parsed: ParsedMailto;
  try {
    parsed = parseMailto(mailto);
  } catch (err) {
    return {
      success: false,
      parsed: { to: [], cc: [], bcc: [], subject: "", body: "" },
      error: (err as Error).message,
    };
  }

  if (parsed.to.length === 0) {
    return { success: false, parsed, error: "mailto: URI has no recipients" };
  }

  try {
    await send({
      to: parsed.to,
      cc: parsed.cc,
      bcc: parsed.bcc,
      subject: parsed.subject || "unsubscribe",
      body: parsed.body || "",
    });
    return { success: true, parsed };
  } catch (err) {
    return { success: false, parsed, error: (err as Error).message };
  }
}
