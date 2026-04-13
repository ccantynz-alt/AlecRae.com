// =============================================================================
// @alecrae/ai-engine — Transcript Linker (S9)
// =============================================================================
// Detects meeting/call references inside an email thread:
//   - Zoom / Google Meet / Teams / Webex links inline in body
//   - Calendar invites (subjects starting with "Invitation:" / "Updated invitation:")
//   - .ics attachments (parsed for SUMMARY, DTSTART, LOCATION/URL)
//   - Heuristic AI inference (last resort) — based on phrasing like
//     "let's hop on a call" + a subsequent confirmation.

import type {
  LinkerEmail,
  LinkerEmailAttachment,
  MeetingPlatform,
  MeetingReference,
} from "./types.js";

// ─── Provider URL patterns ───────────────────────────────────────────────────

interface PlatformDetector {
  readonly platform: MeetingPlatform;
  readonly regex: RegExp;
  /** Extract a meeting id from a matched URL, if possible. */
  extractId(url: string): string | undefined;
}

const PLATFORM_DETECTORS: readonly PlatformDetector[] = [
  {
    platform: "zoom",
    regex: /https?:\/\/(?:[\w-]+\.)?zoom\.us\/(?:j|my|w|wc\/join)\/(\d{9,12})(?:\?[^\s<>"']*)?/gi,
    extractId(url) {
      const m = url.match(/\/(?:j|my|w|wc\/join)\/(\d{9,12})/i);
      return m?.[1];
    },
  },
  {
    platform: "meet",
    regex: /https?:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:\?[^\s<>"']*)?/gi,
    extractId(url) {
      const m = url.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
      return m?.[1];
    },
  },
  {
    platform: "teams",
    regex:
      /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']+/gi,
    extractId(url) {
      const m = url.match(/19[%:]meeting_([A-Za-z0-9_-]+)/);
      return m?.[1];
    },
  },
  {
    platform: "webex",
    regex: /https?:\/\/[\w.-]*webex\.com\/(?:meet|join|webappng\/sites\/[^/]+\/meeting\/download)\/[^\s<>"']+/gi,
    extractId(url) {
      const m = url.match(/\/meet\/([\w.-]+)/i);
      return m?.[1];
    },
  },
];

// ─── ICS parsing ─────────────────────────────────────────────────────────────

interface ParsedIcs {
  readonly summary?: string | undefined;
  readonly dtstart?: Date | undefined;
  readonly url?: string | undefined;
  readonly location?: string | undefined;
}

function unfoldIcs(text: string): string {
  // RFC 5545 line unfolding: a line beginning with whitespace continues prev.
  return text.replace(/\r?\n[ \t]/g, "");
}

function parseIcsDate(value: string): Date | undefined {
  // Examples: 20260415T140000Z, 20260415T140000, 20260415
  const m = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/,
  );
  if (!m) return undefined;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  const iso = `${y}-${mo}-${d}T${h.padStart(2, "0")}:${mi.padStart(2, "0")}:${s.padStart(2, "0")}${z === "Z" ? "Z" : ""}`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

export function parseIcs(content: string): ParsedIcs | null {
  if (!/BEGIN:VCALENDAR/i.test(content)) return null;
  const unfolded = unfoldIcs(content);
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  let summary: string | undefined;
  let dtstart: Date | undefined;
  let url: string | undefined;
  let location: string | undefined;

  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) inEvent = true;
    else if (/^END:VEVENT/i.test(line)) inEvent = false;
    if (!inEvent) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).split(";")[0]?.toUpperCase();
    const value = line.slice(colonIdx + 1).trim();
    if (!key) continue;

    if (key === "SUMMARY") summary = value.replace(/\\,/g, ",").replace(/\\n/gi, " ");
    else if (key === "DTSTART") dtstart = parseIcsDate(value);
    else if (key === "URL") url = value;
    else if (key === "LOCATION") location = value.replace(/\\,/g, ",");
    else if (key === "DESCRIPTION" && !url) {
      // Sometimes Zoom puts the join URL inside DESCRIPTION
      const m = value.match(/https?:\/\/[^\s,<>]+/);
      if (m) url = m[0];
    }
  }

  if (!summary && !dtstart && !url) return null;
  return { summary, dtstart, url, location };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emailBodyText(email: LinkerEmail): string {
  if (email.textBody && email.textBody.length > 0) return email.textBody;
  if (email.htmlBody) {
    return email.htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  return "";
}

function findIcsAttachment(
  attachments: readonly LinkerEmailAttachment[] | undefined,
): LinkerEmailAttachment | undefined {
  if (!attachments) return undefined;
  return attachments.find(
    (a) =>
      (a.filename ?? "").toLowerCase().endsWith(".ics") ||
      (a.contentType ?? "").toLowerCase().includes("text/calendar"),
  );
}

function detectInLine(text: string): {
  url: string;
  platform: MeetingPlatform;
  meetingId?: string | undefined;
} | null {
  for (const det of PLATFORM_DETECTORS) {
    det.regex.lastIndex = 0;
    const match = det.regex.exec(text);
    if (match) {
      return {
        url: match[0],
        platform: det.platform,
        meetingId: det.extractId(match[0]),
      };
    }
  }
  return null;
}

function isCalendarInviteSubject(subject?: string): boolean {
  if (!subject) return false;
  return /^(invitation|updated invitation|accepted|declined|cancelled):/i.test(
    subject,
  );
}

const MEETING_INFER_PHRASES: readonly RegExp[] = [
  /\blet'?s (?:hop on|jump on|set up|schedule) a (?:call|meeting|chat|sync)\b/i,
  /\b(?:zoom|meet|teams|call|sync) (?:tomorrow|next week|on monday|on tuesday|on wednesday|on thursday|on friday)\b/i,
  /\bschedul(?:e|ing) a (?:call|meeting)\b/i,
  /\bcalendar invite (?:to follow|coming|sent)\b/i,
];

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Inspect a thread of emails (oldest → newest) and detect a meeting reference.
 * Strategy: highest-confidence sources win. Order:
 *   1. ICS attachments (calendar_invite, 0.98)
 *   2. Calendar-invite subject + inline link (calendar_invite, 0.95)
 *   3. Inline meeting link in any message (inline_link, 0.85)
 *   4. AI-inferred phrasing (ai_inferred, 0.4)
 */
export async function detectMeetingFromThread(thread: {
  messages: readonly LinkerEmail[];
}): Promise<MeetingReference | null> {
  const messages = thread.messages;
  if (messages.length === 0) return null;

  // 1. ICS attachments
  for (const msg of messages) {
    const ics = findIcsAttachment(msg.attachments);
    if (ics?.content) {
      const parsed = parseIcs(ics.content);
      if (parsed) {
        const url = parsed.url;
        let platform: MeetingPlatform | undefined;
        let meetingId: string | undefined;
        if (url) {
          const inline = detectInLine(url);
          if (inline) {
            platform = inline.platform;
            meetingId = inline.meetingId;
          }
        }
        return {
          meetingId,
          meetingUrl: url,
          scheduledAt: parsed.dtstart,
          platform,
          detectedFrom: "ics_attachment",
          confidence: 0.98,
          title: parsed.summary ?? msg.subject,
        };
      }
    }
  }

  // 2. Calendar invite subject + inline link
  for (const msg of messages) {
    if (!isCalendarInviteSubject(msg.subject)) continue;
    const body = emailBodyText(msg);
    const inline = detectInLine(body);
    if (inline) {
      return {
        meetingId: inline.meetingId,
        meetingUrl: inline.url,
        scheduledAt: msg.receivedAt,
        platform: inline.platform,
        detectedFrom: "calendar_invite",
        confidence: 0.95,
        title: msg.subject?.replace(/^(invitation|updated invitation):\s*/i, ""),
      };
    }
    // Calendar invite without parseable link still counts.
    return {
      detectedFrom: "calendar_invite",
      confidence: 0.7,
      title: msg.subject?.replace(/^(invitation|updated invitation):\s*/i, ""),
      scheduledAt: msg.receivedAt,
    };
  }

  // 3. Inline link in any message — prefer the latest (most authoritative)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;
    const body = emailBodyText(msg);
    const inline = detectInLine(body);
    if (inline) {
      return {
        meetingId: inline.meetingId,
        meetingUrl: inline.url,
        scheduledAt: msg.receivedAt,
        platform: inline.platform,
        detectedFrom: "inline_link",
        confidence: 0.85,
        title: msg.subject,
      };
    }
  }

  // 4. AI-inferred (heuristic): phrase match across the thread
  const concatBody = messages.map((m) => emailBodyText(m)).join("\n");
  const matches = MEETING_INFER_PHRASES.filter((re) => re.test(concatBody)).length;
  if (matches > 0) {
    const last = messages[messages.length - 1];
    return {
      detectedFrom: "ai_inferred",
      confidence: Math.min(0.4 + matches * 0.1, 0.65),
      title: last?.subject,
      scheduledAt: last?.receivedAt,
    };
  }

  return null;
}

export const __internal = { detectInLine, parseIcs, isCalendarInviteSubject };
