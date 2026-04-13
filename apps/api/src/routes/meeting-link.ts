/**
 * Meeting Link Route — Email thread → meeting transcript link (S9)
 *
 * POST /v1/meeting-link/detect              — Detect meeting from a thread
 * POST /v1/meeting-link/fetch-transcript    — Fetch transcript for a meeting ref
 * GET  /v1/meeting-link/thread/:threadId    — Detect + fetch in one shot
 * POST /v1/meeting-link/connect-provider    — Connect Zoom/Otter/Fathom/etc.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, or, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  getValidatedBody,
} from "../middleware/validator.js";
import { getDatabase, emails } from "@alecrae/db";
import { detectMeetingFromThread } from "@alecrae/ai-engine/meetings/transcript-linker";
import {
  fetchTranscript,
  ZoomTranscriptProvider,
  OtterTranscriptProvider,
  createFathomProvider,
  createGranolaProvider,
  createReadAiProvider,
} from "@alecrae/ai-engine/meetings/transcript-fetcher";
import type {
  MeetingReference,
  TranscriptProvider,
  LinkerEmail,
} from "@alecrae/ai-engine/meetings/types";

// ─── Provider connection storage (in-memory; production: encrypted DB) ───────

interface ProviderCredentials {
  readonly provider: "zoom" | "otter" | "fathom" | "granola" | "read.ai";
  readonly accessToken: string;
  readonly connectedAt: string;
}

const providerConnections = new Map<string, ProviderCredentials[]>();

function buildProvidersFor(accountId: string): TranscriptProvider[] {
  const creds = providerConnections.get(accountId) ?? [];
  const providers: TranscriptProvider[] = [];
  for (const c of creds) {
    switch (c.provider) {
      case "zoom":
        providers.push(new ZoomTranscriptProvider({ accessToken: c.accessToken }));
        break;
      case "otter":
        providers.push(new OtterTranscriptProvider({ apiToken: c.accessToken }));
        break;
      case "fathom":
        providers.push(createFathomProvider(c.accessToken));
        break;
      case "granola":
        providers.push(createGranolaProvider(c.accessToken));
        break;
      case "read.ai":
        providers.push(createReadAiProvider(c.accessToken));
        break;
    }
  }
  return providers;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ThreadMessageSchema = z.object({
  id: z.string().optional(),
  from: z.string().optional(),
  to: z.array(z.string()).optional(),
  subject: z.string().optional(),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  receivedAt: z.coerce.date().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().optional(),
        contentType: z.string().optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
});

const DetectSchema = z.object({
  thread: z.object({
    messages: z.array(ThreadMessageSchema).min(1).max(200),
  }),
});

const MeetingRefSchema = z.object({
  meetingId: z.string().optional(),
  meetingUrl: z.string().url().optional(),
  scheduledAt: z.coerce.date().optional(),
  platform: z.enum(["zoom", "meet", "teams", "webex"]).optional(),
  detectedFrom: z.enum([
    "calendar_invite",
    "inline_link",
    "ai_inferred",
    "ics_attachment",
  ]),
  confidence: z.number().min(0).max(1),
  title: z.string().optional(),
});

const FetchSchema = z.object({
  meeting: MeetingRefSchema,
});

const ConnectProviderSchema = z.object({
  provider: z.enum(["zoom", "otter", "fathom", "granola", "read.ai"]),
  accessToken: z.string().min(8).max(4096),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

const meetingLink = new Hono();

// POST /v1/meeting-link/detect
meetingLink.post(
  "/detect",
  requireScope("messages:read"),
  validateBody(DetectSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof DetectSchema>>(c);
    const messages: LinkerEmail[] = input.thread.messages.map((m) => ({
      id: m.id,
      from: m.from,
      to: m.to,
      subject: m.subject,
      textBody: m.textBody,
      htmlBody: m.htmlBody,
      receivedAt: m.receivedAt,
      attachments: m.attachments,
    }));
    const result = await detectMeetingFromThread({ messages });
    return c.json({ data: result });
  },
);

// POST /v1/meeting-link/fetch-transcript
meetingLink.post(
  "/fetch-transcript",
  requireScope("messages:read"),
  validateBody(FetchSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof FetchSchema>>(c);
    const auth = c.get("auth");

    const providers = buildProvidersFor(auth.accountId);
    if (providers.length === 0) {
      return c.json(
        {
          error: {
            type: "no_providers",
            message:
              "No transcript providers connected. Connect one via POST /v1/meeting-link/connect-provider.",
            code: "no_providers_connected",
          },
        },
        400,
      );
    }

    const transcript = await fetchTranscript(
      input.meeting as MeetingReference,
      providers,
    );

    return c.json({ data: transcript });
  },
);

// GET /v1/meeting-link/thread/:threadId
meetingLink.get(
  "/thread/:threadId",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const threadId = c.req.param("threadId");
    if (!threadId) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "threadId is required",
            code: "missing_thread_id",
          },
        },
        400,
      );
    }

    const db = getDatabase();
    // AlecRae does not have a dedicated thread_id column — threading is derived
    // from messageId / inReplyTo / references. We accept any of: an email
    // primary key, a Message-ID header, or an inReplyTo value.
    const threadMessages = await db
      .select({
        id: emails.id,
        subject: emails.subject,
        textBody: emails.textBody,
        htmlBody: emails.htmlBody,
        from: emails.fromAddress,
        createdAt: emails.createdAt,
      })
      .from(emails)
      .where(
        and(
          eq(emails.accountId, auth.accountId),
          or(
            eq(emails.id, threadId),
            eq(emails.messageId, threadId),
            eq(emails.inReplyTo, threadId),
          ),
        ),
      )
      .orderBy(desc(emails.createdAt))
      .limit(200);

    if (threadMessages.length === 0) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Thread ${threadId} not found`,
            code: "thread_not_found",
          },
        },
        404,
      );
    }

    const linkerMessages: LinkerEmail[] = threadMessages
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        subject: m.subject ?? undefined,
        textBody: m.textBody ?? undefined,
        htmlBody: m.htmlBody ?? undefined,
        from: m.from ?? undefined,
        receivedAt: m.createdAt ?? undefined,
      }));

    const meeting = await detectMeetingFromThread({ messages: linkerMessages });
    if (!meeting) {
      return c.json({ data: { meeting: null, transcript: null } });
    }

    const providers = buildProvidersFor(auth.accountId);
    const transcript =
      providers.length > 0 ? await fetchTranscript(meeting, providers) : null;

    return c.json({ data: { meeting, transcript } });
  },
);

// POST /v1/meeting-link/connect-provider
meetingLink.post(
  "/connect-provider",
  requireScope("voice:write"),
  validateBody(ConnectProviderSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ConnectProviderSchema>>(c);
    const auth = c.get("auth");

    const existing = providerConnections.get(auth.accountId) ?? [];
    const filtered = existing.filter((e) => e.provider !== input.provider);
    filtered.push({
      provider: input.provider,
      accessToken: input.accessToken,
      connectedAt: new Date().toISOString(),
    });
    providerConnections.set(auth.accountId, filtered);

    return c.json({
      data: {
        provider: input.provider,
        connectedAt: new Date().toISOString(),
        totalProviders: filtered.length,
      },
    });
  },
);

export { meetingLink };
